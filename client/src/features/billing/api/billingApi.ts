import { authorizedFetch } from "@/shared/lib/authorizedFetch";
import { BILLING_PROXY_URL } from "../config";

export class BillingApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null) {
    super(`billing-proxy 요청 실패 (${status}${code ? ` ${code}` : ""})`);
    this.name = "BillingApiError";
    this.status = status;
    this.code = code;
  }
}

const send = async (path: string): Promise<Response> => {
  if (!BILLING_PROXY_URL) throw new BillingApiError(0, "NOT_CONFIGURED");
  const res = await authorizedFetch(BILLING_PROXY_URL, path, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new BillingApiError(res.status, body?.error ?? null);
  }
  return res;
};

const post = async <T>(path: string): Promise<T> => (await (await send(path)).json()) as T;

export const createCheckout = async (): Promise<string> =>
  (await post<{ transactionId: string }>("/checkout")).transactionId;

export const startTrial = (): Promise<{ premiumUntil: string }> => post("/trial");

export const createPortalUrl = async (): Promise<string> => (await post<{ url: string }>("/portal")).url;

/** 탈퇴: 구독 즉시 해지 + 서버 데이터·계정 삭제. 성공 응답은 본문이 없다(204). */
export const deleteAccountOnServer = async (): Promise<void> => {
  await send("/account/delete");
};
