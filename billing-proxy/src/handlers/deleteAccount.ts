import type { AccountDataStore } from "../accountDataStore";
import type { ClaimsClient } from "../claims";
import type { EntitlementStore } from "../entitlementStore";
import type { PaddleClient } from "../paddle";

export interface AccountDeletionDeps {
  store: Pick<EntitlementStore, "get">;
  paddle: Pick<PaddleClient, "cancelSubscriptionImmediately">;
  accountData: Pick<AccountDataStore, "deleteUserData">;
  claims: Pick<ClaimsClient, "deleteUser">;
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * 탈퇴. 순서가 곧 안전장치다:
 * 1) 구독 해지 — 실패하면 아무것도 지우지 않는다. 구독이 살아 있는 채 계정만 사라지면 청구가 계속된다.
 * 2) Firestore 데이터 — 실패하면 던져 500. Auth가 남아 있어 클라이언트가 같은 토큰으로 재시도할 수 있다.
 * 3) Auth 계정 — 마지막. 이후 도착하는 Paddle 해지 웹훅은 UserNotFoundError로 200 처리되어 문서를 되살리지 않는다.
 */
export const handleDeleteAccount = async (uid: string, deps: AccountDeletionDeps): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  if (doc.source === "paddle" && doc.subscriptionId && doc.status !== "canceled") {
    try {
      await deps.paddle.cancelSubscriptionImmediately(doc.subscriptionId);
    } catch (error) {
      console.error("탈퇴 중 Paddle 구독 해지 실패:", uid, doc.subscriptionId, error);
      return json({ error: "PADDLE_CANCEL_FAILED" }, 502);
    }
  }
  await deps.accountData.deleteUserData(uid);
  await deps.claims.deleteUser(uid);
  return new Response(null, { status: 204 });
};
