import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleRequest, type BillingDeps } from "../router";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import type { Env } from "../env";

vi.mock("@tododo/worker-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tododo/worker-auth")>()),
  verifyFirebaseIdToken: vi.fn(),
}));
import { verifyFirebaseIdToken } from "@tododo/worker-auth";

const NOW = new Date("2026-10-10T00:00:00.000Z");
const ENV: Env = {
  FIREBASE_PROJECT_ID: "tododo-83576",
  CLIENT_APP_URL: "https://tododo-83576.web.app",
  PADDLE_API_BASE: "https://sandbox-api.paddle.com",
  PADDLE_PRICE_ID: "pri_1",
  BILLING_ALLOWED_UIDS: "u1",
  PADDLE_API_KEY: "key",
  PADDLE_WEBHOOK_SECRET: "whsec",
  GOOGLE_SERVICE_ACCOUNT: "{}",
};

const makeDeps = (existing: EntitlementDoc = EMPTY_ENTITLEMENT) => ({
  store: { get: vi.fn(async () => ({ doc: existing, updateTime: null })), write: vi.fn(async () => "ok" as const) },
  claims: { setPremiumUntil: vi.fn(async () => undefined) },
  paddle: {
    createCheckoutTransaction: vi.fn(async () => "txn_1"),
    createPortalUrl: vi.fn(async () => "https://portal/ov"),
  },
});

const post = (path: string, body?: unknown) =>
  new Request(`https://billing.example${path}`, {
    method: "POST",
    headers: { Authorization: "Bearer id-token", Origin: "https://tododo-83576.web.app", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const call = (request: Request, deps: BillingDeps) => handleRequest(request, ENV, () => deps, NOW);

describe("router", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(verifyFirebaseIdToken).mockReset().mockResolvedValue({ uid: "u1", premium: false, premiumUntil: null });
  });

  it("OPTIONS는 204 + 허용 origin CORS", async () => {
    const res = await call(new Request("https://billing.example/checkout", { method: "OPTIONS", headers: { Origin: "https://tododo-83576.web.app" } }), makeDeps());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
  });

  it("토큰이 없거나 틀리면 401", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValue(new Error("bad"));
    expect((await call(post("/checkout"), makeDeps())).status).toBe(401);
  });

  it("허용 목록 밖이면 403 NOT_ALLOWED이고 Paddle을 부르지 않는다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "stranger", premium: false, premiumUntil: null });
    const deps = makeDeps();
    for (const path of ["/checkout", "/trial", "/portal"]) {
      const res = await call(post(path), deps);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "NOT_ALLOWED" });
    }
    expect(deps.paddle.createCheckoutTransaction).not.toHaveBeenCalled();
    expect(deps.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("/checkout은 본문의 uid를 무시하고 토큰 uid로 거래를 만든다", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, customerId: "ctm_1" });
    const res = await call(post("/checkout", { uid: "victim" }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transactionId: "txn_1" });
    expect(deps.paddle.createCheckoutTransaction).toHaveBeenCalledWith("u1", "ctm_1");
  });

  it("/checkout은 살아 있는 Paddle 구독이 있으면 409 ALREADY_SUBSCRIBED", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, source: "paddle", status: "active", premiumUntil: "2026-11-13T00:00:00.000Z" });
    const res = await call(post("/checkout"), deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "ALREADY_SUBSCRIBED" });
  });

  it("/checkout은 해지돼 기간이 끝난 사용자에게는 다시 허용한다", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, source: "paddle", status: "canceled", premiumUntil: "2026-10-01T00:00:00.000Z" });
    expect((await call(post("/checkout"), deps)).status).toBe(200);
  });

  it("/trial 성공은 200 + premiumUntil", async () => {
    const res = await call(post("/trial"), makeDeps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ premiumUntil: "2026-10-17T00:00:00.000Z" });
  });

  it("/trial 재사용은 409 TRIAL_ALREADY_USED", async () => {
    const res = await call(post("/trial"), makeDeps({ ...EMPTY_ENTITLEMENT, trialUsedAt: "2026-01-01T00:00:00.000Z" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "TRIAL_ALREADY_USED" });
  });

  it("/portal은 고객이 없으면 404 NO_CUSTOMER, 있으면 URL", async () => {
    expect((await call(post("/portal"), makeDeps())).status).toBe(404);
    const res = await call(post("/portal"), makeDeps({ ...EMPTY_ENTITLEMENT, customerId: "ctm_1", subscriptionId: "sub_1" }));
    expect(await res.json()).toEqual({ url: "https://portal/ov" });
  });

  it("예상 못한 예외는 CORS가 붙은 500", async () => {
    const deps = makeDeps();
    deps.paddle.createCheckoutTransaction.mockRejectedValue(new Error("boom"));
    const res = await call(post("/checkout"), deps);
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("의존성 생성이 실패해도(시크릿 누락) CORS가 붙은 500", async () => {
    const res = await handleRequest(post("/checkout"), ENV, () => { throw new Error("GOOGLE_SERVICE_ACCOUNT 없음"); }, NOW);
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("모르는 경로는 404", async () => {
    expect((await call(post("/nope"), makeDeps())).status).toBe(404);
  });
});
