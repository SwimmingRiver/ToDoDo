import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { auth } from "@/shared/lib/firebase";
import { entitlementQueryKey, subscribeEntitlement } from "../api";
import type { Entitlement } from "../types";

const toClaimSeconds = (premiumUntil: string | null): number =>
  premiumUntil === null ? 0 : Math.floor(Date.parse(premiumUntil) / 1000);

/**
 * 문서와 ID 토큰의 premiumUntil 클레임이 다르면 토큰을 강제 갱신한다. 이게 없으면 결제 직후에도
 * 서버(rules·Worker)는 토큰이 자연 갱신될 때까지(최대 1시간) 예전 권한으로 판단한다.
 * 스냅샷이 올 때만 비교하므로 클레임 쓰기가 실패해도 갱신이 무한 반복되지 않는다.
 */
export const syncClaimWithEntitlement = async (entitlement: Entitlement): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  const { claims } = await user.getIdTokenResult();
  const current = typeof claims.premiumUntil === "number" ? claims.premiumUntil : 0;
  if (current !== toClaimSeconds(entitlement.premiumUntil)) await user.getIdToken(true);
};

/** 인증 레이아웃(App)에서 1회 마운트한다. */
export const useEntitlementSync = () => {
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    return subscribeEntitlement(
      uid,
      (entitlement) => {
        queryClient.setQueryData(entitlementQueryKey(uid), entitlement);
        syncClaimWithEntitlement(entitlement).catch((error) =>
          Sentry.captureException(error, { tags: { feature: "entitlement" } }),
        );
      },
      (error) => Sentry.captureException(error, { tags: { feature: "entitlement" } }),
    );
  }, [uid, queryClient]);
};
