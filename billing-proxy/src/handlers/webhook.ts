import { UserNotFoundError } from "../claims";
import { commitEntitlement, type CommitDeps } from "../commit";
import { applySubscriptionEvent, isStaleEvent } from "../entitlement";
import type { Env } from "../env";
import { parseWebhook } from "../paddleEvent";
import { verifyPaddleSignature } from "../signature";

const ok = () => new Response("ok", { status: 200 });

/**
 * 200은 "다시 보내지 마"라는 뜻이다. 재전송으로 해결되지 않는 문제(uid 없음, 삭제된 사용자,
 * 형식 오류)는 로그만 남기고 200, 일시적 실패(Firestore·Auth 오류)만 예외 → 500으로 재전송을 받는다.
 */
export const handleWebhook = async (
  request: Request,
  env: Pick<Env, "PADDLE_WEBHOOK_SECRET">,
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

  const { uid, event } = parsed;
  try {
    await commitEntitlement(deps, uid, (existing) =>
      isStaleEvent(existing, event) ? { skip: "STALE" } : { write: applySubscriptionEvent(existing, event, now) },
    );
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      console.error("Paddle 웹훅 대상 사용자가 없음:", uid, event.subscriptionId);
      return ok();
    }
    throw error;
  }
  return ok();
};
