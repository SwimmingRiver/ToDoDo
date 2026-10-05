import { isBillingAllowed } from "../allowlist";
import { UserNotFoundError } from "../claims";
import { commitEntitlement, type CommitDeps } from "../commit";
import { applySubscriptionEvent, isForeignCancel, isStaleEvent } from "../entitlement";
import type { Env } from "../env";
import { parseWebhook } from "../paddleEvent";
import { verifyPaddleSignature } from "../signature";
import { verifyUidSignature } from "../uidSignature";

const ok = () => new Response("ok", { status: 200 });

/**
 * 200은 "다시 보내지 마"라는 뜻이다. 재전송으로 해결되지 않는 문제(uid 없음, 삭제된 사용자,
 * 형식 오류)는 로그만 남기고 200, 일시적 실패(Firestore·Auth 오류)만 예외 → 500으로 재전송을 받는다.
 */
export const handleWebhook = async (
  request: Request,
  env: Pick<Env, "PADDLE_WEBHOOK_SECRET" | "BILLING_UID_SECRET" | "BILLING_ALLOWED_UIDS">,
  deps: CommitDeps,
  now: Date,
): Promise<Response> => {
  const raw = await request.text();
  const valid = await verifyPaddleSignature(
    raw,
    request.headers.get("Paddle-Signature"),
    env.PADDLE_WEBHOOK_SECRET,
    Math.floor(now.getTime() / 1000),
  );
  if (!valid) return new Response("Invalid signature", { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = parseWebhook(body);
  if (parsed.kind === "ignored") return ok();
  if (parsed.kind === "invalid") {
    console.error("Paddle 웹훅 형식 오류:", parsed.reason);
    return ok();
  }
  if (parsed.uid === null) {
    console.error("Paddle 웹훅에 custom_data.uid 없음:", parsed.event.subscriptionId);
    return ok();
  }

  const { uid, uidSig, event } = parsed;
  // Paddle 서명은 "Paddle이 보냈다"만 보장한다. custom_data는 결제창을 연 쪽이 넣을 수 있으므로
  // /checkout이 붙인 서버 서명이 맞는 uid만 반영한다.
  if (!(await verifyUidSignature(uid, uidSig, env.BILLING_UID_SECRET))) {
    console.error("Paddle 웹훅 uid 서명 불일치(서버가 만들지 않은 결제):", uid, event.subscriptionId);
    return ok();
  }
  // 샌드박스 기간 이중 방어: 서명이 맞아도 허용 목록 밖이면 반영하지 않는다.
  if (!isBillingAllowed(uid, env.BILLING_ALLOWED_UIDS)) {
    console.error("Paddle 웹훅 uid가 결제 허용 목록 밖:", uid, event.subscriptionId);
    return ok();
  }
  // 체험은 우리 서버(/trial)가 주고 Paddle 가격에는 체험 기간이 없다. trialing이 오면 Paddle 설정이
  // 바뀐 것이니 알아챌 수 있게 경고만 남기고, 처리는 active와 같다.
  if (event.status === "trialing") {
    console.warn("예상 밖 Paddle trialing 구독 — 가격에 체험 기간이 설정됐는지 확인:", uid, event.subscriptionId);
  }

  try {
    await commitEntitlement(deps, uid, (existing) => {
      if (isStaleEvent(existing, event)) return { skip: "STALE" as const };
      if (isForeignCancel(existing, event, now)) {
        console.warn(
          "이중 구독 의심 — 다른 구독의 해지 이벤트를 무시함(Paddle 대시보드에서 환불 확인):",
          uid,
          existing.subscriptionId,
          event.subscriptionId,
        );
        return { skip: "FOREIGN_SUBSCRIPTION" as const };
      }
      return { write: applySubscriptionEvent(existing, event, now) };
    });
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      console.error("Paddle 웹훅 대상 사용자가 없음:", uid, event.subscriptionId);
      return ok();
    }
    throw error;
  }
  return ok();
};
