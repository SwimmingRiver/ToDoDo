import { commitEntitlement } from "../commit";
import { applyTrial, isPremiumAt } from "../entitlement";
import type { BillingDeps } from "../router";
import type { VerifiedToken } from "@tododo/worker-auth";
import { attachTrialIdentities, trialKeysFor, type TrialIdentityKey } from "../trialHistory";

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
 * 지금 토큰의 로그인 계정 키. 탈퇴 전 체험 기록 조회와 "체험 당시 계정" 메모에 같이 쓴다.
 * 계산이 실패하면 빈 목록으로 진행한다 — 장애로 처음 온 사용자가 막히는 쪽이 더 나쁘다(조회 실패와 같은 원칙).
 */
const currentTrialKeys = async (
  uid: string,
  deps: BillingDeps,
  identities: VerifiedToken["identities"],
): Promise<TrialIdentityKey[]> => {
  try {
    return await trialKeysFor(deps.trialHistory, identities);
  } catch (error) {
    console.error("체험 로그인 계정 키 계산 실패(체험은 계속):", uid, error);
    return [];
  }
};

/**
 * 탈퇴 전에 체험을 쓴 같은 Google·Apple 계정이면(만료 전 체험 사용 확인값) 거절한다.
 * 조회 실패는 거절하지 않는다 — 장애로 처음 온 사용자가 막히는 쪽이 더 나쁘다.
 */
const usedTrialBeforeDeletion = async (
  uid: string,
  deps: BillingDeps,
  keys: readonly TrialIdentityKey[],
  now: Date,
): Promise<boolean> => {
  if (!deps.trialHistory) return false;
  try {
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
  // 기록 조회는 기존 판정으로 체험이 가능한 계정에만 한다 — 이미 체험했거나 구독 중이면 원래 거절 사유를
  // 그대로 돌려주고, 대부분의 요청에서 Firestore 조회를 아낀다.
  const { doc } = await deps.store.get(uid);
  const keys = await currentTrialKeys(uid, deps, identities);
  if (!("skip" in applyTrial(doc, now)) && (await usedTrialBeforeDeletion(uid, deps, keys, now))) {
    return json({ error: "TRIAL_ALREADY_USED" }, 409);
  }
  const outcome = await commitEntitlement(deps, uid, (existing) =>
    attachTrialIdentities(existing, applyTrial(existing, now), keys, now),
  );
  if (outcome.kind === "skipped") return json({ error: outcome.reason }, 409);
  return json({ premiumUntil: outcome.doc.premiumUntil });
};

export const handlePortal = async (uid: string, deps: BillingDeps): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  if (!doc.customerId) return json({ error: "NO_CUSTOMER" }, 404);
  return json({ url: await deps.paddle.createPortalUrl(doc.customerId, doc.subscriptionId) });
};
