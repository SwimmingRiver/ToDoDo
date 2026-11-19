import { type EntitlementDoc } from "./types.js";
export declare const isPremiumAt: (doc: Pick<EntitlementDoc, "premiumUntil">, now: Date) => boolean;
/** 커스텀 클레임 premiumUntil 값(epoch 초). null은 0 = 비프리미엄. */
export declare const toClaimSeconds: (premiumUntil: string | null) => number;
/** 자동 갱신 중인 스토어 구독(apple → google 순). 계정 삭제 전 경고에 쓴다. */
export declare const hasAutoRenewingStoreSubscription: (doc: EntitlementDoc, now: Date) => "apple" | "google" | null;
/** 출처별 기록을 최상위 필드로 합친다. 규칙은 설계 스펙 1절. updatedAt·trialUsedAt은 건드리지 않는다. */
export declare const aggregate: (doc: EntitlementDoc, now: Date) => EntitlementDoc;
