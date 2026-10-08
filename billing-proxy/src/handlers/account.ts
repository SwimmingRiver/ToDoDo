import { commitEntitlement } from "../commit";
import { applyTrial, isPremiumAt } from "../entitlement";
import type { BillingDeps } from "../router";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const handleCheckout = async (uid: string, deps: BillingDeps, now: Date): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  // 살아 있는 구독 위에 또 결제하면 이중 청구된다. 해지 예약 상태도 포털에서 "해지 취소"로 되살린다.
  if (doc.source === "paddle" && doc.status !== "canceled" && isPremiumAt(doc, now)) {
    return json({ error: "ALREADY_SUBSCRIBED" }, 409);
  }
  const transactionId = await deps.paddle.createCheckoutTransaction(uid, doc.customerId);
  return json({ transactionId });
};

export const handleTrial = async (uid: string, deps: BillingDeps, now: Date): Promise<Response> => {
  const outcome = await commitEntitlement(deps, uid, (existing) => applyTrial(existing, now));
  if (outcome.kind === "skipped") return json({ error: outcome.reason }, 409);
  return json({ premiumUntil: outcome.doc.premiumUntil });
};

export const handlePortal = async (uid: string, deps: BillingDeps): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  if (!doc.customerId) return json({ error: "NO_CUSTOMER" }, 404);
  return json({ url: await deps.paddle.createPortalUrl(doc.customerId, doc.subscriptionId) });
};
