import { deriveAccountToken } from "../accountToken";
import { UserNotFoundError } from "../claims";
import { commitEntitlement, type CommitDeps } from "../commit";
import type { Env } from "../env";
import { applyGoogleSubscription, type GoogleEvent } from "../google/decide";
import type { PlayApi, PlaySubscription } from "../google/playApi";
import { decideLink, type StoreLinkStore } from "../storeLinks";

export interface GoogleIapDeps extends CommitDeps {
  storeLinks: Pick<StoreLinkStore, "get" | "put">;
  play: Pick<PlayApi, "getSubscription" | "acknowledge">;
  /** Pub/Sub 푸시의 Authorization 헤더(OIDC 토큰) 검증. 공개키 조회 실패만 throw. */
  verifyPubSub: (authHeader: string | null) => Promise<boolean>;
}

const PRODUCT_ID = "premium_monthly";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const invalid = () => json({ error: "INVALID_PURCHASE" }, 400);
const ok = () => new Response("ok", { status: 200 });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

/** 결제 대기(PENDING)와 대기 중 취소(PENDING_PURCHASE_CANCELED). 기간이 시작되지 않아 라인 아이템이 없을 수 있다. */
const isPendingState = (sub: PlaySubscription): boolean => sub.subscriptionState.startsWith("SUBSCRIPTION_STATE_PENDING");

/** 우리 상품의 구독인지. 라인 아이템이 비었으면 대기 계열 상태일 때만 받아들인다(R6). */
const isOurProduct = (sub: PlaySubscription): boolean =>
  sub.lineItems.some((item) => item.productId === PRODUCT_ID) || (sub.lineItems.length === 0 && isPendingState(sub));

/** 반영을 끝낸 뒤 승인할 구매인지. 결제 대기 계열은 승인할 수 없다(아직 결제가 끝나지 않음). */
const needsAcknowledge = (sub: PlaySubscription): boolean =>
  sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING" && !isPendingState(sub);

type LinkResult = "linked" | "conflict";

/**
 * 업그레이드·재구독으로 새 토큰이 나오면 linkedPurchaseToken이 이전 토큰을 가리킨다.
 * 새 토큰에 연결이 없을 때만 이전 토큰의 연결을 본다 — 새 토큰의 연결이 있으면 그쪽이 우선이다.
 * 사슬은 한 단계만 따라간다: 이전 토큰도 처음 교체될 때(verify 또는 이 경로로) 연결이 만들어지므로
 * 토큰마다 연결이 이어져 있고, 여러 단계를 거슬러 오를 일이 없다. 중간 연결이 빠진 사슬은 앱 verify가 잇는다.
 */
const linkedOwner = async (deps: GoogleIapDeps, sub: PlaySubscription): Promise<string | null> => {
  if (!sub.linkedPurchaseToken) return null;
  const { link } = await deps.storeLinks.get("google", sub.linkedPurchaseToken);
  return link?.uid ?? null;
};

/**
 * 구매 토큰을 계정에 묶는다. 쓰기는 사전조건 경합이 나면 한 번만 다시 읽어 판정한다 —
 * 같은 계정의 병렬 verify는 재연결로 끝나고, 다른 계정이 먼저 묶었으면 conflict다(Apple과 같은 규칙).
 * 새 토큰에 연결이 없으면 이전 토큰(linkedPurchaseToken)의 연결도 같은 계정이어야 한다 —
 * 남의 계정에 묶인 구독을 교체 토큰으로 가져가는 길을 막는다.
 */
const linkToAccount = async (
  deps: GoogleIapDeps,
  uid: string,
  purchaseToken: string,
  sub: PlaySubscription,
  expectedToken: string,
  now: Date,
): Promise<LinkResult> => {
  const receivedToken = sub.obfuscatedAccountId;
  let checkedLinked = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { link, updateTime } = await deps.storeLinks.get("google", purchaseToken);
    if (!link && !checkedLinked) {
      checkedLinked = true;
      const owner = await linkedOwner(deps, sub);
      if (owner !== null && owner !== uid) return "conflict";
    }
    const decision = decideLink(link, uid, expectedToken, receivedToken);
    if (decision.kind === "conflict") return "conflict";
    if (decision.tokenMismatch && attempt === 0) {
      // 막지 않는다(탈퇴 후 재가입·Play 스토어에서 시작된 구매). 추적용 로그이며 토큰 값은 남기지 않는다.
      console.warn("Google 구매의 obfuscatedAccountId가 이 계정 것이 아님(복원으로 연결):", uid);
    }
    const next = { uid, linkedAt: link?.linkedAt ?? now.toISOString(), accountToken: receivedToken };
    if ((await deps.storeLinks.put("google", purchaseToken, next, updateTime)) === "ok") return "linked";
  }
  throw new Error("storeLinks google 쓰기 경합이 반복됨");
};

/**
 * verify는 Pub/Sub 메시지가 없어 lastMessageId·lastEventTime을 일부러 null로 쓴다 — 상태를 매번 다시 조회하므로
 * 중복·역순 판정이 필요 없고, 결정 함수는 null이면 항상 반영한다. 다음 RTDN은 null과 비교하지 않고 그대로 반영된다.
 */
const verifyEvent = (purchaseToken: string): GoogleEvent => ({ purchaseToken, messageId: null, eventTime: null });

/**
 * 앱이 구매 직후(또는 복원 때) purchaseToken·productId를 보낸다. 상태는 Play Developer API
 * subscriptionsv2로 지금 상태 전체를 조회해 반영하고, 반영이 끝난 뒤에 승인(acknowledge)한다 —
 * 승인하지 않은 구매는 3일 뒤 Google이 자동 환불하므로 "우리 쪽에서 반영했다"를 승인으로 확정한다.
 * 승인이 실패하면 500: 반영은 같은 값으로 다시 써도 무해하니 앱이 재시도하면 승인까지 이어진다.
 */
export const handleGoogleVerify = async (
  uid: string,
  deps: GoogleIapDeps,
  now: Date,
  env: Pick<Env, "IAP_ACCOUNT_TOKEN_SECRET">,
  request: Request,
): Promise<Response> => {
  const body = await readJson(request);
  if (!isRecord(body) || !nonEmpty(body.purchaseToken) || !nonEmpty(body.productId)) return invalid();
  if (body.productId !== PRODUCT_ID) return invalid();
  const purchaseToken = body.purchaseToken;

  const sub = await deps.play.getSubscription(purchaseToken);
  if (!sub || !isOurProduct(sub)) return invalid();

  const expectedToken = await deriveAccountToken(uid, env.IAP_ACCOUNT_TOKEN_SECRET);
  if ((await linkToAccount(deps, uid, purchaseToken, sub, expectedToken, now)) === "conflict") {
    return json({ error: "LINKED_TO_OTHER_ACCOUNT" }, 409);
  }

  const outcome = await commitEntitlement(deps, uid, (existing) =>
    applyGoogleSubscription(existing, sub, verifyEvent(purchaseToken), now),
  );
  if (outcome.kind === "skipped" && outcome.reason === "PENDING") {
    // 결제 대기(편의점 결제 등)는 승인할 수 없다. 결제가 끝나면 RTDN이 위 연결로 반영한다.
    const { doc } = await deps.store.get(uid);
    return json({ premiumUntil: doc.premiumUntil, pending: true });
  }

  if (outcome.kind === "skipped" && outcome.reason === "OTHER_SUBSCRIPTION") {
    // 다른 유효한 Google 구독이 계속 갱신 중이다. 기록하지 않은 이 구독을 승인하면 반영 안 된 정기 결제가 굳는다 —
    // 승인하지 않고 409로 돌려준다. 앱은 거래를 끝내지 않고, Google이 3일 뒤 자동 환불한다.
    console.warn("Google verify: 이미 다른 구독을 추적 중 — 승인하지 않음:", uid);
    return json({ error: "ALREADY_SUBSCRIBED" }, 409);
  }

  if (needsAcknowledge(sub)) await deps.play.acknowledge(PRODUCT_ID, purchaseToken);

  if (outcome.kind === "written") return json({ premiumUntil: outcome.doc.premiumUntil });
  // 중복·역순(STALE) 등. 권한은 그대로이니 현재 값을 돌려준다.
  console.warn("Google verify 반영 생략:", outcome.reason, uid);
  const { doc } = await deps.store.get(uid);
  return json({ premiumUntil: doc.premiumUntil });
};

interface DeveloperNotification {
  packageName: string;
  eventTime: string;
  purchaseToken: string | null;
  isTest: boolean;
  /** 구독이 아닌 상품(일회성)의 환불 알림. 우리 상품이 아니니 조회하지 않는다. */
  nonSubscriptionVoided: boolean;
}

/** voidedPurchaseNotification.productType: 1 = 구독, 2 = 일회성 상품. */
const VOIDED_PRODUCT_TYPE_SUBSCRIPTION = 1;

const decodeBase64Utf8 = (data: string): string =>
  new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));

const tokenOf = (value: unknown): string | null =>
  isRecord(value) && nonEmpty(value.purchaseToken) ? value.purchaseToken : null;

/** Pub/Sub 메시지 data(base64 JSON)를 RTDN으로 푼다. 형식이 맞지 않으면 null(재전송해도 같은 결과). */
const parseDeveloperNotification = (data: string): DeveloperNotification | null => {
  let value: unknown;
  try {
    value = JSON.parse(decodeBase64Utf8(data));
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.packageName !== "string") return null;
  // eventTimeMillis는 문자열로 온다(int64). 숫자가 아니면 역순 판정을 할 수 없으니 형식 오류로 본다.
  const millis = typeof value.eventTimeMillis === "string" || typeof value.eventTimeMillis === "number" ? Number(value.eventTimeMillis) : NaN;
  if (!Number.isFinite(millis)) return null;
  return {
    packageName: value.packageName,
    eventTime: new Date(millis).toISOString(),
    // 구독 알림과 환불(무효 구매) 알림 둘 다 구매 토큰만 신호로 쓰고 상태는 다시 조회한다.
    purchaseToken: tokenOf(value.subscriptionNotification) ?? tokenOf(value.voidedPurchaseNotification),
    isTest: value.testNotification !== undefined,
    nonSubscriptionVoided:
      isRecord(value.voidedPurchaseNotification) && value.voidedPurchaseNotification.productType !== VOIDED_PRODUCT_TYPE_SUBSCRIPTION,
  };
};

/**
 * Play RTDN(Pub/Sub 푸시). 200은 "다시 보내지 마"다 — OIDC는 맞지만 우리가 처리할 수 없는 것
 * (형식 오류, 다른 앱, 연결 없음, 탈퇴한 사용자)은 로그만 남기고 200, OIDC 불일치는 401,
 * 일시 오류(Firestore·Auth·Play API·공개키 조회)와 이상 응답은 던져 500으로 Pub/Sub 재전송을 받는다.
 *
 * 알림 본문의 상태(notificationType)는 믿지 않고 매번 subscriptionsv2로 지금 상태를 다시 조회한다 —
 * 그래서 알림이 역순으로 와도 최신 상태로 수렴한다. 중복·역순은 messageId·eventTimeMillis로 판정한다.
 * 연결된 구매를 반영(written)했는데 아직 미승인이면 여기서도 승인한다 — 결제 대기였다가 완료된 구매는
 * 앱이 다시 verify하지 않을 수 있고, 그러면 3일 뒤 자동 환불된다. 승인 실패는 500(반영은 같은 값이라 재전송이 승인까지 잇는다).
 * 건너뛴 반영(다른 구독 추적 중 등)·결제 대기·연결 없음은 승인하지 않는다.
 */
export const handleGoogleWebhook = async (
  request: Request,
  env: Pick<Env, "GOOGLE_PLAY_PACKAGE_NAME" | "IAP_ACCOUNT_TOKEN_SECRET">,
  deps: GoogleIapDeps,
  now: Date,
): Promise<Response> => {
  if (!(await deps.verifyPubSub(request.headers.get("Authorization")))) {
    return new Response("Invalid token", { status: 401 });
  }

  const body = await readJson(request);
  const message = isRecord(body) && isRecord(body.message) ? body.message : null;
  if (!message || typeof message.data !== "string" || !nonEmpty(message.messageId)) {
    console.error("Google RTDN 푸시 형식 오류(OIDC는 맞음)");
    return ok();
  }
  const messageId = message.messageId;
  const notification = parseDeveloperNotification(message.data);
  if (!notification) {
    console.error("Google RTDN 메시지 형식 오류(OIDC는 맞음):", messageId);
    return ok();
  }
  if (notification.packageName !== env.GOOGLE_PLAY_PACKAGE_NAME) {
    console.error("Google RTDN packageName이 이 앱이 아님 — 무시:", notification.packageName, messageId);
    return ok();
  }
  // Play Console의 테스트 알림, 일회성 상품 알림 등은 반영할 구독이 없다.
  if (notification.isTest) return ok();
  if (notification.nonSubscriptionVoided) {
    console.log("Google RTDN: 구독이 아닌 상품의 환불 알림 — 무시:", messageId);
    return ok();
  }
  if (!notification.purchaseToken) return ok();
  const purchaseToken = notification.purchaseToken;

  const sub = await deps.play.getSubscription(purchaseToken);
  if (!sub) {
    console.error("Google RTDN: 구독 조회 결과 없음 — 무시:", messageId);
    return ok();
  }

  let uid = (await deps.storeLinks.get("google", purchaseToken)).link?.uid ?? null;
  if (uid === null) {
    // 교체 토큰: 이전 토큰의 계정을 따라가 새 토큰도 같은 계정에 묶는다(앱 verify보다 알림이 먼저 온 경우 포함).
    const owner = await linkedOwner(deps, sub);
    if (owner === null) {
      // 구매 직후 verify보다 먼저 온 알림은 verify가 반영한다. 탈퇴한 계정이면 무시가 맞다.
      console.log("Google RTDN: 연결된 계정 없음 — 무시:", messageId);
      return ok();
    }
    const expectedToken = await deriveAccountToken(owner, env.IAP_ACCOUNT_TOKEN_SECRET);
    if ((await linkToAccount(deps, owner, purchaseToken, sub, expectedToken, now)) === "conflict") {
      // 그 사이 다른 계정의 verify가 새 토큰을 먼저 묶었다. 그 verify가 반영했다.
      console.error("Google RTDN: 교체 토큰이 이미 다른 계정에 연결됨 — 무시:", owner, messageId);
      return ok();
    }
    uid = owner;
  }

  const ev: GoogleEvent = { purchaseToken, messageId, eventTime: notification.eventTime };
  let applied: boolean;
  try {
    const outcome = await commitEntitlement(deps, uid, (existing) => applyGoogleSubscription(existing, sub, ev, now));
    // 같은 messageId 중복은 "이미 반영함"이다 — 승인 실패(500) 뒤 재전송은 이 경로로 오므로 승인을 다시 시도해야 한다.
    applied = outcome.kind === "written" || outcome.reason === "DUPLICATE_MESSAGE";
    if (outcome.kind === "skipped") console.log("Google RTDN 반영 생략:", outcome.reason, uid, messageId);
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      console.error("Google RTDN 대상 사용자가 없음:", uid, messageId);
      return ok();
    }
    throw error;
  }
  if (applied && needsAcknowledge(sub)) await deps.play.acknowledge(PRODUCT_ID, purchaseToken);
  return ok();
};
