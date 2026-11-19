/**
 * Apple 구독 스냅샷 → sources.apple 결정. 순수 함수만 둔다(I/O 없음).
 * 알림 종류(type/subtype)가 아니라 "지금의 구독 상태 전체"를 받아 계산하므로 알림이 순서 없이 와도
 * 가장 최신 스냅샷 하나만 반영하면 정확하다. 규칙은 설계 스펙 4·5절.
 */
import {
  RENEWAL_GRACE_MS,
  aggregate,
  type AppleRecord,
  type EntitlementDoc,
} from "@tododo/core/dist/entitlement/index.js";
import type { Decision } from "../entitlement";

/** 날짜는 모두 epoch 밀리초(Apple 서명 페이로드 그대로). 저장할 때만 ISO로 바꾼다. */
export interface AppleTransaction {
  originalTransactionId: string;
  transactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate: number;
  environment: "Production" | "Sandbox";
  appAccountToken?: string;
  offerType?: number;
  offerDiscountType?: string;
  revocationDate?: number;
}

export interface AppleRenewalInfo {
  autoRenewStatus: 0 | 1;
  gracePeriodExpiresDate?: number;
}

export interface AppleSnapshot {
  /** 1=active 2=expired 3=billing retry 4=grace 5=revoked */
  status: 1 | 2 | 3 | 4 | 5;
  transaction: AppleTransaction;
  renewal: AppleRenewalInfo | null;
  notificationUUID: string | null;
  signedDate: number | null;
}

export type AppleSkip = "STALE" | "DUPLICATE_NOTIFICATION" | "OTHER_SUBSCRIPTION";

const iso = (ms: number): string => new Date(ms).toISOString();

/** offerType 1 = 소개 혜택(introductory). 무료 체험만 체험으로 본다(유료 소개 가격은 일반 구독). */
const isFreeTrial = (tx: AppleTransaction): boolean => tx.offerType === 1 && tx.offerDiscountType === "FREE_TRIAL";

const nextAppleRecord = (previous: AppleRecord | undefined, snap: AppleSnapshot, now: Date): AppleRecord => {
  const { transaction: tx, renewal } = snap;
  const nowIso = now.toISOString();
  const autoRenew = renewal?.autoRenewStatus === 1;
  const expiresIso = iso(tx.expiresDate);
  const periodPlusGrace = iso(tx.expiresDate + RENEWAL_GRACE_MS);

  const state = ((): Pick<AppleRecord, "status" | "premiumUntil" | "cancelAt"> => {
    // 환불·취소는 상태 코드와 무관하게 이용을 즉시 회수한다.
    if (tx.revocationDate !== undefined) return { status: "canceled", premiumUntil: nowIso, cancelAt: null };
    switch (snap.status) {
      case 1:
        // 자동 갱신을 끄면 이미 낸 기간까지만 — 유예 없이 만료 시각 그대로.
        return {
          status: isFreeTrial(tx) ? "trialing" : "active",
          premiumUntil: autoRenew ? periodPlusGrace : expiresIso,
          cancelAt: autoRenew ? null : expiresIso,
        };
      case 4: {
        const graceEnd = renewal?.gracePeriodExpiresDate;
        const candidates = [
          previous?.premiumUntil ?? null,
          graceEnd !== undefined ? iso(graceEnd + RENEWAL_GRACE_MS) : periodPlusGrace,
        ]
          .filter((value): value is string => value !== null)
          .map((value) => Date.parse(value));
        return { status: "past_due", premiumUntil: iso(Math.max(...candidates)), cancelAt: null };
      }
      case 3:
        // 유예 없는 결제 재시도: 이용 중지, 재결제되면 다음 스냅샷으로 복귀한다.
        return { status: "past_due", premiumUntil: nowIso, cancelAt: null };
      case 2:
      case 5:
        return { status: "canceled", premiumUntil: nowIso, cancelAt: null };
    }
  })();

  return {
    ...state,
    currentPeriodEnd: expiresIso,
    autoRenew,
    startedAt: iso(tx.originalPurchaseDate),
    updatedAt: nowIso,
    originalTransactionId: tx.originalTransactionId,
    productId: tx.productId,
    environment: tx.environment,
    appAccountToken: tx.appAccountToken ?? null,
    lastNotificationUUID: snap.notificationUUID,
    lastSignedDate: snap.signedDate === null ? (previous?.lastSignedDate ?? null) : iso(snap.signedDate),
  };
};

export const applyAppleSnapshot = (existing: EntitlementDoc, snap: AppleSnapshot, now: Date): Decision<AppleSkip> => {
  const previous = existing.sources.apple;

  if (previous) {
    if (snap.notificationUUID !== null && previous.lastNotificationUUID === snap.notificationUUID) {
      return { skip: "DUPLICATE_NOTIFICATION" };
    }
    if (
      snap.signedDate !== null &&
      previous.lastSignedDate !== null &&
      snap.signedDate <= Date.parse(previous.lastSignedDate)
    ) {
      return { skip: "STALE" };
    }
  }

  // 기록은 구독 하나만 추적한다. 유효한 다른 구독(originalTransactionId가 다름)이 기록을 덮으면 남은 기간을 지울 수 있다.
  const foreign =
    previous !== undefined &&
    previous.originalTransactionId !== snap.transaction.originalTransactionId &&
    previous.premiumUntil !== null &&
    Date.parse(previous.premiumUntil) > now.getTime() &&
    previous.status !== "canceled";
  // 계속 갱신 중인 기록은 다른 구독이 덮지 않는다(이중 구독).
  if (foreign && previous.autoRenew && previous.cancelAt === null) return { skip: "OTHER_SUBSCRIPTION" };

  const nowIso = now.toISOString();
  const record = nextAppleRecord(foreign ? undefined : previous, snap, now);
  // 해지 예약·자동 갱신 꺼진 기록은 새 구독(해지 예약 뒤 재구독)이 이어받을 수 있다 — 단 새 구독이 실제로 권한을
  // 주고 기존 기록보다 늦게 끝날 때만(Google과 같은 규칙). 끝난·환불된 다른 구독의 알림이 남은 기간을 지우지 않게 한다.
  if (foreign) {
    const grantsLonger =
      record.status !== "canceled" &&
      record.premiumUntil !== null &&
      Date.parse(record.premiumUntil) > Date.parse(previous.premiumUntil!);
    if (!grantsLonger) return { skip: "OTHER_SUBSCRIPTION" };
  }
  // 무료 체험 거래는 결과 상태(만료·환불 포함)와 무관하게 체험을 쓴 것으로 센다 — 처음 본 거래가 이미 끝난
  // 체험이어도 마찬가지다. 이미 있으면 보존한다(체험 구매는 trialUsedAt이 있어도 막지 않고 반영한다).
  const trialUsedAt = existing.trialUsedAt === null && isFreeTrial(snap.transaction) ? nowIso : existing.trialUsedAt;
  return {
    write: aggregate({ ...existing, sources: { ...existing.sources, apple: record }, trialUsedAt, updatedAt: nowIso }, now),
  };
};
