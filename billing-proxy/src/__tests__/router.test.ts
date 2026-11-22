import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleRequest, type BillingDeps } from "../router";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import type { AppleRecord, PaddleRecord } from "@tododo/core/dist/entitlement/index.js";
import type { Env } from "../env";
import { deriveAccountToken } from "../accountToken";
import { asStored } from "./helpers/storedDoc";
import { AppleJwsError } from "../apple/jws";

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
  BILLING_UID_SECRET: "uid-secret",
  IAP_ACCOUNT_TOKEN_SECRET: "iap-secret",
  APPLE_BUNDLE_ID: "com.swimmingriver.tododo",
  APPLE_ISSUER_ID: "test-issuer",
  APPLE_KEY_ID: "test-key",
  APPLE_PRIVATE_KEY: "test-pem",
  GOOGLE_PLAY_PACKAGE_NAME: "com.swimmingriver.tododo",
  GOOGLE_PLAY_SERVICE_ACCOUNT: "{}",
  GOOGLE_PUBSUB_AUDIENCE: "https://billing.example/iap/google/notify",
  GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL: "pubsub@test.iam.gserviceaccount.com",
};

const PADDLE_IDS = { customerId: "ctm_1", subscriptionId: "sub_1" };
const paddleRecord = (overrides: Partial<PaddleRecord> = {}): PaddleRecord => ({
  status: "active",
  premiumUntil: null,
  cancelAt: null,
  currentPeriodEnd: null,
  autoRenew: true,
  startedAt: null,
  updatedAt: "",
  customerId: "ctm_1",
  subscriptionId: "sub_1",
  lastWebhookEventId: null,
  lastEventOccurredAt: null,
  ...overrides,
});
const APPLE: AppleRecord = {
  status: "active",
  premiumUntil: "2026-12-01T00:00:00.000Z",
  cancelAt: null,
  currentPeriodEnd: "2026-12-01T00:00:00.000Z",
  autoRenew: true,
  startedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "",
  originalTransactionId: "otx_1",
  productId: "premium_monthly",
  environment: "Production",
  appAccountToken: null,
  lastNotificationUUID: null,
  lastSignedDate: null,
};

const makeDeps = (existing: EntitlementDoc = EMPTY_ENTITLEMENT) => ({
  store: { get: vi.fn(async () => ({ doc: asStored(existing), updateTime: null })), write: vi.fn(async () => "ok" as const) },
  claims: { setPremiumUntil: vi.fn(async () => undefined), deleteUser: vi.fn(async () => undefined) },
  paddle: {
    createCheckoutTransaction: vi.fn(async () => "txn_1"),
    createPortalUrl: vi.fn(async () => "https://portal/ov"),
    cancelSubscriptionImmediately: vi.fn(async () => undefined),
  },
  accountData: { deleteUserData: vi.fn(async () => undefined) },
  storeLinks: { get: vi.fn(async () => ({ link: null, updateTime: null })), put: vi.fn(async () => "ok" as const) },
  apple: { getSubscriptionSnapshot: vi.fn(async () => null), sendConsumptionInfo: vi.fn(async () => undefined) },
  verifyAppleJws: vi.fn(async (_jws: string): Promise<unknown> => {
    throw new AppleJwsError("JWS 형식이 아님");
  }),
  play: {
    getSubscription: vi.fn(async (_token: string) => null),
    acknowledge: vi.fn(async (_productId: string, _token: string) => undefined),
  },
  google: { cancelSubscription: vi.fn(async (_token: string): Promise<"canceled" | "already_inactive"> => "canceled") },
  verifyPubSub: vi.fn(async (_authHeader: string | null) => false),
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
    vi.mocked(verifyFirebaseIdToken).mockReset().mockResolvedValue({ uid: "u1", premium: false, premiumUntil: null, identities: {} });
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
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "stranger", premium: false, premiumUntil: null, identities: {} });
    const deps = makeDeps();
    for (const path of ["/checkout", "/trial", "/portal"]) {
      const res = await call(post(path), deps);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "NOT_ALLOWED" });
    }
    expect(deps.paddle.createCheckoutTransaction).not.toHaveBeenCalled();
    expect(deps.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("POST /iap/account-token requires auth and returns token", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValue(new Error("bad"));
    expect((await call(post("/iap/account-token"), makeDeps())).status).toBe(401);

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "u1", premium: false, premiumUntil: null, identities: {} });
    const res = await call(post("/iap/account-token"), makeDeps());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { appAccountToken: string };
    expect(body.appAccountToken).toBe(await deriveAccountToken("u1", "iap-secret"));
  });

  it("/checkout은 본문의 uid를 무시하고 토큰 uid로 거래를 만든다", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, source: "paddle", status: "canceled", customerId: "ctm_1", subscriptionId: "sub_1", premiumUntil: "2026-10-01T00:00:00.000Z" });
    const res = await call(post("/checkout", { uid: "victim" }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transactionId: "txn_1" });
    expect(deps.paddle.createCheckoutTransaction).toHaveBeenCalledWith("u1", "ctm_1");
  });

  it("/checkout은 살아 있는 Paddle 구독이 있으면 409 ALREADY_SUBSCRIBED", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, ...PADDLE_IDS, source: "paddle", status: "active", premiumUntil: "2026-11-13T00:00:00.000Z" });
    const res = await call(post("/checkout"), deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "ALREADY_SUBSCRIBED" });
  });

  it("/checkout은 해지돼 기간이 끝난 사용자에게는 다시 허용한다", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, ...PADDLE_IDS, source: "paddle", status: "canceled", premiumUntil: "2026-10-01T00:00:00.000Z" });
    expect((await call(post("/checkout"), deps)).status).toBe(200);
  });

  it("handleCheckout returns ALREADY_SUBSCRIBED from sources.paddle even if representative is apple", async () => {
    const paddle = paddleRecord({ premiumUntil: "2026-11-13T00:00:00.000Z" });
    const deps = makeDeps({
      ...EMPTY_ENTITLEMENT,
      plan: "premium",
      status: "active",
      source: "apple",
      premiumUntil: "2026-12-01T00:00:00.000Z",
      sources: { paddle, apple: APPLE },
    });
    const res = await call(post("/checkout"), deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "ALREADY_SUBSCRIBED" });
    expect(deps.paddle.createCheckoutTransaction).not.toHaveBeenCalled();
  });

  it("handleCheckout uses sources.paddle.customerId", async () => {
    // 최상위 customerId가 비어 있어도 Paddle 기록의 고객으로 결제를 묶어 고객이 둘로 갈라지지 않게 한다.
    const paddle = paddleRecord({ status: "canceled", premiumUntil: "2026-10-01T00:00:00.000Z", customerId: "ctm_paddle" });
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, customerId: null, sources: { paddle } });
    expect((await call(post("/checkout"), deps)).status).toBe(200);
    expect(deps.paddle.createCheckoutTransaction).toHaveBeenCalledWith("u1", "ctm_paddle");
  });

  it("/checkout은 Apple로만 프리미엄이면 막지 않는다(이중 구독 경고는 화면 몫)", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "apple", premiumUntil: "2026-12-01T00:00:00.000Z", sources: { apple: APPLE } });
    expect((await call(post("/checkout"), deps)).status).toBe(200);
    expect(deps.paddle.createCheckoutTransaction).toHaveBeenCalledWith("u1", null);
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

  it("POST /webhooks/paddle은 Firebase 인증·허용 목록을 거치지 않고 웹훅 핸들러로 간다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValue(new Error("bad"));
    const deps = makeDeps();
    const res = await call(
      new Request("https://billing.example/webhooks/paddle", {
        method: "POST",
        headers: { "Paddle-Signature": "ts=1;h1=00" },
        body: "{}",
      }),
      deps,
    );
    // 401 UNAUTHORIZED(JSON)나 403 NOT_ALLOWED가 아니라 핸들러의 서명 실패 응답이어야 한다.
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid signature");
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
    expect(deps.store.get).not.toHaveBeenCalled();
  });

  it("not allowed uid → 403 on /iap/apple/verify", async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "stranger", premium: false, premiumUntil: null, identities: {} });
    const deps = makeDeps();
    const res = await call(post("/iap/apple/verify", { jws: "a.b.c" }), deps);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "NOT_ALLOWED" });
    expect(deps.verifyAppleJws).not.toHaveBeenCalled();
  });

  it("POST /iap/apple/verify는 인증을 요구하고 본문을 핸들러로 넘긴다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    expect((await call(post("/iap/apple/verify", { jws: "a.b.c" }), makeDeps())).status).toBe(401);

    const deps = makeDeps();
    const res = await call(post("/iap/apple/verify", { jws: "a.b.c" }), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_TRANSACTION" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
    expect(deps.verifyAppleJws).toHaveBeenCalledWith("a.b.c");
  });

  it("POST /webhooks/apple은 Firebase 인증·허용 목록 없이 서명 검증으로 간다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValue(new Error("bad"));
    const deps = makeDeps();
    const res = await call(
      new Request("https://billing.example/webhooks/apple", { method: "POST", body: JSON.stringify({ signedPayload: "a.b.c" }) }),
      deps,
    );
    expect(res.status).toBe(401);
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
    expect(deps.verifyAppleJws).toHaveBeenCalledWith("a.b.c");
  });

  it("not allowed uid → 403 on /iap/google/verify", async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "stranger", premium: false, premiumUntil: null, identities: {} });
    const deps = makeDeps();
    const res = await call(post("/iap/google/verify", { purchaseToken: "t", productId: "premium_monthly" }), deps);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "NOT_ALLOWED" });
    expect(deps.play.getSubscription).not.toHaveBeenCalled();
  });

  it("POST /iap/google/verify는 인증을 요구하고 본문을 핸들러로 넘긴다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    const body = { purchaseToken: "t", productId: "premium_monthly" };
    expect((await call(post("/iap/google/verify", body), makeDeps())).status).toBe(401);

    const deps = makeDeps();
    const res = await call(post("/iap/google/verify", body), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_PURCHASE" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
    expect(deps.play.getSubscription).toHaveBeenCalledWith("t");
  });

  it("POST /webhooks/google은 Firebase 인증·허용 목록 없이 Pub/Sub OIDC 검증으로 간다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValue(new Error("bad"));
    const deps = makeDeps();
    const res = await call(
      new Request("https://billing.example/webhooks/google", {
        method: "POST",
        headers: { Authorization: "Bearer oidc" },
        body: JSON.stringify({ message: { data: "", messageId: "m" } }),
      }),
      deps,
    );
    expect(res.status).toBe(401);
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
    expect(deps.verifyPubSub).toHaveBeenCalledWith("Bearer oidc");
  });

  it("모르는 경로는 404", async () => {
    expect((await call(post("/nope"), makeDeps())).status).toBe(404);
  });

  describe("/account/delete", () => {
    it("허용 목록 밖 사용자도 탈퇴할 수 있다(204 + CORS)", async () => {
      vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "stranger", premium: false, premiumUntil: null, identities: {} });
      const deps = makeDeps();
      const res = await call(post("/account/delete"), deps);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
      expect(deps.accountData.deleteUserData).toHaveBeenCalledWith("stranger");
      expect(deps.claims.deleteUser).toHaveBeenCalledWith("stranger");
    });

    it("토큰이 틀리면 401이고 아무것도 지우지 않는다", async () => {
      vi.mocked(verifyFirebaseIdToken).mockRejectedValue(new Error("bad"));
      const deps = makeDeps();
      expect((await call(post("/account/delete"), deps)).status).toBe(401);
      expect(deps.accountData.deleteUserData).not.toHaveBeenCalled();
    });

    it("GET은 404", async () => {
      const res = await call(new Request("https://billing.example/account/delete", { method: "GET" }), makeDeps());
      expect(res.status).toBe(404);
    });

    it("삭제 중 예외는 CORS가 붙은 500", async () => {
      const deps = makeDeps();
      deps.accountData.deleteUserData.mockRejectedValueOnce(new Error("boom"));
      const res = await call(post("/account/delete"), deps);
      expect(res.status).toBe(500);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
    });
  });
});
