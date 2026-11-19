import type { AccountDataStore } from "../accountDataStore";
import type { ClaimsClient } from "../claims";
import type { EntitlementStore } from "../entitlementStore";
import type { PlayApi } from "../google/playApi";
import type { PaddleClient } from "../paddle";

export interface AccountDeletionDeps {
  store: Pick<EntitlementStore, "get">;
  paddle: Pick<PaddleClient, "cancelSubscriptionImmediately">;
  accountData: Pick<AccountDataStore, "deleteUserData">;
  claims: Pick<ClaimsClient, "deleteUser">;
  google: Pick<PlayApi, "cancelSubscription">;
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * 탈퇴. 순서가 곧 안전장치다:
 * 1) 구독 해지(Paddle → Google) — 실패하면 아무것도 지우지 않는다. 구독이 살아 있는 채 계정만 사라지면 청구가 계속되고,
 *    Google 구매 토큰은 2)에서 지워지므로 그 뒤에는 다시 해지할 방법이 없다.
 * 2) Firestore 데이터 — 실패하면 던져 500. Auth가 남아 있어 클라이언트가 같은 토큰으로 재시도할 수 있다.
 * 3) Auth 계정 — 마지막. 이후 도착하는 Paddle 해지 웹훅은 UserNotFoundError로 200 처리되어 문서를 되살리지 않는다.
 */
export const handleDeleteAccount = async (uid: string, deps: AccountDeletionDeps): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  // 대표 출처와 무관하게 Paddle 기록으로 본다 — Apple이 대표여도 Paddle 구독이 살아 있으면 청구가 계속된다.
  // Apple 구독은 서버가 해지할 수 없어 화면에서 경고만 한다.
  const paddle = doc.sources.paddle;
  if (paddle && paddle.subscriptionId && paddle.status !== "canceled") {
    try {
      await deps.paddle.cancelSubscriptionImmediately(paddle.subscriptionId);
    } catch (error) {
      console.error("탈퇴 중 Paddle 구독 해지 실패:", uid, paddle.subscriptionId, error);
      return json({ error: "PADDLE_CANCEL_FAILED" }, 502);
    }
  }
  // Google은 기록이 있고 해지 완료(canceled)가 아니면 부른다. 저장된 autoRenew를 믿지 않는 이유: "자동 갱신 다시 켬"
  // 알림이 유실됐으면 문서는 꺼짐인데 Play는 계속 청구한다. 이미 꺼졌거나 만료면 already_inactive로 흡수된다.
  // 기록이 없거나 canceled면 Play를 건드리지 않아 Play 시크릿이 없어도 탈퇴가 된다.
  // 화면 안내("함께 해지돼요")는 여전히 isAutoRenewingStore 기준이다 — 안내와 호출 기준이 일부러 다르다.
  const google = doc.sources.google;
  if (google && google.status !== "canceled") {
    try {
      await deps.google.cancelSubscription(google.purchaseToken);
    } catch (error) {
      // 토큰은 로그에 남기지 않는다(구매 증빙 값).
      console.error("탈퇴 중 Google Play 구독 해지 실패:", uid, error);
      return json({ error: "GOOGLE_CANCEL_FAILED" }, 502);
    }
  }
  await deps.accountData.deleteUserData(uid);
  await deps.claims.deleteUser(uid);
  return new Response(null, { status: 204 });
};
