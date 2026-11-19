import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../index";
import { buildDeps } from "../deps";
import { handleRequest, type BillingDeps } from "../router";
import { EMPTY_ENTITLEMENT } from "../entitlement";
import type { Env } from "../env";
import { asStored } from "./helpers/storedDoc";
import { signForTest } from "./helpers/signForTest";
import { signUid } from "../uidSignature";

vi.mock("@tododo/worker-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tododo/worker-auth")>()),
  verifyFirebaseIdToken: vi.fn(),
}));
import { verifyFirebaseIdToken } from "@tododo/worker-auth";

const NOW = new Date("2026-10-10T00:00:05.000Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

/**
 * 스토어 계정이 아직 없는 첫 릴리스의 운영 Worker: Apple·Google·Pub/Sub·appAccountToken 시크릿이 하나도 없다.
 * 결제용 GOOGLE_SERVICE_ACCOUNT는 형식만 맞는 가짜 값이다(토큰 교환은 이 테스트에서 일어나지 않는다).
 */
const ENV_WITHOUT_STORE = {
  FIREBASE_PROJECT_ID: "tododo-83576",
  CLIENT_APP_URL: "https://tododo-83576.web.app",
  PADDLE_API_BASE: "https://sandbox-api.paddle.com",
  PADDLE_PRICE_ID: "pri_1",
  BILLING_ALLOWED_UIDS: "u1",
  PADDLE_API_KEY: "key",
  PADDLE_WEBHOOK_SECRET: "whsec",
  BILLING_UID_SECRET: "uid-secret",
  GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: "billing@test.iam.gserviceaccount.com", private_key: "not-a-key" }),
  APPLE_BUNDLE_ID: "com.swimmingriver.tododo",
  GOOGLE_PLAY_PACKAGE_NAME: "com.swimmingriver.tododo",
} as unknown as Env;

const post = (path: string, body?: string, headers: Record<string, string> = {}) =>
  new Request(`https://billing.example${path}`, {
    method: "POST",
    headers: { Authorization: "Bearer id-token", Origin: "https://tododo-83576.web.app", ...headers },
    body,
  });

/** 실제 buildDeps에서 Firestore·Auth·Paddle 호출만 가짜로 바꾼다 — 스토어 의존성은 진짜(시크릿 없음) 그대로. */
const realDepsWithFakeBackends = () => {
  const real = buildDeps(ENV_WITHOUT_STORE);
  const fakes = {
    store: { get: vi.fn(async () => ({ doc: asStored(EMPTY_ENTITLEMENT), updateTime: null })), write: vi.fn(async () => "ok" as const) },
    claims: { setPremiumUntil: vi.fn(async () => undefined), deleteUser: vi.fn(async () => undefined) },
    paddle: {
      createCheckoutTransaction: vi.fn(async () => "txn_1"),
      createPortalUrl: vi.fn(async () => "https://portal/ov"),
      cancelSubscriptionImmediately: vi.fn(async () => undefined),
    },
    accountData: { deleteUserData: vi.fn(async () => undefined) },
  };
  return { deps: { ...real, ...fakes } as BillingDeps, fakes };
};

describe("스토어 시크릿이 없을 때의 의존성", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(verifyFirebaseIdToken).mockReset().mockResolvedValue({ uid: "u1", premium: false, premiumUntil: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it("buildDeps는 스토어 시크릿 없이도 만들어진다", () => {
    expect(() => buildDeps(ENV_WITHOUT_STORE)).not.toThrow();
  });

  it("실제 Worker 진입점: 서명 없는 Paddle 웹훅은 500이 아니라 401", async () => {
    const res = await worker.fetch(post("/webhooks/paddle", "{}"), ENV_WITHOUT_STORE);
    expect(res.status).toBe(401);
  });

  it("Paddle 웹훅·/trial·/account/delete는 스토어 시크릿 없이 성공한다", async () => {
    const { deps, fakes } = realDepsWithFakeBackends();
    const call = (request: Request) => handleRequest(request, ENV_WITHOUT_STORE, () => deps, NOW);

    const raw = JSON.stringify({
      event_id: "evt_1",
      event_type: "subscription.created",
      occurred_at: "2026-10-10T00:00:00.000Z",
      data: {
        id: "sub_1",
        status: "active",
        customer_id: "ctm_1",
        custom_data: { uid: "u1", uid_sig: await signUid("u1", "uid-secret") },
        current_billing_period: { ends_at: "2026-11-10T00:00:00.000Z" },
        scheduled_change: null,
        items: [{ status: "active", quantity: 1, price: { id: "pri_1" } }],
      },
    });
    const webhook = await call(post("/webhooks/paddle", raw, { "Paddle-Signature": await signForTest(raw, "whsec", NOW_SEC) }));
    expect(webhook.status).toBe(200);
    expect(fakes.store.write).toHaveBeenCalled();

    expect((await call(post("/trial"))).status).toBe(200);
    expect((await call(post("/account/delete"))).status).toBe(204);
    expect(fakes.accountData.deleteUserData).toHaveBeenCalledWith("u1");
  });

  it("/account/delete: 자동 갱신 중인 Google 구독이 있는데 Play 시크릿이 없으면 해지 실패로 보고 아무것도 지우지 않는다(502)", async () => {
    const { deps, fakes } = realDepsWithFakeBackends();
    const google = {
      status: "active", premiumUntil: "2026-12-01T00:00:00.000Z", cancelAt: null, currentPeriodEnd: "2026-12-01T00:00:00.000Z",
      autoRenew: true, startedAt: "2026-10-01T00:00:00.000Z", updatedAt: "", purchaseToken: "gpa-token", productId: "premium_monthly",
      basePlanId: "monthly", environment: "Production", obfuscatedAccountId: null, lastMessageId: null, lastEventTime: null,
    } as const;
    fakes.store.get.mockResolvedValueOnce({
      doc: asStored({ ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "google", premiumUntil: google.premiumUntil, sources: { google } }),
      updateTime: null,
    });
    const res = await handleRequest(post("/account/delete"), ENV_WITHOUT_STORE, () => deps, NOW);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "GOOGLE_CANCEL_FAILED" });
    expect(fakes.accountData.deleteUserData).not.toHaveBeenCalled();
    expect(fakes.claims.deleteUser).not.toHaveBeenCalled();
  });

  it("스토어 경로만 실패한다(500)", async () => {
    const { deps } = realDepsWithFakeBackends();
    const call = (request: Request) => handleRequest(request, ENV_WITHOUT_STORE, () => deps, NOW);
    expect((await call(post("/iap/account-token"))).status).toBe(500);
    await expect(deps.play.getSubscription("token")).rejects.toThrow("GOOGLE_PLAY_SERVICE_ACCOUNT");
    await expect(deps.google.cancelSubscription("token")).rejects.toThrow("GOOGLE_PLAY_SERVICE_ACCOUNT");
    await expect(deps.apple.getSubscriptionSnapshot("otx_1")).rejects.toThrow("APPLE_ISSUER_ID");
    await expect(deps.verifyPubSub("Bearer oidc")).rejects.toThrow("GOOGLE_PUBSUB_AUDIENCE");
    expect((await call(post("/webhooks/google", "{}", { Authorization: "Bearer oidc" }))).status).toBe(500);
  });
});
