export class PaddleClient {
  constructor(
    private readonly apiBase: string,
    private readonly apiKey: string,
    private readonly priceId: string,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.apiBase}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Paddle ${path} 실패 (${res.status})`);
    return (await res.json()) as T;
  }

  /** 가격·uid는 서버가 정한다 — 브라우저가 custom_data를 넣으면 남의 uid로 결제를 연결할 수 있다. */
  async createCheckoutTransaction(uid: string, customerId: string | null): Promise<string> {
    const { data } = await this.post<{ data: { id: string } }>("/transactions", {
      items: [{ price_id: this.priceId, quantity: 1 }],
      custom_data: { uid },
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
}
