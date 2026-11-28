import { createHmac } from "node:crypto";

/**
 * 체험 당시 로그인 계정 키(entitlements.trialIdentities) 1회성 백필의 판정 로직.
 * billing-proxy가 체험을 줄 때 키를 남기기 시작하기 전에 체험을 쓴 사용자에게, 지금 연결된 Google·Apple 계정으로 키를 채운다.
 * 키 형식은 billing-proxy/src/trialHistory.ts trialIdentityKeys와 같아야 한다: HMAC-SHA256(TRIAL_HMAC_SECRET, "<제공자>:<sub>")의 hex.
 */
export type TrialIdentityProvider = "google.com" | "apple.com";

export interface ProviderInfo {
  /** Firebase Auth providerData[].providerId */
  providerId: string;
  /** Firebase Auth providerData[].uid — 제공자 쪽 고유 id(sub). ID 토큰의 firebase.identities 값과 같다. */
  uid: string;
}

export interface BackfillDoc {
  uid: string;
  trialUsedAt: string | null;
  trialIdentities: Record<string, TrialIdentityProvider>;
}

export interface BackfillPlan {
  writes: { uid: string; trialIdentities: Record<string, TrialIdentityProvider> }[];
  counts: { trialed: number; alreadyComplete: number; noIdentity: number; userMissing: number };
  /**
   * verified: Worker가 남긴 키가 이 시크릿으로 하나라도 다시 만들어졌다.
   * mismatch: 대조할 문서가 둘 이상인데 하나도 안 만들어졌다(쓰기 계획을 비운다).
   * unverifiable: 대조할 Worker 기록이 없거나 하나뿐인데 안 맞는다 — 시크릿이 운영 값과 같은지 사람이 확인해야 한다.
   */
  secretCheck: "verified" | "mismatch" | "unverifiable";
}

/**
 * 4판 처리방침 시행 시각 = billing-proxy/src/trialHistory.ts TRIAL_HISTORY_START와 같아야 한다.
 * 그 전에는 회원의 로그인 계정 키를 모으지 않기로 했으므로(Worker도 같은 시각부터 남긴다) 백필 쓰기도 막는다.
 */
const BACKFILL_EARLIEST = new Date("2026-12-27T15:00:00.000Z");

export const canApplyBackfillAt = (now: Date): boolean => now.getTime() >= BACKFILL_EARLIEST.getTime();

const isTrialProvider = (id: string): id is TrialIdentityProvider => id === "google.com" || id === "apple.com";

export const trialIdentityKeyMap = (secret: string, providers: readonly ProviderInfo[]): Record<string, TrialIdentityProvider> => {
  const out: Record<string, TrialIdentityProvider> = {};
  for (const { providerId, uid } of providers) {
    if (!isTrialProvider(providerId)) continue;
    out[createHmac("sha256", secret).update(`${providerId}:${uid}`).digest("hex")] = providerId;
  }
  return out;
};

export const planTrialIdentityBackfill = (input: {
  secret: string;
  docs: readonly BackfillDoc[];
  /** null이면 Auth에 사용자가 없다(이미 탈퇴 등). */
  providersByUid: ReadonlyMap<string, readonly ProviderInfo[] | null>;
}): BackfillPlan => {
  const counts = { trialed: 0, alreadyComplete: 0, noIdentity: 0, userMissing: 0 };
  const writes: BackfillPlan["writes"] = [];
  let comparable = 0;
  let matched = 0;

  for (const doc of input.docs) {
    if (doc.trialUsedAt === null) continue;
    counts.trialed += 1;
    const providers = input.providersByUid.get(doc.uid) ?? null;
    if (providers === null) {
      counts.userMissing += 1;
      continue;
    }
    const current = trialIdentityKeyMap(input.secret, providers);
    // 시크릿 대조는 같은 제공자끼리만 한다 — 예전에 Apple로 체험하고 지금은 Google만 연결된 사용자는 원래 비교할 수 없다.
    // 같은 제공자의 다른 계정으로 바꾼 드문 경우는 불일치로 보여 쓰기를 멈춘다(안전한 쪽으로 실패).
    const currentProviders = new Set(Object.values(current));
    const comparableKeys = Object.entries(doc.trialIdentities)
      .filter(([, provider]) => currentProviders.has(provider))
      .map(([key]) => key);
    if (comparableKeys.length > 0) {
      comparable += 1;
      if (comparableKeys.some((key) => key in current)) matched += 1;
    }
    if (Object.keys(current).length === 0) {
      counts.noIdentity += 1;
      continue;
    }
    if (Object.keys(current).every((key) => key in doc.trialIdentities)) {
      counts.alreadyComplete += 1;
      continue;
    }
    writes.push({ uid: doc.uid, trialIdentities: { ...doc.trialIdentities, ...current } });
  }

  // 맞는 문서가 하나라도 있으면 시크릿이 맞다. 대조할 문서가 하나뿐이고 안 맞으면 그 사용자가 계정을 바꿨을 수도 있으니
  // 단정하지 않고 확인 불가로 둔다(--secret-confirmed 필요). 둘 이상이 모두 안 맞을 때만 틀린 시크릿으로 보고 멈춘다.
  const secretCheck = matched > 0 ? "verified" : comparable >= 2 ? "mismatch" : "unverifiable";
  return { writes: secretCheck === "mismatch" ? [] : writes, counts, secretCheck };
};
