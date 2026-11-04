import { signUid } from "./uidSignature";

export class PaddleClient {
  constructor(
    private readonly apiBase: string,
    private readonly apiKey: string,
    private readonly priceId: string,
    private readonly uidSecret: string,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.apiBase}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Paddle ${path} 실패 (${res.status})${await describePaddleError(res)}`);
    return (await res.json()) as T;
  }

  /**
   * 가격·uid는 서버가 정한다. uid_sig는 웹훅이 "이 uid는 서버가 만든 거래에서 왔다"를 확인하는 근거다 —
   * 브라우저가 직접 custom_data를 넣어 결제창을 열면 서명을 만들 수 없다.
   */
  async createCheckoutTransaction(uid: string, customerId: string | null): Promise<string> {
    const { data } = await this.post<{ data: { id: string } }>("/transactions", {
      items: [{ price_id: this.priceId, quantity: 1 }],
      custom_data: { uid, uid_sig: await signUid(uid, this.uidSecret) },
      ...(customerId ? { customer_id: customerId } : {}),
    });
    return data.id;
  }

  async createPortalUrl(customerId: string, subscriptionId: string | null): Promise<string> {
    const { data } = await this.post<{ data: { urls: { general: { overview: string } } } }>(
      `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
      subscriptionId ? { subscription_ids: [subscriptionId] } : {},
    );
    return data.urls.general.overview;
  }

  /**
   * 탈퇴용 즉시 해지. 이전 탈퇴 시도에서 이미 해지됐다면 Paddle이 오류를 돌려주므로,
   * 실패하면 상태를 조회해 canceled일 때만 성공으로 본다 — 탈퇴 재시도가 여기서 막히지 않게.
   */
  async cancelSubscriptionImmediately(subscriptionId: string): Promise<void> {
    const id = encodeURIComponent(subscriptionId);
    const res = await this.fetchFn(`${this.apiBase}/subscriptions/${id}/cancel`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ effective_from: "immediately" }),
    });
    if (res.ok) return;
    const detail = await describePaddleError(res);
    if ((await this.getSubscriptionStatus(id)) === "canceled") return;
    throw new Error(`Paddle 구독 해지 실패 (${res.status})${detail}`);
  }

  private async getSubscriptionStatus(encodedId: string): Promise<string> {
    const res = await this.fetchFn(`${this.apiBase}/subscriptions/${encodedId}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Paddle 구독 조회 실패 (${res.status})${await describePaddleError(res)}`);
    const { data } = (await res.json()) as { data: { status: string } };
    return data.status;
  }
}

/** Paddle 오류 본문의 code·detail. 키·결제 정보는 담기지 않아 로그에 남겨도 된다 — 400의 원인을 알 수 있는 유일한 단서다. */
const describePaddleError = async (res: Response): Promise<string> => {
  try {
    const { error } = (await res.json()) as { error?: { code?: string; detail?: string } };
    return error?.code ? `: ${error.code} — ${error.detail ?? ""}` : "";
  } catch {
    return "";
  }
};
