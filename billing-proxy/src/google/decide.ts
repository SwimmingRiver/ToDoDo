/**
 * Google Play 구독 스냅샷 → sources.google 결정. 순수 함수만 둔다(I/O 없음).
 * RTDN 종류가 아니라 subscriptionsv2 조회로 얻은 "지금의 상태 전체"를 받아 계산하므로
 * 알림이 순서 없이 와도 가장 최신 스냅샷 하나만 반영하면 정확하다. 규칙은 설계 스펙 4·5절.
 */
import {
  RENEWAL_GRACE_MS,
  aggregate,
  type EntitlementDoc,
  type GoogleRecord,
} from "@tododo/core/dist/entitlement/index.js";
import type { Decision } from "../entitlement";
import type { PlaySubscription, PlaySubscriptionLineItem } from "./playApi";

/** verify 호출은 Pub/Sub 메시지가 없으므로 messageId·eventTime이 null이고, 그 경우 항상 반영한다. */
export interface GoogleEvent {
  purchaseToken: string;
  messageId: string | null;
  eventTime: string | null;
}

export type GoogleSkip = "STALE" | "DUPLICATE_MESSAGE" | "PENDING" | "OTHER_SUBSCRIPTION";

const PRODUCT_ID = "premium_monthly";
const iso = (ms: number): string => new Date(ms).toISOString();

type StateFields = Pick<GoogleRecord, "status" | "premiumUntil" | "cancelAt">;

const pickLineItem = (sub: PlaySubscription): PlaySubscriptionLineItem | undefined =>
  sub.lineItems.find((item) => item.productId === PRODUCT_ID) ?? sub.lineItems[0];

const requireExpiry = (item: PlaySubscriptionLineItem | undefined, state: string): number => {
  // 만료 시각 없는 활성 계열 상태는 이상 응답이다. 조용히 권한을 회수하지 않고 던져서 재시도·알림되게 한다.
  if (!item || item.expiryTime === null) throw new Error(`Play 구독 ${state}에 만료 시각이 없습니다`);
  const ms = Date.parse(item.expiryTime);
  if (Number.isNaN(ms)) throw new Error(`Play 구독 만료 시각을 해석할 수 없습니다: ${item.expiryTime}`);
  return ms;
};

const decideState = (
  sub: PlaySubscription,
  item: PlaySubscriptionLineItem | undefined,
  previousPremiumUntil: string | null,
  nowIso: string,
): StateFields => {
  const state = sub.subscriptionState;
  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
    case "SUBSCRIPTION_STATE_CANCELED": {
      const expiry = requireExpiry(item, state);
      // CANCELED는 이미 낸 기간 끝까지 이용 가능. 자동 갱신이 꺼졌으면(ACTIVE여도) 유예 없이 만료 시각 그대로.
      const autoRenew = state === "SUBSCRIPTION_STATE_ACTIVE" && item?.autoRenewEnabled === true;
      return {
        status: item?.inFreeTrial ? "trialing" : "active",
        premiumUntil: iso(autoRenew ? expiry + RENEWAL_GRACE_MS : expiry),
        cancelAt: autoRenew ? null : iso(expiry),
      };
    }
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD": {
      const expiry = requireExpiry(item, state);
      const candidates = [expiry + RENEWAL_GRACE_MS, ...(previousPremiumUntil ? [Date.parse(previousPremiumUntil)] : [])];
      return { status: "past_due", premiumUntil: iso(Math.max(...candidates)), cancelAt: null };
    }
    case "SUBSCRIPTION_STATE_ON_HOLD":
      requireExpiry(item, state);
      return { status: "past_due", premiumUntil: nowIso, cancelAt: null };
    case "SUBSCRIPTION_STATE_PAUSED":
    case "SUBSCRIPTION_STATE_EXPIRED":
    case "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED":
      return { status: "canceled", premiumUntil: nowIso, cancelAt: null };
    default:
      throw new Error(`알 수 없는 Play 구독 상태: ${state}`);
  }
};

export const applyGoogleSubscription = (
  existing: EntitlementDoc,
  sub: PlaySubscription,
  ev: GoogleEvent,
  now: Date,
): Decision<GoogleSkip> => {
  // 결제 대기 중에는 아무 기간도 시작되지 않았다. 라인 아이템 유무와 무관하게 건너뛴다.
  if (sub.subscriptionState === "SUBSCRIPTION_STATE_PENDING") return { skip: "PENDING" };

  const previous = existing.sources.google;
  if (previous) {
    if (ev.messageId !== null && previous.lastMessageId === ev.messageId) return { skip: "DUPLICATE_MESSAGE" };
    // Pub/Sub 이벤트 시각은 구독 체인(linked 토큰 포함) 안에서 단조 증가하므로 토큰이 달라도 비교한다.
    if (ev.eventTime !== null && previous.lastEventTime !== null && Date.parse(ev.eventTime) <= Date.parse(previous.lastEventTime)) {
      return { skip: "STALE" };
    }
    // 기록은 구독 하나만 추적한다. 유효한 다른 구독이 있으면 덮어 권한을 지우지 않는다.
    // 단 linkedPurchaseToken이 기존 토큰이면 업그레이드·재구독이므로 교체한다.
    const valid = previous.premiumUntil !== null && Date.parse(previous.premiumUntil) > now.getTime() && previous.status !== "canceled";
    if (previous.purchaseToken !== ev.purchaseToken && valid && sub.linkedPurchaseToken !== previous.purchaseToken) {
      return { skip: "OTHER_SUBSCRIPTION" };
    }
  }

  const nowIso = now.toISOString();
  const item = pickLineItem(sub);
  // 같은 토큰이거나 linkedPurchaseToken으로 이어진 교체 토큰이면 기존 기록의 기간을 이어받는다.
  const continues = previous !== undefined && (previous.purchaseToken === ev.purchaseToken || sub.linkedPurchaseToken === previous.purchaseToken);
  const fields = decideState(sub, item, continues ? (previous?.premiumUntil ?? null) : null, nowIso);
  const canceled = fields.status === "canceled";

  const record: GoogleRecord = {
    ...fields,
    currentPeriodEnd: item?.expiryTime ?? null,
    // 유예·보류 중에도 Google은 결제를 재시도하므로 갱신 중으로 본다(탈퇴 경고·중복 감지가 놓치지 않게). 해지·종료만 false.
    autoRenew: canceled || sub.subscriptionState === "SUBSCRIPTION_STATE_CANCELED" ? false : item?.autoRenewEnabled === true,
    startedAt: sub.startTime,
    updatedAt: nowIso,
    purchaseToken: ev.purchaseToken,
    productId: item?.productId ?? PRODUCT_ID,
    basePlanId: item?.basePlanId ?? null,
    environment: sub.testPurchase ? "Sandbox" : "Production",
    obfuscatedAccountId: sub.obfuscatedAccountId,
    lastMessageId: ev.messageId,
    lastEventTime: ev.eventTime,
  };
  // 무료 체험을 한 번이라도 시작했으면 상태와 무관하게 사용한 것으로 센다. 이미 있으면 보존한다.
  const trialUsedAt = existing.trialUsedAt === null && item?.inFreeTrial ? nowIso : existing.trialUsedAt;
  return {
    write: aggregate({ ...existing, sources: { ...existing.sources, google: record }, trialUsedAt, updatedAt: nowIso }, now),
  };
};
