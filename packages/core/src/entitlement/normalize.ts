import {
  EMPTY_ENTITLEMENT,
  type AppleRecord,
  type DuplicateInfo,
  type EntitlementDoc,
  type EntitlementSource,
  type EntitlementStatus,
  type GoogleRecord,
  type PaddleRecord,
  type SourceKey,
  type SourceRecord,
  type Sources,
  type StoreEnvironment,
} from "./types.js";

const STATUSES: readonly EntitlementStatus[] = ["none", "trialing", "active", "past_due", "canceled"];
const SOURCE_KEYS: readonly SourceKey[] = ["paddle", "apple", "google", "manual", "trial"];

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const reqStr = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const status = (value: unknown): EntitlementStatus =>
  STATUSES.includes(value as EntitlementStatus) ? (value as EntitlementStatus) : "none";
const sourceKey = (value: unknown): EntitlementSource =>
  SOURCE_KEYS.includes(value as SourceKey) ? (value as SourceKey) : null;
const environment = (value: unknown): StoreEnvironment => (value === "Sandbox" ? "Sandbox" : "Production");

const baseRecord = (raw: Raw): SourceRecord => ({
  status: status(raw.status),
  premiumUntil: str(raw.premiumUntil),
  cancelAt: str(raw.cancelAt),
  currentPeriodEnd: str(raw.currentPeriodEnd),
  autoRenew: raw.autoRenew === true,
  startedAt: str(raw.startedAt),
  updatedAt: str(raw.updatedAt) ?? "",
});

const normalizeSources = (raw: Raw): Sources => {
  const sources: Sources = {};
  if (isObject(raw.paddle)) {
    const customerId = reqStr(raw.paddle.customerId);
    const subscriptionId = reqStr(raw.paddle.subscriptionId);
    if (customerId && subscriptionId) {
      const record: PaddleRecord = {
        ...baseRecord(raw.paddle),
        customerId,
        subscriptionId,
        lastWebhookEventId: str(raw.paddle.lastWebhookEventId),
        lastEventOccurredAt: str(raw.paddle.lastEventOccurredAt),
      };
      sources.paddle = record;
    }
  }
  if (isObject(raw.apple)) {
    const originalTransactionId = reqStr(raw.apple.originalTransactionId);
    const productId = reqStr(raw.apple.productId);
    if (originalTransactionId && productId) {
      const record: AppleRecord = {
        ...baseRecord(raw.apple),
        originalTransactionId,
        productId,
        environment: environment(raw.apple.environment),
        appAccountToken: str(raw.apple.appAccountToken),
        lastNotificationUUID: str(raw.apple.lastNotificationUUID),
        lastSignedDate: str(raw.apple.lastSignedDate),
      };
      sources.apple = record;
    }
  }
  if (isObject(raw.google)) {
    const purchaseToken = reqStr(raw.google.purchaseToken);
    const productId = reqStr(raw.google.productId);
    if (purchaseToken && productId) {
      const record: GoogleRecord = {
        ...baseRecord(raw.google),
        purchaseToken,
        productId,
        basePlanId: str(raw.google.basePlanId),
        environment: environment(raw.google.environment),
        obfuscatedAccountId: str(raw.google.obfuscatedAccountId),
        lastMessageId: str(raw.google.lastMessageId),
        lastEventTime: str(raw.google.lastEventTime),
      };
      sources.google = record;
    }
  }
  if (isObject(raw.manual)) sources.manual = baseRecord(raw.manual);
  if (isObject(raw.trial)) sources.trial = baseRecord(raw.trial);
  return sources;
};

/** `sources`가 없는 예전 문서: 최상위 필드를 그 출처 하나의 기록으로 간주한다. */
const migrateLegacy = (raw: Raw, source: EntitlementSource): Sources => {
  const common: SourceRecord = {
    status: status(raw.status),
    premiumUntil: str(raw.premiumUntil),
    cancelAt: str(raw.cancelAt),
    currentPeriodEnd: str(raw.currentPeriodEnd),
    autoRenew: false,
    startedAt: null,
    updatedAt: str(raw.updatedAt) ?? "",
  };
  const customerId = reqStr(raw.customerId);
  const subscriptionId = reqStr(raw.subscriptionId);
  const paddleIds = customerId && subscriptionId
    ? {
        customerId,
        subscriptionId,
        lastWebhookEventId: str(raw.lastWebhookEventId),
        lastEventOccurredAt: str(raw.lastEventOccurredAt),
      }
    : null;
  if (source === "paddle") {
    if (!paddleIds) return {};
    // 해지된 예전 구독은 cancelAt이 없어도 갱신되지 않는다.
    return { paddle: { ...common, autoRenew: common.cancelAt === null && common.status !== "canceled", ...paddleIds } };
  }
  // 예전 부여 스크립트·체험은 Paddle 구독자 문서 위에 source만 바꿔 덮었다. Paddle id가 남아 있으면 권한 없는
  // Paddle 기록으로 함께 옮긴다 — 안 그러면 첫 쓰기에서 id가 영영 사라져 포털·같은 고객 결제·남의/낡은 이벤트
  // 판정이 꺼진다. 권한은 주지 않고(premiumUntil null) 다음 실제 Paddle 이벤트가 이 기록을 대신한다.
  const paddle: Sources = paddleIds
    ? {
        paddle: {
          status: "canceled",
          premiumUntil: null,
          cancelAt: null,
          currentPeriodEnd: common.currentPeriodEnd,
          autoRenew: false,
          startedAt: null,
          updatedAt: common.updatedAt,
          ...paddleIds,
        },
      }
    : {};
  if (source === "trial" || source === "manual") return { ...paddle, [source]: common };
  // source null: Paddle id만 보존한다. apple·google은 예전 문서에 존재할 수 없다.
  return paddle;
};

/** Firestore에서 읽은 임의의 값을 EntitlementDoc으로. 잘못된 필드는 기본값, 예전 문서는 sources로 이주. */
export const normalizeEntitlement = (data: unknown): EntitlementDoc => {
  if (!isObject(data)) return { ...EMPTY_ENTITLEMENT, sources: {} };
  const source = sourceKey(data.source);
  const sources = isObject(data.sources) ? normalizeSources(data.sources) : migrateLegacy(data, source);
  const dup = data.duplicate;
  const duplicate: DuplicateInfo | null =
    isObject(dup) &&
    (dup.laterSource === "paddle" || dup.laterSource === "apple" || dup.laterSource === "google") &&
    typeof dup.detectedAt === "string"
      ? { laterSource: dup.laterSource, detectedAt: dup.detectedAt }
      : null;
  return {
    plan: data.plan === "premium" ? "premium" : "free",
    status: status(data.status),
    source,
    premiumUntil: str(data.premiumUntil),
    trialUsedAt: str(data.trialUsedAt),
    cancelAt: str(data.cancelAt),
    currentPeriodEnd: str(data.currentPeriodEnd),
    customerId: str(data.customerId),
    subscriptionId: str(data.subscriptionId),
    lastWebhookEventId: str(data.lastWebhookEventId),
    lastEventOccurredAt: str(data.lastEventOccurredAt),
    updatedAt: str(data.updatedAt) ?? "",
    sources,
    duplicate,
  };
};
