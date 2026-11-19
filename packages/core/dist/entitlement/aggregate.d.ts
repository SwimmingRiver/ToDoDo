import { type EntitlementDoc } from "./types.js";
export declare const isPremiumAt: (doc: Pick<EntitlementDoc, "premiumUntil">, now: Date) => boolean;
/** 커스텀 클레임 premiumUntil 값(epoch 초). null은 0 = 비프리미엄. */
export declare const toClaimSeconds: (premiumUntil: string | null) => number;
/**
 * 자동 갱신 중인 스토어 구독(apple → google 순). 계정 삭제 전 경고·스토어 관리 화면에 쓴다.
 * 유효 기간은 보지 않는다 — Apple 결제 재시도·Google 보류는 premiumUntil이 지금이어도 스토어가
 * 계속 청구를 시도하므로, 이때 탈퇴하면 나중에 청구된다. 이중 구독 판정(detectDuplicate)은 그대로 유효 기간을 본다.
 */
export declare const hasAutoRenewingStoreSubscription: (doc: EntitlementDoc, _now: Date) => "apple" | "google" | null;
/** 출처별 기록을 최상위 필드로 합친다. 규칙은 설계 스펙 1절. updatedAt·trialUsedAt은 건드리지 않는다. */
export declare const aggregate: (doc: EntitlementDoc, now: Date) => EntitlementDoc;
