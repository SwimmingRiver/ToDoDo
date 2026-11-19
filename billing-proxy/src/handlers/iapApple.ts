import { deriveAccountToken } from "../accountToken";
import type { AppleSnapshot, AppleTransaction } from "../apple/decide";
import { applyAppleSnapshot } from "../apple/decide";
import { AppleJwsError } from "../apple/jws";
import { parseTransaction, type AppleServerApi } from "../apple/serverApi";
import { UserNotFoundError } from "../claims";
import { commitEntitlement, type CommitDeps } from "../commit";
import type { Env } from "../env";
import { decideLink, type StoreLinkStore } from "../storeLinks";

export interface AppleIapDeps extends CommitDeps {
  storeLinks: Pick<StoreLinkStore, "get" | "put">;
  apple: Pick<AppleServerApi, "getSubscriptionSnapshot">;
  /** Apple 루트로 서명 체인을 검증하고 페이로드를 돌려준다. 실패는 AppleJwsError. */
  verifyAppleJws: (jws: string) => Promise<unknown>;
}

type AppleEnv = Pick<Env, "APPLE_BUNDLE_ID" | "IAP_ACCOUNT_TOKEN_SECRET">;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const invalid = () => json({ error: "INVALID_TRANSACTION" }, 400);
const ok = () => new Response("ok", { status: 200 });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

/** 서명 검증 + 형식 확인. 검증 실패는 AppleJwsError 그대로, 형식 오류는 null(재시도해도 같은 결과). */
const verifiedTransaction = async (deps: AppleIapDeps, jws: string): Promise<AppleTransaction | null> => {
  const payload = await deps.verifyAppleJws(jws);
  try {
    return parseTransaction(payload);
  } catch {
    return null;
  }
};

type LinkResult = "linked" | "conflict";

/**
 * 영수증(원거래 id)을 이 계정에 묶는다. 쓰기는 사전조건 경합이 나면 한 번만 다시 읽어 판정한다 —
 * 같은 계정의 병렬 verify(구매 직후 앱이 두 번 보냄)는 재연결로 끝나고, 다른 계정이 먼저 묶었으면 409다.
 */
const linkToAccount = async (
  deps: AppleIapDeps,
  uid: string,
  tx: AppleTransaction,
  expectedToken: string,
  now: Date,
): Promise<LinkResult> => {
  const id = tx.originalTransactionId;
  const receivedToken = tx.appAccountToken ?? null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { link, updateTime } = await deps.storeLinks.get("apple", id);
    const decision = decideLink(link, uid, expectedToken, receivedToken);
    if (decision.kind === "conflict") return "conflict";
    if (decision.tokenMismatch && attempt === 0) {
      // 막지 않는다(탈퇴 후 재가입·App Store에서 시작된 구매). 이상 사례 추적용으로 남기되 토큰 값은 로그에 넣지 않는다.
      console.warn("Apple 거래의 appAccountToken이 이 계정 것이 아님(복원으로 연결):", uid, id);
    }
    const next = { uid, linkedAt: link?.linkedAt ?? now.toISOString(), accountToken: receivedToken };
    if ((await deps.storeLinks.put("apple", id, next, updateTime)) === "ok") return "linked";
  }
  throw new Error(`storeLinks apple_${id} 쓰기 경합이 반복됨`);
};

/**
 * 앱이 StoreKit 2 jwsRepresentation을 보낸다. 상태는 JWS 거래만 보고 추정하지 않고 App Store Server API로
 * 지금 상태 전체를 조회해 반영한다(환불·해지 예약이 거래 JWS에는 안 보일 수 있다).
 * 응답 시점에는 클레임이 이미 바뀌어 있어 앱이 토큰을 새로 받으면 바로 켜진다.
 */
export const handleAppleVerify = async (
  uid: string,
  deps: AppleIapDeps,
  now: Date,
  env: AppleEnv,
  request: Request,
): Promise<Response> => {
  const body = await readJson(request);
  const jws = isRecord(body) ? body.jws : undefined;
  if (typeof jws !== "string" || jws.length === 0) return invalid();

  let tx: AppleTransaction | null;
  try {
    tx = await verifiedTransaction(deps, jws);
  } catch (error) {
    if (error instanceof AppleJwsError) return invalid();
    throw error;
  }
  if (!tx || tx.bundleId !== env.APPLE_BUNDLE_ID) return invalid();

  const expectedToken = await deriveAccountToken(uid, env.IAP_ACCOUNT_TOKEN_SECRET);
  if ((await linkToAccount(deps, uid, tx, expectedToken, now)) === "conflict") {
    return json({ error: "LINKED_TO_OTHER_ACCOUNT" }, 409);
  }

  // R4: 거래 id가 아니라 원거래 id로 조회해 구독 단위의 최신 상태를 받는다.
  const snap = await deps.apple.getSubscriptionSnapshot(tx.originalTransactionId);
  // 연결은 남겨 둔다 — 같은 uid의 연결이라 해가 없고, 다음 verify가 그대로 재연결한다.
  if (!snap) return invalid();
  // 조회 결과가 요청한 구독이 아니면 추측해서 반영하지 않는다.
  if (snap.transaction.originalTransactionId !== tx.originalTransactionId) return invalid();

  const outcome = await commitEntitlement(deps, uid, (existing) => applyAppleSnapshot(existing, snap, now));
  if (outcome.kind === "written") return json({ premiumUntil: outcome.doc.premiumUntil });
  // 다른 유효한 Apple 구독을 추적 중인 경우 등. 권한은 그대로이니 현재 값을 돌려준다.
  console.warn("Apple verify 반영 생략:", outcome.reason, uid, tx.originalTransactionId);
  const { doc } = await deps.store.get(uid);
  return json({ premiumUntil: doc.premiumUntil });
};

interface AppleNotification {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  signedDate: number;
  data?: {
    bundleId?: unknown;
    signedTransactionInfo?: unknown;
  };
}

const parseNotification = (value: unknown): AppleNotification | null => {
  if (!isRecord(value)) return null;
  if (typeof value.notificationType !== "string" || typeof value.notificationUUID !== "string") return null;
  if (typeof value.signedDate !== "number") return null;
  if (value.subtype !== undefined && typeof value.subtype !== "string") return null;
  if (value.data !== undefined && !isRecord(value.data)) return null;
  return value as unknown as AppleNotification;
};

/**
 * App Store Server Notifications v2. 200은 "다시 보내지 마"다 — 서명은 맞지만 우리가 처리할 수 없는 것
 * (연결 없음, 다른 앱, 형식 오류, 탈퇴한 사용자)은 로그만 남기고 200, 서명 불일치는 401,
 * 일시 오류(Firestore·Auth·App Store Server API)는 던져 500으로 Apple 재전송을 받는다.
 *
 * 알림은 "무엇이 바뀌었는지"를 알리는 신호로만 쓰고, 상태는 매번 App Store Server API로 다시 조회한다.
 * 알림의 거래는 구독의 현재 거래가 아닐 수 있다 — 지난달 갱신분 REFUND를 그대로 반영하면 지금 기간을
 * 결제한 사용자가 잠기고, lastSignedDate가 앞서 나가 스스로 바로잡히지도 않는다(R5).
 * 중복·역순 판정은 알림의 notificationUUID·signedDate로 한다. Sandbox도 반영하고 환경을 기록한다.
 */
export const handleAppleWebhook = async (
  request: Request,
  env: Pick<Env, "APPLE_BUNDLE_ID">,
  deps: AppleIapDeps,
  now: Date,
): Promise<Response> => {
  const body = await readJson(request);
  const signedPayload = isRecord(body) ? body.signedPayload : undefined;

  let notification: AppleNotification | null;
  let tx: AppleTransaction;
  try {
    notification = parseNotification(await deps.verifyAppleJws(typeof signedPayload === "string" ? signedPayload : ""));
    if (!notification) {
      console.error("Apple 알림 형식 오류(서명은 맞음)");
      return ok();
    }
    const data = notification.data;
    // TEST·CONSUMPTION_REQUEST 등 구독 거래가 없는 알림은 반영할 것이 없다.
    if (!data || typeof data.signedTransactionInfo !== "string") return ok();
    if (data.bundleId !== env.APPLE_BUNDLE_ID) {
      console.error("Apple 알림 bundleId가 이 앱이 아님 — 무시:", data.bundleId, notification.notificationUUID);
      return ok();
    }
    const txPayload = await deps.verifyAppleJws(data.signedTransactionInfo);
    try {
      tx = parseTransaction(txPayload);
    } catch (error) {
      console.error("Apple 알림 거래 정보 형식 오류:", notification.notificationUUID, error);
      return ok();
    }
  } catch (error) {
    if (error instanceof AppleJwsError) return new Response("Invalid signature", { status: 401 });
    throw error;
  }

  if (tx.bundleId !== env.APPLE_BUNDLE_ID) {
    console.error("Apple 알림 거래 bundleId가 이 앱이 아님 — 무시:", tx.bundleId, notification.notificationUUID);
    return ok();
  }

  const { link } = await deps.storeLinks.get("apple", tx.originalTransactionId);
  if (!link) {
    // 구매 직후 verify보다 먼저 온 알림은 verify가 반영한다. 탈퇴한 계정이면 무시가 맞다.
    console.log("Apple 알림: 연결된 계정 없음 — 무시:", notification.notificationType, tx.originalTransactionId);
    return ok();
  }

  const current = await deps.apple.getSubscriptionSnapshot(tx.originalTransactionId);
  if (!current) {
    console.error("Apple 알림: 구독 조회 결과 없음 — 무시:", notification.notificationType, tx.originalTransactionId);
    return ok();
  }
  if (current.transaction.originalTransactionId !== tx.originalTransactionId) {
    console.error("Apple 알림: 조회한 구독이 알림의 원거래와 다름 — 무시:", tx.originalTransactionId, notification.notificationUUID);
    return ok();
  }
  const snap: AppleSnapshot = {
    ...current,
    notificationUUID: notification.notificationUUID,
    signedDate: notification.signedDate,
  };
  try {
    const outcome = await commitEntitlement(deps, link.uid, (existing) => applyAppleSnapshot(existing, snap, now));
    if (outcome.kind === "skipped") {
      console.log("Apple 알림 반영 생략:", outcome.reason, link.uid, tx.originalTransactionId, notification.notificationUUID);
    }
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      console.error("Apple 알림 대상 사용자가 없음:", link.uid, tx.originalTransactionId);
      return ok();
    }
    throw error;
  }
  return ok();
};
