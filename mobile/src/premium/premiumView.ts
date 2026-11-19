import { isPremiumAt, type EntitlementDoc } from "@tododo/core/dist/entitlement/index.js";

type Store = "apple" | "google";

export type MobilePremiumView =
  | { kind: "offer"; withTrial: boolean }
  | { kind: "store"; store: Store; until: string | null; canceling: boolean }
  | { kind: "external"; until: string | null }
  | { kind: "granted"; until: string | null }
  | { kind: "trialing"; until: string | null }
  | { kind: "pastDue"; store: Store | null };

const isRetryingStore = (doc: EntitlementDoc, key: Store): boolean => {
  const record = doc.sources[key];
  return record !== undefined && record.status === "past_due" && record.autoRenew && record.cancelAt === null;
};

/**
 * 앱 프리미엄 화면의 모양을 고른다. 대표 출처가 스토어면 앱에서 관리·해지할 수 있고,
 * paddle·manual은 보여주기만 한다(앱 안에서 웹 결제를 언급·연결하지 않는다 — Apple 3.1.1/3.1.3).
 * 체험은 계정 기준(trialUsedAt)과 스토어 자격이 모두 맞아야 권한다.
 */
export const getMobilePremiumView = (
  doc: EntitlementDoc | undefined,
  nowMs: number,
  trialEligible: boolean,
): MobilePremiumView => {
  if (!doc || !isPremiumAt(doc, new Date(nowMs))) {
    // 스토어 결제 재시도·보류(Apple status 3·Google ON_HOLD/PAUSED)는 premiumUntil이 지금이라 프리미엄이 아니지만
    // 스토어가 계속 청구를 시도한다. 새 구매를 권하지 않고 결제 수단 확인 + 스토어 관리를 보여준다(스펙 8절).
    const retrying = doc ? (["apple", "google"] as const).find((key) => isRetryingStore(doc, key)) : undefined;
    if (retrying) return { kind: "pastDue", store: retrying };
    return { kind: "offer", withTrial: doc?.trialUsedAt == null && trialEligible };
  }
  const store: Store | null = doc.source === "apple" || doc.source === "google" ? doc.source : null;
  if (doc.status === "past_due") return { kind: "pastDue", store };
  if (store) return { kind: "store", store, until: doc.premiumUntil, canceling: doc.cancelAt !== null };
  if (doc.source === "trial") return { kind: "trialing", until: doc.premiumUntil };
  // 운영자 부여(manual)는 다른 기기·웹에서 관리하는 구독이 아니라 별도 문구를 쓴다.
  if (doc.source === "manual") return { kind: "granted", until: doc.premiumUntil };
  return { kind: "external", until: doc.premiumUntil };
};

const STORE_NAME: Record<Store, string> = { apple: "App Store", google: "Google Play" };
export const storeName = (store: Store): string => STORE_NAME[store];

/**
 * 같은 계정이 두 군데서 결제될 때의 안내. 나중에 시작한 구독이 현재 기기의 스토어일 때만 띄운다 —
 * 해지할 곳이 앱에서 열 수 있는 스토어여야 하고, 웹(paddle) 해지를 안내하면 3.1.3 위험이 있다.
 */
export const duplicateNotice = (doc: EntitlementDoc | undefined, platform: "ios" | "android"): string | null => {
  const later = doc?.duplicate?.laterSource;
  const own: Store = platform === "ios" ? "apple" : "google";
  if (later !== own) return null;
  return `구독이 두 군데서 결제되고 있어요. 나중에 시작한 ${STORE_NAME[own]} 구독을 해지해 주세요`;
};
