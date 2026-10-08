import type { Entitlement } from "@/features/entitlement/types";
import { isPremiumEntitlement } from "@/features/entitlement/utils/isPremiumEntitlement";

export type PremiumView =
  | { kind: "offer"; canTrial: boolean }
  | { kind: "trialing"; until: Date; daysLeft: number }
  | { kind: "active"; nextBillingAt: Date | null; canManage: boolean }
  | { kind: "canceling"; until: Date }
  | { kind: "pastDue" };

const DAY_MS = 86_400_000;

export const getPremiumView = (entitlement: Entitlement, nowMs: number): PremiumView => {
  // 결제 실패는 이용 가능 여부와 무관하게 결제 수단 변경을 먼저 안내한다.
  if (entitlement.status === "past_due") return { kind: "pastDue" };
  if (!isPremiumEntitlement(entitlement, nowMs)) return { kind: "offer", canTrial: entitlement.trialUsedAt === null };

  const until = new Date(entitlement.premiumUntil as string);
  if (entitlement.status === "trialing") {
    return { kind: "trialing", until, daysLeft: Math.ceil((until.getTime() - nowMs) / DAY_MS) };
  }
  if (entitlement.cancelAt) return { kind: "canceling", until: new Date(entitlement.cancelAt) };
  return {
    kind: "active",
    nextBillingAt: entitlement.currentPeriodEnd ? new Date(entitlement.currentPeriodEnd) : null,
    canManage: entitlement.customerId !== null,
  };
};

/** 로컬 게터로 표시한다 — UTC 문자열을 잘라 쓰면 KST에서 하루 밀린다. */
export const formatMonthDay = (date: Date): string => `${date.getMonth() + 1}월 ${date.getDate()}일`;
