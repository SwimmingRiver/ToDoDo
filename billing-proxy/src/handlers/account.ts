import { commitEntitlement } from "../commit";
import { applyTrial, isPremiumAt } from "../entitlement";
import type { BillingDeps } from "../router";
import type { VerifiedToken } from "@tododo/worker-auth";
import { trialIdentityKeys } from "../trialHistory";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const handleCheckout = async (uid: string, deps: BillingDeps, now: Date): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  const paddle = doc.sources.paddle;
  // 살아 있는 구독 위에 또 결제하면 이중 청구된다. 해지 예약 상태도 포털에서 "해지 취소"로 되살린다.
  // 대표 출처가 아니라 Paddle 기록으로 본다 — Apple 만료가 더 늦어 대표가 apple이어도 Paddle 구독은 살아 있다.
  if (paddle && paddle.status !== "canceled" && isPremiumAt(paddle, now)) {
    return json({ error: "ALREADY_SUBSCRIBED" }, 409);
  }
  // 예전 Paddle 고객으로 결제를 묶어야 포털에서 구독 이력이 한곳에 보인다.
  const transactionId = await deps.paddle.createCheckoutTransaction(uid, paddle?.customerId ?? null);
  return json({ transactionId });
};

/**
 * 탈퇴 전에 체험을 쓴 같은 Google·Apple 계정이면(만료 전 체험 사용 확인값) 거절한다.
 * 조회 실패는 거절하지 않는다 — 장애로 처음 온 사용자가 막히는 쪽이 더 나쁘다.
 */
const usedTrialBeforeDeletion = async (
  uid: string,
  deps: BillingDeps,
  identities: VerifiedToken["identities"],
  now: Date,
): Promise<boolean> => {
  if (!deps.trialHistory) return false;
  try {
    const keys = await trialIdentityKeys(deps.trialHistory.secret, identities);
    return await deps.trialHistory.store.hasActive(keys.map((k) => k.key), now);
  } catch (error) {
    console.error("체험 사용 확인값 조회 실패(체험은 계속):", uid, error);
    return false;
  }
};

export const handleTrial = async (
  uid: string,
  deps: BillingDeps,
  now: Date,
  identities: VerifiedToken["identities"] = {},
): Promise<Response> => {
  if (await usedTrialBeforeDeletion(uid, deps, identities, now)) return json({ error: "TRIAL_ALREADY_USED" }, 409);
  const outcome = await commitEntitlement(deps, uid, (existing) => applyTrial(existing, now));
  if (outcome.kind === "skipped") return json({ error: outcome.reason }, 409);
  return json({ premiumUntil: outcome.doc.premiumUntil });
};

export const handlePortal = async (uid: string, deps: BillingDeps): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  if (!doc.customerId) return json({ error: "NO_CUSTOMER" }, 404);
  return json({ url: await deps.paddle.createPortalUrl(doc.customerId, doc.subscriptionId) });
};
