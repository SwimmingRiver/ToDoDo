export interface PlaySubscriptionLineItem {
  productId: string;
  expiryTime: string;
  autoRenewEnabled: boolean;
  basePlanId: string | null;
  offerId: string | null;
  inFreeTrial: boolean;
}

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
  if (!Array.isArray(raw.lineItems) || raw.lineItems.length === 0) {
    throw new Error("Play 응답에 lineItems가 없습니다");
  }
  const lineItems = raw.lineItems.map((item): PlaySubscriptionLineItem => {
    if (!isObj(item)) throw new Error("Play 응답 lineItems 항목이 객체가 아닙니다");
    const plan = isObj(item.autoRenewingPlan) ? item.autoRenewingPlan : null;
    const offer = isObj(item.offerDetails) ? item.offerDetails : null;
    const phase = isObj(item.offerPhase) ? item.offerPhase : null;
    return {
      productId: requireStr(item, "productId"),
      expiryTime: requireStr(item, "expiryTime"),
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
