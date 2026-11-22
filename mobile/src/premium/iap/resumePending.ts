import { isUserCancelledError } from "expo-iap";
import { refreshClaims } from "../useEntitlementSync";
import { purchaseClient, type PurchaseClient, type StorePurchase } from "./purchaseClient";
import { verifyPurchase, type VerifyResult } from "./verifyApi";
import { reportError } from "../../shared/lib/sentry";

/** 인앱결제 실패 보고. 사용자 취소는 실패가 아니므로 보내지 않는다(스토어 오류 리스너로도 취소가 온다). */
export const reportIapError = (error: unknown) => {
  if (isUserCancelledError(error)) return;
  reportError(error, "iap");
};

/**
 * 거래 하나를 마무리한다: 서버 검증 → 토큰 갱신(새 premiumUntil 클레임) → 거래 끝내기.
 * 검증이 ok가 아니면 끝내지 않는다 — 다음 실행이나 복원 때 다시 검증되고, 다른 계정에 묶인 거래는
 * 원래 계정으로 로그인한 뒤 복원할 수 있어야 한다.
 */
export const settlePurchase = async (client: PurchaseClient, p: StorePurchase): Promise<VerifyResult> => {
  const result = await verifyPurchase(p);
  if (!result.ok) return result;
  await refreshClaims();
  await client.finish(p);
  return result;
};

/** 여러 거래를 차례로 마무리한다. 한 건이 던져도 나머지는 계속한다(던진 건은 NETWORK로 친다). */
export const settleAll = async (client: PurchaseClient, purchases: readonly StorePurchase[]): Promise<VerifyResult[]> => {
  const results: VerifyResult[] = [];
  for (const p of purchases) {
    try {
      results.push(await settlePurchase(client, p));
    } catch (error) {
      reportIapError(error);
      results.push({ ok: false, reason: "NETWORK" });
    }
  }
  return results;
};

/** 로그인 직후 1회: 지난번에 끝내지 못한 거래(앱 종료·검증 실패)를 다시 검증한다. 절대 던지지 않는다. */
export const resumePendingPurchases = async (client: PurchaseClient = purchaseClient): Promise<void> => {
  try {
    await settleAll(client, await client.listUnfinished());
  } catch (error) {
    reportIapError(error);
  }
};
