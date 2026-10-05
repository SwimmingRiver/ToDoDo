import { describe, it, expect, vi } from "vitest";
import { PaddleClient } from "../paddle";
import { signUid } from "../uidSignature";

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("PaddleClient", () => {
  it("거래를 서버 가격·토큰 uid와 서버 서명(uid_sig)으로 만든다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ data: { id: "txn_1" } }));
    const client = new PaddleClient("https://sandbox-api.paddle.com", "key", "pri_1", "uid-secret", fetchFn);

    await expect(client.createCheckoutTransaction("u1", null)).resolves.toBe("txn_1");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://sandbox-api.paddle.com/transactions");
    expect(init.headers.Authorization).toBe("Bearer key");
    expect(JSON.parse(init.body)).toEqual({
      items: [{ price_id: "pri_1", quantity: 1 }],
      custom_data: { uid: "u1", uid_sig: await signUid("u1", "uid-secret") },
    });
  });

  it("기존 고객이면 customer_id를 붙인다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ data: { id: "txn_1" } }));
    await new PaddleClient("https://x", "key", "pri_1", "uid-secret", fetchFn).createCheckoutTransaction("u1", "ctm_1");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).customer_id).toBe("ctm_1");
  });

  it("포털 세션의 overview URL을 돌려준다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ data: { urls: { general: { overview: "https://portal/ov" } } } }));
    const url = await new PaddleClient("https://x", "key", "pri_1", "uid-secret", fetchFn).createPortalUrl("ctm_1", "sub_1");
    expect(url).toBe("https://portal/ov");
    expect(fetchFn.mock.calls[0][0]).toBe("https://x/customers/ctm_1/portal-sessions");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ subscription_ids: ["sub_1"] });
  });

  it("Paddle 오류는 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ error: {} }, 400));
    await expect(new PaddleClient("https://x", "key", "pri_1", "uid-secret", fetchFn).createCheckoutTransaction("u1", null)).rejects.toThrow("400");
  });
});
