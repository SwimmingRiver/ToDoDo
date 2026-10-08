import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config", () => ({ BILLING_PROXY_URL: "https://billing.example" }));
vi.mock("@/shared/lib/authorizedFetch", () => ({ authorizedFetch: vi.fn() }));

import { authorizedFetch } from "@/shared/lib/authorizedFetch";
import { BillingApiError, createCheckout, createPortalUrl, startTrial } from "../billingApi";

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
});
