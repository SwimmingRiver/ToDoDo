import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toClaimSeconds, type EntitlementDoc } from "@tododo/core/dist/entitlement/index.js";
import { auth } from "../firebase";
import { entitlementQueryKey, subscribeEntitlement } from "./entitlementApi";

// 앱에는 아직 Sentry가 없어 오류 보고는 이 한 곳에서 console.warn으로 한다.
const reportError = (error: unknown) => console.warn("[entitlement]", error);

/** ID 토큰을 강제 갱신해 서버가 최신 premiumUntil 클레임을 보게 한다. */
export const refreshClaims = async (): Promise<void> => {
  await auth.currentUser?.getIdToken(true);
};

/**
 * 문서와 토큰의 premiumUntil 클레임이 다르면 토큰을 강제 갱신한다. 스냅샷이 올 때만 비교하므로
 * 클레임 쓰기가 실패해도 갱신이 무한 반복되지 않는다.
 */
export const syncClaimWithEntitlement = async (entitlement: EntitlementDoc): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  const { claims } = await user.getIdTokenResult();
  const current = typeof claims.premiumUntil === "number" ? claims.premiumUntil : 0;
  if (current !== toClaimSeconds(entitlement.premiumUntil)) await user.getIdToken(true);
};

/** 로그인한 상태에서 1회만 마운트한다(RootNavigator). */
export const useEntitlementSync = () => {
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    return subscribeEntitlement(
      uid,
      (entitlement) => {
        queryClient.setQueryData(entitlementQueryKey(uid), entitlement);
        syncClaimWithEntitlement(entitlement).catch(reportError);
      },
      reportError,
    );
  }, [uid, queryClient]);
};
