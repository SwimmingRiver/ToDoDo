import { useCallback, useEffect, useState } from "react";
import { purchaseClient } from "./purchaseClient";
import { reportIapError, settleAll, settlePurchase } from "./resumePending";
import { fetchAccountToken, type VerifyFailure, type VerifyResult } from "./verifyApi";

type Phase = "idle" | "buying" | "verifying";

const firstFailure = (results: readonly VerifyResult[]): VerifyFailure | null => {
  if (results.some((r) => r.ok)) return null;
  const failed = results.find((r): r is Extract<VerifyResult, { ok: false }> => !r.ok);
  return failed?.reason ?? null;
};

/**
 * 구독 구매·복원. 구매 결과는 buy()의 반환값이 아니라 스토어 리스너로 온다 — 마운트된 동안 리스너를 듣고
 * 받은 거래를 검증→토큰 갱신→끝내기 순서로 마무리한다.
 */
export const usePurchase = () => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lastError, setLastError] = useState<VerifyFailure | null>(null);

  useEffect(
    () =>
      purchaseClient.onPurchase(
        (p) => {
          setPhase("verifying");
          settlePurchase(purchaseClient, p)
            .then((result) => setLastError(result.ok ? null : result.reason))
            .catch((error: unknown) => {
              reportIapError(error);
              setLastError("NETWORK");
            })
            .finally(() => setPhase("idle"));
        },
        (error) => {
          // 사용자 취소도 여기로 온다. 화면에 띄울 검증 실패는 아니라 lastError는 건드리지 않는다.
          reportIapError(error);
          setPhase("idle");
        },
      ),
    [],
  );

  const buy = useCallback(async (withTrial: boolean) => {
    setLastError(null);
    setPhase("buying");
    try {
      const accountToken = await fetchAccountToken();
      await purchaseClient.buy({ withTrial, accountToken });
    } catch (error) {
      reportIapError(error);
      setLastError("NETWORK");
      setPhase("idle");
    }
  }, []);

  const restore = useCallback(async () => {
    setLastError(null);
    setPhase("verifying");
    try {
      const [unfinished, available] = await Promise.all([purchaseClient.listUnfinished(), purchaseClient.listAvailable()]);
      // 같은 거래가 양쪽에 나올 수 있다 — 검증 요청은 거래마다 한 번만 보낸다.
      const unique = [...new Map([...unfinished, ...available].map((p) => [p.proof, p])).values()];
      setLastError(firstFailure(await settleAll(purchaseClient, unique)));
    } catch (error) {
      reportIapError(error);
      setLastError("NETWORK");
    } finally {
      setPhase("idle");
    }
  }, []);

  return { buy, restore, phase, lastError };
};
