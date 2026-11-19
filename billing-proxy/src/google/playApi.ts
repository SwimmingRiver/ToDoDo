export interface PlaySubscriptionLineItem {
  productId: string;
  /** PENDING 등 아직 기간이 시작되지 않은 상태에서는 Google이 생략한다. */
  expiryTime: string | null;
  autoRenewEnabled: boolean;
  basePlanId: string | null;
  offerId: string | null;
  inFreeTrial: boolean;
}

/** lineItems는 PENDING_PURCHASE_CANCELED 등에서 비어 있을 수 있다. */
export interface PlaySubscription {
  subscriptionState: string;
  startTime: string | null;
  linkedPurchaseToken: string | null;
  acknowledgementState: string;
  testPurchase: boolean;
  obfuscatedAccountId: string | null;
  lineItems: PlaySubscriptionLineItem[];
}

const API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const optStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

const requireStr = (obj: Json, key: string): string => {
  const v = obj[key];
  if (typeof v !== "string" || v === "") throw new Error(`Play 응답에 ${key}가 없습니다`);
  return v;
};

// 응답 모양이 바뀌면 조용히 틀린 권한을 주기보다 바로 실패해서 알림이 재시도되게 한다.
const parseSubscription = (raw: unknown): PlaySubscription => {
  if (!isObj(raw)) throw new Error("Play 응답이 객체가 아닙니다");
  const rawItems = raw.lineItems === undefined ? [] : raw.lineItems;
  if (!Array.isArray(rawItems)) throw new Error("Play 응답 lineItems가 배열이 아닙니다");
  const lineItems = rawItems.map((item): PlaySubscriptionLineItem => {
    if (!isObj(item)) throw new Error("Play 응답 lineItems 항목이 객체가 아닙니다");
    const plan = isObj(item.autoRenewingPlan) ? item.autoRenewingPlan : null;
    const offer = isObj(item.offerDetails) ? item.offerDetails : null;
    const phase = isObj(item.offerPhase) ? item.offerPhase : null;
    return {
      productId: requireStr(item, "productId"),
      expiryTime: optStr(item.expiryTime),
      autoRenewEnabled: plan?.autoRenewEnabled === true,
      basePlanId: optStr(offer?.basePlanId),
      offerId: optStr(offer?.offerId),
      inFreeTrial: isObj(phase?.freeTrial),
    };
  });
  const ids = isObj(raw.externalAccountIdentifiers) ? raw.externalAccountIdentifiers : null;
  return {
    subscriptionState: requireStr(raw, "subscriptionState"),
    startTime: optStr(raw.startTime),
    linkedPurchaseToken: optStr(raw.linkedPurchaseToken),
    acknowledgementState: requireStr(raw, "acknowledgementState"),
    testPurchase: isObj(raw.testPurchase),
    obfuscatedAccountId: optStr(ids?.obfuscatedExternalAccountId),
    lineItems,
  };
};

/** 아직 Google이 다음 결제를 시도할 수 있는 상태. 이 밖(CANCELED·EXPIRED·PENDING 등)은 해지할 것이 없다. */
const RENEWABLE_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_ON_HOLD",
  "SUBSCRIPTION_STATE_PAUSED",
]);

const isStillRenewing = (sub: PlaySubscription): boolean =>
  RENEWABLE_STATES.has(sub.subscriptionState) && sub.lineItems.some((item) => item.autoRenewEnabled);

export class PlayApi {
  constructor(
    private readonly packageName: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 담으면 Workers에서 Illegal invocation이 나므로 감싼다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  /** 구매 토큰을 모르거나 만료·삭제됐으면(404·410) null. */
  async getSubscription(purchaseToken: string): Promise<PlaySubscription | null> {
    const url = `${API_BASE}/${encodeURIComponent(this.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await this.fetchFn(url, { headers: { Authorization: `Bearer ${await this.getToken()}` } });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`Play 구독 조회 실패: ${res.status}`);
    return parseSubscription(await res.json());
  }

  /**
   * 탈퇴 시 자동 갱신을 끈다. revoke(환불+즉시 종료)가 아니라 cancel(다음 결제 중지)이다.
   * 취소 유형은 DEVELOPER_REQUESTED_STOP_PAYMENTS — 계정이 사라지므로 사용자가 되살릴 수 있는
   * USER_REQUESTED_STOP_RENEWALS가 아니라 개발자 요청(복원 불가)으로 보낸다(2026-11 API 문서 확인).
   *
   * "이미 해지·만료됨" 오류의 상태 코드·reason은 문서에 없다(미확인). 그래서 reason 문자열에 기대지 않고,
   * 인증·일시 오류가 아닌 4xx로 거절되면 구독을 다시 조회해 더 이상 갱신되지 않을 때만 already_inactive로 본다.
   * 여전히 갱신 중이면 던진다 — 탈퇴가 멈추는 쪽(fail-closed)이 청구가 계속되는 쪽보다 낫다.
   */
  async cancelSubscription(purchaseToken: string): Promise<"canceled" | "already_inactive"> {
    const url = `${API_BASE}/${encodeURIComponent(this.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}:cancel`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cancellationContext: { cancellationType: "DEVELOPER_REQUESTED_STOP_PAYMENTS" } }),
    });
    if (res.ok) return "canceled";
    const retryable = res.status >= 500 || res.status === 401 || res.status === 403 || res.status === 429;
    if (!retryable && res.status >= 400) {
      const current = await this.getSubscription(purchaseToken);
      if (current === null || !isStillRenewing(current)) return "already_inactive";
    }
    throw new Error(`Play 구독 해지 실패: ${res.status}`);
  }

  async acknowledge(productId: string, purchaseToken: string): Promise<void> {
    const url = `${API_BASE}/${encodeURIComponent(this.packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.getToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error(`Play 구매 승인 실패: ${res.status}`);
  }
}
