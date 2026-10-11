import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config", () => ({ BILLING_PROXY_URL: "https://billing.example" }));
vi.mock("@/shared/lib/authorizedFetch", () => ({ authorizedFetch: vi.fn() }));

import { authorizedFetch } from "@/shared/lib/authorizedFetch";
import { BillingApiError, createCheckout, createPortalUrl, deleteAccountOnServer, startTrial } from "../billingApi";

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("billingApi", () => {
  beforeEach(() => vi.mocked(authorizedFetch).mockReset());

  it("createCheckout은 본문 없이 POST하고 transactionId를 돌려준다", async () => {
    vi.mocked(authorizedFetch).mockResolvedValue(jsonRes({ transactionId: "txn_1" }));
    await expect(createCheckout()).resolves.toBe("txn_1");
    expect(authorizedFetch).toHaveBeenCalledWith("https://billing.example", "/checkout", { method: "POST" });
  });

  it("오류 응답은 status와 code가 담긴 BillingApiError", async () => {
    vi.mocked(authorizedFetch).mockResolvedValue(jsonRes({ error: "NOT_ALLOWED" }, 403));
    await expect(startTrial()).rejects.toMatchObject({ status: 403, code: "NOT_ALLOWED" });
    vi.mocked(authorizedFetch).mockResolvedValue(new Response("boom", { status: 500 }));
    const error = await createPortalUrl().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BillingApiError);
    expect(error).toMatchObject({ status: 500, code: null });
  });

  describe("deleteAccountOnServer", () => {
    it("POST /account/delete를 부르고 204면 resolve", async () => {
      vi.mocked(authorizedFetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
      await expect(deleteAccountOnServer()).resolves.toBeUndefined();
      expect(authorizedFetch).toHaveBeenCalledWith("https://billing.example", "/account/delete", { method: "POST" });
    });

    it("실패하면 서버 오류 코드를 담은 BillingApiError", async () => {
      vi.mocked(authorizedFetch).mockResolvedValueOnce(jsonRes({ error: "PADDLE_CANCEL_FAILED" }, 502));
      await expect(deleteAccountOnServer()).rejects.toMatchObject({ status: 502, code: "PADDLE_CANCEL_FAILED" });
    });

    it("주소가 비어 있으면 NOT_CONFIGURED로 실패한다(조용히 성공하지 않는다)", async () => {
      vi.resetModules();
      vi.doMock("../../config", () => ({ BILLING_PROXY_URL: "" }));
      try {
        const api = await import("../billingApi");
        const { authorizedFetch: freshFetch } = await import("@/shared/lib/authorizedFetch");
        await expect(api.deleteAccountOnServer()).rejects.toMatchObject({ status: 0, code: "NOT_CONFIGURED" });
        expect(freshFetch).not.toHaveBeenCalled();
      } finally {
        vi.doUnmock("../../config");
        vi.resetModules();
      }
    });
  });
});
