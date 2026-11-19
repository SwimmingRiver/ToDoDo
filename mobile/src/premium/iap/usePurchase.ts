import { useCallback, useEffect, useRef, useState } from "react";
import { purchaseClient } from "./purchaseClient";
import { reportIapError, settleAll, settlePurchase } from "./resumePending";
import { fetchAccountToken, type VerifyFailure, type VerifyResult } from "./verifyApi";

type Phase = "idle" | "buying" | "verifying";

/** 복원 결과. restored 0 + failure null이면 "복원할 구매가 없음"이다. */
export interface RestoreOutcome {
  restored: number;
  failure: VerifyFailure | null;
}

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
  // buy가 끝난 뒤에도 "buying"에 머물지 않게, 그 사이 구매 이벤트로 검증이 시작됐는지 기억한다.
  const verifyStarted = useRef(false);

  useEffect(
    () =>
      purchaseClient.onPurchase(
        (p) => {
          verifyStarted.current = true;
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
    verifyStarted.current = false;
    setPhase("buying");
    try {
      const accountToken = await fetchAccountToken();
      await purchaseClient.buy({ withTrial, accountToken });
      // 취소·Ask to Buy(보류)는 구매 이벤트 없이 끝난다. 이벤트가 왔으면 검증 쪽이 idle로 돌린다.
      if (!verifyStarted.current) setPhase("idle");
    } catch (error) {
      reportIapError(error);
      setLastError("NETWORK");
      setPhase("idle");
    }
  }, []);

  /** 끝내지 못한 거래와 스토어가 가진 구매를 다시 검증한다. 화면이 "복원할 구매 없음"을 구분하도록 결과를 돌려준다. */
  const restore = useCallback(async (): Promise<RestoreOutcome> => {
    setLastError(null);
    setPhase("verifying");
    try {
      const [unfinished, available] = await Promise.all([purchaseClient.listUnfinished(), purchaseClient.listAvailable()]);
      // 같은 거래가 양쪽에 나올 수 있다 — 검증 요청은 거래마다 한 번만 보낸다.
      const unique = [...new Map([...unfinished, ...available].map((p) => [p.proof, p])).values()];
      const results = await settleAll(purchaseClient, unique);
      const outcome = { restored: results.filter((r) => r.ok).length, failure: firstFailure(results) };
      setLastError(outcome.failure);
      return outcome;
    } catch (error) {
      reportIapError(error);
      setLastError("NETWORK");
      return { restored: 0, failure: "NETWORK" };
    } finally {
      setPhase("idle");
    }
  }, []);

  return { buy, restore, phase, lastError };
};
