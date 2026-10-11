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

  it("Paddle 오류 코드와 설명을 메시지에 담는다 — 400의 원인을 로그로 알 수 있게", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes({ error: { code: "transaction_default_checkout_url_not_set", detail: "A Default Payment Link has not yet been defined" } }, 400),
    );
    await expect(new PaddleClient("https://x", "key", "pri_1", "uid-secret", fetchFn).createCheckoutTransaction("u1", null)).rejects.toThrow(
      "Paddle /transactions 실패 (400): transaction_default_checkout_url_not_set — A Default Payment Link has not yet been defined",
    );
  });

  it("오류 본문이 JSON이 아니어도 상태 코드로 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 }));
    await expect(new PaddleClient("https://x", "key", "pri_1", "uid-secret", fetchFn).createCheckoutTransaction("u1", null)).rejects.toThrow(
      "Paddle /transactions 실패 (502)",
    );
  });

  describe("cancelSubscriptionImmediately", () => {
    const client = (fetchFn: ReturnType<typeof vi.fn>) =>
      new PaddleClient("https://x", "key", "pri_1", "uid-secret", fetchFn);

    it("구독을 즉시 해지한다", async () => {
      const fetchFn = vi.fn().mockResolvedValue(jsonRes({ data: { status: "canceled" } }));
      await client(fetchFn).cancelSubscriptionImmediately("sub_1");
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe("https://x/subscriptions/sub_1/cancel");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer key");
      expect(JSON.parse(init.body)).toEqual({ effective_from: "immediately" });
    });

    it("해지 요청이 실패해도 구독이 이미 canceled면 성공으로 본다(재시도 멱등)", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(jsonRes({ error: { code: "subscription_locked_canceled", detail: "x" } }, 400))
        .mockResolvedValueOnce(jsonRes({ data: { status: "canceled" } }));
      await expect(client(fetchFn).cancelSubscriptionImmediately("sub_1")).resolves.toBeUndefined();
      expect(fetchFn.mock.calls[1][0]).toBe("https://x/subscriptions/sub_1");
      expect(fetchFn.mock.calls[1][1].method).toBe("GET");
    });

    it("해지 요청이 실패하고 구독이 살아 있으면 던진다", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(jsonRes({ error: { code: "internal_error", detail: "x" } }, 500))
        .mockResolvedValueOnce(jsonRes({ data: { status: "active" } }));
      await expect(client(fetchFn).cancelSubscriptionImmediately("sub_1")).rejects.toThrow(
        "Paddle 구독 해지 실패 (500): internal_error — x",
      );
    });

    it("상태 조회까지 실패하면 던진다", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(jsonRes({ error: {} }, 500))
        .mockResolvedValueOnce(jsonRes({ error: {} }, 503));
      await expect(client(fetchFn).cancelSubscriptionImmediately("sub_1")).rejects.toThrow("503");
    });
  });
});
