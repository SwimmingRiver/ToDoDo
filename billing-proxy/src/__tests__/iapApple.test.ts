import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import type { AppleRecord } from "@tododo/core/dist/entitlement/index.js";
import { handleAppleVerify, handleAppleWebhook, type AppleIapDeps } from "../handlers/iapApple";
import { verifyAppleJws } from "../apple/jws";
import type { AppleSnapshot, AppleTransaction } from "../apple/decide";
import { deriveAccountToken } from "../accountToken";
import { UserNotFoundError } from "../claims";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import type { StoreLink } from "../storeLinks";
import { asStored } from "./helpers/storedDoc";
import { handleRequest, type BillingDeps } from "../router";
import type { Env } from "../env";
import { makeAppleTestChain, signTestJws, NOW, type TestChain } from "./helpers/appleTestChain";

const BUNDLE = "com.swimmingriver.tododo";
const ENV = { APPLE_BUNDLE_ID: BUNDLE, IAP_ACCOUNT_TOKEN_SECRET: "iap-secret" };
const REPLY_ENV = { ...ENV, APPLE_CONSUMPTION_REPLY_ENABLED: "true" };
const ROUTER_ENV = { ...ENV, APPLE_BUNDLE_ID: BUNDLE, FIREBASE_PROJECT_ID: "p", CLIENT_APP_URL: "https://x" } as unknown as Env;
const DAY = 24 * 60 * 60 * 1000;
const EXPIRES = NOW.getTime() + 30 * DAY;

let chain: TestChain;
let otherChain: TestChain;
let TOKEN_U1 = "";

const transaction = (over: Partial<AppleTransaction> = {}): AppleTransaction => ({
  originalTransactionId: "otx_1",
  transactionId: "tx_2",
  bundleId: BUNDLE,
  productId: "premium_monthly",
  purchaseDate: NOW.getTime() - DAY,
  originalPurchaseDate: NOW.getTime() - 10 * DAY,
  expiresDate: EXPIRES,
  environment: "Production",
  appAccountToken: TOKEN_U1,
  ...over,
});

const snapshot = (over: Partial<AppleSnapshot> = {}): AppleSnapshot => ({
  status: 1,
  transaction: transaction(),
  renewal: { autoRenewStatus: 1 },
  notificationUUID: null,
  signedDate: null,
  ...over,
});

const deps = (existing: EntitlementDoc = EMPTY_ENTITLEMENT, link: StoreLink | null = null) => {
  const order: string[] = [];
  const d = {
    order,
    store: {
      get: vi.fn(async (_uid: string) => ({ doc: asStored(existing), updateTime: null as string | null })),
      write: vi.fn(async (_uid: string, _doc: EntitlementDoc, _updateTime: string | null) => {
        order.push("doc");
        return "ok" as const;
      }),
    },
    claims: {
      setPremiumUntil: vi.fn(async (_uid: string, _seconds: number) => {
        order.push("claim");
      }),
    },
    storeLinks: {
      get: vi.fn(async (_store: "apple" | "google", _id: string) => ({
        link,
        updateTime: link ? "2026-05-01T00:00:00Z" : (null as string | null),
      })),
      put: vi.fn(async (_store: "apple" | "google", _id: string, _link: StoreLink, _updateTime: string | null) => "ok" as "ok" | "conflict"),
    },
    apple: {
      getSubscriptionSnapshot: vi.fn(async (_id: string): Promise<AppleSnapshot | null> => snapshot()),
      sendConsumptionInfo: vi.fn(async (_id: string, _env: "Production" | "Sandbox", _body: unknown): Promise<void> => undefined),
    },
    verifyAppleJws: (jws: string) => verifyAppleJws<unknown>(jws, { trustedRootsDer: [chain.rootDer], now: NOW }),
  };
  return d satisfies AppleIapDeps;
};

const verifyRequest = (body: unknown) =>
  new Request("https://billing.example/iap/apple/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const webhookRequest = (body: unknown) =>
  new Request("https://billing.example/webhooks/apple", { method: "POST", body: JSON.stringify(body) });

const notification = async (
  over: Record<string, unknown> = {},
  data: Record<string, unknown> | null = {},
  tx: AppleTransaction = transaction(),
) =>
  signTestJws(
    {
      notificationType: "DID_RENEW",
      notificationUUID: "uuid-1",
      signedDate: NOW.getTime() - 1000,
      version: "2.0",
      ...(data === null
        ? {}
        : {
            data: {
              bundleId: BUNDLE,
              environment: "Production",
              status: 1,
              signedTransactionInfo: await signTestJws(tx, chain),
              signedRenewalInfo: await signTestJws({ autoRenewStatus: 1 }, chain),
              ...data,
            },
          }),
      ...over,
    },
    chain,
  );

const linkU1: StoreLink = { uid: "u1", linkedAt: "2026-05-01T00:00:00.000Z", accountToken: null };

describe("handleAppleVerify", () => {
  beforeAll(async () => {
    chain = await makeAppleTestChain();
    otherChain = await makeAppleTestChain();
    TOKEN_U1 = await deriveAccountToken("u1", ENV.IAP_ACCOUNT_TOKEN_SECRET);
  });
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("valid jws → link created, sources.apple written, claim set before doc", async () => {
    const d = deps();
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws: await signTestJws(transaction(), chain) }));
    expect(res.status).toBe(200);
    const premiumUntil = new Date(EXPIRES + 3 * DAY).toISOString();
    expect(await res.json()).toEqual({ premiumUntil });

    expect(d.storeLinks.put).toHaveBeenCalledWith(
      "apple",
      "otx_1",
      { uid: "u1", linkedAt: NOW.toISOString(), accountToken: TOKEN_U1 },
      null,
    );
    // 규칙 R4: 구독 조회는 원거래 id로 한다.
    expect(d.apple.getSubscriptionSnapshot).toHaveBeenCalledWith("otx_1");
    expect(d.order).toEqual(["claim", "doc"]);
    const written = d.store.write.mock.calls[0][1];
    expect(written.sources.apple?.originalTransactionId).toBe("otx_1");
    expect(written.sources.apple?.premiumUntil).toBe(premiumUntil);
    expect(d.claims.setPremiumUntil).toHaveBeenCalledWith("u1", Math.floor((EXPIRES + 3 * DAY) / 1000));
  });

  it("상태는 JWS 거래가 아니라 서버 조회 스냅샷으로 정한다", async () => {
    const d = deps();
    d.apple.getSubscriptionSnapshot.mockResolvedValue(snapshot({ status: 2 }));
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws: await signTestJws(transaction(), chain) }));
    expect(res.status).toBe(200);
    // 만료는 premiumUntil = 지금(스펙 4절)
    expect(await res.json()).toEqual({ premiumUntil: NOW.toISOString() });
    expect(d.store.write.mock.calls[0][1].sources.apple?.status).toBe("canceled");
  });

  it("bundleId mismatch → 400 INVALID_TRANSACTION", async () => {
    const d = deps();
    const res = await handleAppleVerify(
      "u1",
      d,
      NOW,
      ENV,
      verifyRequest({ jws: await signTestJws(transaction({ bundleId: "com.other.app" }), chain) }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_TRANSACTION" });
    expect(d.storeLinks.put).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("서명이 틀린 JWS·빈 본문·형식 오류 거래 → 400 INVALID_TRANSACTION", async () => {
    const d = deps();
    const bodies = [
      { jws: await signTestJws(transaction(), otherChain) },
      { jws: "" },
      {},
      { jws: 42 },
      { jws: await signTestJws({ originalTransactionId: "otx_1" }, chain) },
    ];
    for (const body of bodies) {
      const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "INVALID_TRANSACTION" });
    }
    const notJson = new Request("https://billing.example/iap/apple/verify", { method: "POST", body: "{" });
    expect((await handleAppleVerify("u1", d, NOW, ENV, notJson)).status).toBe(400);
    expect(d.storeLinks.put).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("스냅샷 조회 결과가 없으면 400 INVALID_TRANSACTION이고 권한을 쓰지 않는다", async () => {
    const d = deps();
    d.apple.getSubscriptionSnapshot.mockResolvedValue(null);
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws: await signTestJws(transaction(), chain) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_TRANSACTION" });
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("조회한 구독의 원거래 id가 요청 거래와 다르면 400 INVALID_TRANSACTION", async () => {
    const d = deps();
    d.apple.getSubscriptionSnapshot.mockResolvedValue(snapshot({ transaction: transaction({ originalTransactionId: "otx_9" }) }));
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws: await signTestJws(transaction(), chain) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_TRANSACTION" });
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("linked to other uid → 409, nothing written", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { ...linkU1, uid: "u2" });
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws: await signTestJws(transaction(), chain) }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "LINKED_TO_OTHER_ACCOUNT" });
    expect(d.storeLinks.put).not.toHaveBeenCalled();
    expect(d.apple.getSubscriptionSnapshot).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("token mismatch on unlinked → links and logs", async () => {
    const d = deps();
    const jws = await signTestJws(transaction({ appAccountToken: "00000000-0000-4000-8000-000000000000" }), chain);
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws }));
    expect(res.status).toBe(200);
    expect(d.storeLinks.put).toHaveBeenCalledWith(
      "apple",
      "otx_1",
      { uid: "u1", linkedAt: NOW.toISOString(), accountToken: "00000000-0000-4000-8000-000000000000" },
      null,
    );
    expect(console.warn).toHaveBeenCalledTimes(1);
    const logged = vi.mocked(console.warn).mock.calls[0].join(" ");
    expect(logged).toContain("u1");
    expect(logged).toContain("otx_1");
    // 토큰 값은 로그에 남기지 않는다.
    expect(logged).not.toContain("00000000-0000-4000-8000-000000000000");
    expect(logged).not.toContain(TOKEN_U1);
  });

  it("같은 계정의 기존 연결은 linkedAt을 유지하고 updateTime 사전조건으로 갱신한다", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws: await signTestJws(transaction(), chain) }));
    expect(res.status).toBe(200);
    expect(d.storeLinks.put).toHaveBeenCalledWith(
      "apple",
      "otx_1",
      { uid: "u1", linkedAt: linkU1.linkedAt, accountToken: TOKEN_U1 },
      "2026-05-01T00:00:00Z",
    );
  });

  it("연결 쓰기 경합: 다시 읽어 다른 계정이 먼저 연결했으면 409", async () => {
    const d = deps();
    d.storeLinks.put.mockResolvedValueOnce("conflict");
    d.storeLinks.get
      .mockResolvedValueOnce({ link: null, updateTime: null })
      .mockResolvedValueOnce({ link: { ...linkU1, uid: "u2" }, updateTime: "t2" });
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws: await signTestJws(transaction(), chain) }));
    expect(res.status).toBe(409);
    expect(d.storeLinks.put).toHaveBeenCalledTimes(1);
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("연결 쓰기 경합: 같은 계정의 병렬 요청이 먼저 연결했으면 재연결로 진행", async () => {
    const d = deps();
    d.storeLinks.put.mockResolvedValueOnce("conflict");
    d.storeLinks.get
      .mockResolvedValueOnce({ link: null, updateTime: null })
      .mockResolvedValueOnce({ link: linkU1, updateTime: "t2" });
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws: await signTestJws(transaction(), chain) }));
    expect(res.status).toBe(200);
    expect(d.storeLinks.put).toHaveBeenCalledTimes(2);
    expect(d.storeLinks.put.mock.calls[1][3]).toBe("t2");
  });

  it("다른 유효한 Apple 구독을 추적 중이면 쓰지 않고 현재 premiumUntil을 돌려준다", async () => {
    const other: AppleRecord = {
      status: "active",
      premiumUntil: "2026-08-01T00:00:00.000Z",
      cancelAt: null,
      currentPeriodEnd: "2026-07-29T00:00:00.000Z",
      autoRenew: true,
      startedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "",
      originalTransactionId: "otx_other",
      productId: "premium_monthly",
      environment: "Production",
      appAccountToken: null,
      lastNotificationUUID: null,
      lastSignedDate: null,
    };
    const d = deps({
      ...EMPTY_ENTITLEMENT,
      plan: "premium",
      status: "active",
      source: "apple",
      premiumUntil: "2026-08-01T00:00:00.000Z",
      sources: { apple: other },
    });
    const res = await handleAppleVerify("u1", d, NOW, ENV, verifyRequest({ jws: await signTestJws(transaction(), chain) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ premiumUntil: "2026-08-01T00:00:00.000Z" });
    expect(d.store.write).not.toHaveBeenCalled();
  });
});

describe("handleAppleWebhook", () => {
  beforeAll(async () => {
    chain ??= await makeAppleTestChain();
    otherChain ??= await makeAppleTestChain();
    TOKEN_U1 ||= await deriveAccountToken("u1", ENV.IAP_ACCOUNT_TOKEN_SECRET);
  });
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("webhook before link is a no-op", async () => {
    const d = deps();
    const res = await handleAppleWebhook(webhookRequest({ signedPayload: await notification() }), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.storeLinks.get).toHaveBeenCalledWith("apple", "otx_1");
    expect(d.storeLinks.put).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("DID_RENEW for linked → sources.apple updated with notificationUUID/signedDate", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const res = await handleAppleWebhook(webhookRequest({ signedPayload: await notification() }), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.order).toEqual(["claim", "doc"]);
    expect(d.store.get).toHaveBeenCalledWith("u1");
    const apple = d.store.write.mock.calls[0][1].sources.apple;
    expect(apple?.lastNotificationUUID).toBe("uuid-1");
    expect(apple?.lastSignedDate).toBe(new Date(NOW.getTime() - 1000).toISOString());
    expect(apple?.premiumUntil).toBe(new Date(EXPIRES + 3 * DAY).toISOString());
    expect(apple?.environment).toBe("Production");
    expect(d.apple.getSubscriptionSnapshot).toHaveBeenCalledWith("otx_1");
  });

  it("webhook uses API snapshot and keeps notificationUUID/signedDate", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    // 알림 거래는 만료가 짧지만 API의 현재 상태는 더 긴 기간이다 — 상태는 API를 따른다.
    const later = EXPIRES + 30 * DAY;
    d.apple.getSubscriptionSnapshot.mockResolvedValue(
      snapshot({ transaction: transaction({ transactionId: "tx_3", expiresDate: later }), notificationUUID: null, signedDate: null }),
    );
    const payload = await notification({ notificationUUID: "uuid-api", signedDate: NOW.getTime() - 5000 });
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(200);
    const apple = d.store.write.mock.calls[0][1].sources.apple;
    expect(apple?.premiumUntil).toBe(new Date(later + 3 * DAY).toISOString());
    expect(apple?.lastNotificationUUID).toBe("uuid-api");
    expect(apple?.lastSignedDate).toBe(new Date(NOW.getTime() - 5000).toISOString());
  });

  it("REFUND of an older renewal while current period paid keeps premium", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const oldTx = transaction({ transactionId: "tx_1", expiresDate: NOW.getTime() - 5 * DAY, revocationDate: NOW.getTime() - DAY });
    const payload = await notification({ notificationType: "REFUND" }, {}, oldTx);
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(200);
    const apple = d.store.write.mock.calls[0][1].sources.apple;
    expect(apple?.status).toBe("active");
    expect(apple?.premiumUntil).toBe(new Date(EXPIRES + 3 * DAY).toISOString());
  });

  it("REFUND of the current transaction revokes", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    d.apple.getSubscriptionSnapshot.mockResolvedValue(
      snapshot({ status: 5, transaction: transaction({ revocationDate: NOW.getTime() - 1000 }) }),
    );
    const payload = await notification({ notificationType: "REFUND" }, {}, transaction({ revocationDate: NOW.getTime() - 1000 }));
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(200);
    const apple = d.store.write.mock.calls[0][1].sources.apple;
    expect(apple?.status).toBe("canceled");
    expect(apple?.premiumUntil).toBe(NOW.toISOString());
  });

  it("REFUND_DECLINED on old tx does not shorten premium", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const oldTx = transaction({ transactionId: "tx_1", expiresDate: NOW.getTime() - 5 * DAY });
    const payload = await notification({ notificationType: "REFUND_DECLINED" }, {}, oldTx);
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(200);
    expect(d.store.write.mock.calls[0][1].sources.apple?.premiumUntil).toBe(new Date(EXPIRES + 3 * DAY).toISOString());
  });

  it("snapshot null → 200 no write", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    d.apple.getSubscriptionSnapshot.mockResolvedValue(null);
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: await notification() }), ENV, d, NOW)).status).toBe(200);
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("조회한 구독의 원거래 id가 다르면 200 no write", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    d.apple.getSubscriptionSnapshot.mockResolvedValue(snapshot({ transaction: transaction({ originalTransactionId: "otx_9" }) }));
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: await notification() }), ENV, d, NOW)).status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("API error → 500", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    d.apple.getSubscriptionSnapshot.mockRejectedValue(new Error("App Store Server API 오류: 503"));
    const req = webhookRequest({ signedPayload: await notification() });
    await expect(handleAppleWebhook(req.clone(), ENV, d, NOW)).rejects.toThrow("503");
    const res = await handleRequest(req, ROUTER_ENV, () => d as unknown as BillingDeps, NOW);
    expect(res.status).toBe(500);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("거래 bundleId만 다르면(data.bundleId는 일치) 200 no write", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const payload = await notification({}, {}, transaction({ bundleId: "com.other.app" }));
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(200);
    expect(d.storeLinks.get).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("거래의 appAccountToken이 다른 계정 것이어도 연결된 uid에 반영한다", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { ...linkU1, uid: "u-linked" });
    const foreign = await deriveAccountToken("u-someone-else", ENV.IAP_ACCOUNT_TOKEN_SECRET);
    const payload = await notification({}, {}, transaction({ appAccountToken: foreign }));
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(200);
    expect(d.store.get).toHaveBeenCalledWith("u-linked");
    expect(d.store.write.mock.calls[0][0]).toBe("u-linked");
    expect(d.claims.setPremiumUntil.mock.calls[0][0]).toBe("u-linked");
  });

  it("Sandbox 알림도 반영하고 환경을 기록한다", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    d.apple.getSubscriptionSnapshot.mockResolvedValue(snapshot({ transaction: transaction({ environment: "Sandbox" }) }));
    const payload = await notification({}, { environment: "Sandbox" }, transaction({ environment: "Sandbox" }));
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(200);
    expect(d.store.write.mock.calls[0][1].sources.apple?.environment).toBe("Sandbox");
  });

  it("조회한 갱신 정보가 자동 갱신 끔이면 만료 시각 그대로(유예 없음)", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    d.apple.getSubscriptionSnapshot.mockResolvedValue(snapshot({ renewal: { autoRenewStatus: 0 } }));
    const payload = await notification(
      { notificationType: "DID_CHANGE_RENEWAL_STATUS", subtype: "AUTO_RENEW_DISABLED" },
      { signedRenewalInfo: await signTestJws({ autoRenewStatus: 0 }, chain) },
    );
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(200);
    const apple = d.store.write.mock.calls[0][1].sources.apple;
    expect(apple?.autoRenew).toBe(false);
    expect(apple?.premiumUntil).toBe(new Date(EXPIRES).toISOString());
  });

  it("TEST notification → 200 no write", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const payload = await notification({ notificationType: "TEST" }, null);
    const res = await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.storeLinks.get).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("거래 정보가 없는 알림은 200 no write(CONSUMPTION_REQUEST여도 회신하지 않음)", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const payload = await notification(
      { notificationType: "CONSUMPTION_REQUEST" },
      { signedTransactionInfo: undefined, signedRenewalInfo: undefined },
    );
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), REPLY_ENV, d, NOW)).status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
    expect(d.apple.sendConsumptionInfo).not.toHaveBeenCalled();
  });

  describe("CONSUMPTION_REQUEST", () => {
    const consumption = (tx: AppleTransaction = transaction(), data: Record<string, unknown> = {}) =>
      notification({ notificationType: "CONSUMPTION_REQUEST", notificationUUID: "uuid-c" }, data, tx);

    it("webhook CONSUMPTION_REQUEST → sendConsumptionInfo called with transactionId from signedTransactionInfo and notification environment", async () => {
      const d = deps(EMPTY_ENTITLEMENT, linkU1);
      const payload = await consumption(transaction({ transactionId: "tx_9", purchaseDate: NOW.getTime() - DAY }), {
        environment: "Sandbox",
      });
      expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), REPLY_ENV, d, NOW)).status).toBe(200);
      expect(d.apple.sendConsumptionInfo).toHaveBeenCalledTimes(1);
      const [id, env, body] = d.apple.sendConsumptionInfo.mock.calls[0];
      expect(id).toBe("tx_9");
      expect(env).toBe("Sandbox");
      expect(body).toMatchObject({ customerConsented: true, refundPreference: "GRANT_FULL" });
    });

    it("구매 14일 초과면 거절 희망(DECLINE)으로 회신", async () => {
      const d = deps(EMPTY_ENTITLEMENT, linkU1);
      const payload = await consumption(transaction({ purchaseDate: NOW.getTime() - 14 * DAY - 1 }));
      await handleAppleWebhook(webhookRequest({ signedPayload: payload }), REPLY_ENV, d, NOW);
      const [, env, body] = d.apple.sendConsumptionInfo.mock.calls[0];
      expect(env).toBe("Production");
      expect(body).toMatchObject({ refundPreference: "DECLINE" });
    });

    it("webhook CONSUMPTION_REQUEST → entitlement not written", async () => {
      const d = deps(EMPTY_ENTITLEMENT, linkU1);
      await handleAppleWebhook(webhookRequest({ signedPayload: await consumption() }), REPLY_ENV, d, NOW);
      expect(d.store.write).not.toHaveBeenCalled();
      expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
      expect(d.storeLinks.put).not.toHaveBeenCalled();
      expect(d.apple.getSubscriptionSnapshot).not.toHaveBeenCalled();
    });

    it("webhook CONSUMPTION_REQUEST, sendConsumptionInfo throws → still 200 with error log", async () => {
      const d = deps(EMPTY_ENTITLEMENT, linkU1);
      d.apple.sendConsumptionInfo.mockRejectedValue(new Error("App Store Server API 오류: 500"));
      const res = await handleAppleWebhook(webhookRequest({ signedPayload: await consumption() }), REPLY_ENV, d, NOW);
      expect(res.status).toBe(200);
      expect(console.error).toHaveBeenCalled();
      expect(d.store.write).not.toHaveBeenCalled();
    });

    it("webhook CONSUMPTION_REQUEST for unlinked transaction → still replies", async () => {
      const d = deps(EMPTY_ENTITLEMENT, null);
      const res = await handleAppleWebhook(webhookRequest({ signedPayload: await consumption() }), REPLY_ENV, d, NOW);
      expect(res.status).toBe(200);
      expect(d.apple.sendConsumptionInfo).toHaveBeenCalledTimes(1);
    });

    it("회신 플래그가 꺼져 있으면(동의 고지 전) 호출하지 않고 로그만 남긴다", async () => {
      for (const env of [ENV, { ...ENV, APPLE_CONSUMPTION_REPLY_ENABLED: "false" }]) {
        const d = deps(EMPTY_ENTITLEMENT, linkU1);
        const res = await handleAppleWebhook(webhookRequest({ signedPayload: await consumption() }), env, d, NOW);
        expect(res.status).toBe(200);
        expect(d.apple.sendConsumptionInfo).not.toHaveBeenCalled();
        expect(d.store.write).not.toHaveBeenCalled();
      }
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("환불 회신 비활성(동의 고지 전)"), expect.anything(), expect.anything());
    });

    it("bundleId가 다르면 회신하지 않는다", async () => {
      const d = deps(EMPTY_ENTITLEMENT, linkU1);
      const payload = await consumption(transaction({ bundleId: "com.other.app" }));
      expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), REPLY_ENV, d, NOW)).status).toBe(200);
      expect(d.apple.sendConsumptionInfo).not.toHaveBeenCalled();
    });

    it("알림 environment가 형식 밖이면 회신하지 않고 200", async () => {
      const d = deps(EMPTY_ENTITLEMENT, linkU1);
      const payload = await consumption(transaction(), { environment: "Xcode" });
      expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), REPLY_ENV, d, NOW)).status).toBe(200);
      expect(d.apple.sendConsumptionInfo).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it("REFUND after CONSUMPTION_REQUEST still revokes sources.apple", async () => {
      const d = deps(EMPTY_ENTITLEMENT, linkU1);
      await handleAppleWebhook(webhookRequest({ signedPayload: await consumption() }), REPLY_ENV, d, NOW);
      expect(d.store.write).not.toHaveBeenCalled();
      d.apple.getSubscriptionSnapshot.mockResolvedValue(
        snapshot({ status: 5, transaction: transaction({ revocationDate: NOW.getTime() - 1000 }) }),
      );
      const refund = await notification(
        { notificationType: "REFUND", notificationUUID: "uuid-r" },
        {},
        transaction({ revocationDate: NOW.getTime() - 1000 }),
      );
      expect((await handleAppleWebhook(webhookRequest({ signedPayload: refund }), REPLY_ENV, d, NOW)).status).toBe(200);
      const apple = d.store.write.mock.calls[0][1].sources.apple;
      expect(apple?.status).toBe("canceled");
      expect(apple?.premiumUntil).toBe(NOW.toISOString());
    });
  });

  it("bad signature → 401", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const forged = await signTestJws(
      { notificationType: "DID_RENEW", notificationUUID: "u", signedDate: 1, data: {} },
      otherChain,
    );
    for (const body of [{ signedPayload: forged }, { signedPayload: "a.b.c" }, {}]) {
      const res = await handleAppleWebhook(webhookRequest(body), ENV, d, NOW);
      expect(res.status).toBe(401);
    }
    const notJson = new Request("https://billing.example/webhooks/apple", { method: "POST", body: "{" });
    expect((await handleAppleWebhook(notJson, ENV, d, NOW)).status).toBe(401);
    expect(d.storeLinks.get).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("알림 안의 거래 서명이 틀리면 401", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const payload = await notification({}, { signedTransactionInfo: await signTestJws(transaction(), otherChain) });
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(401);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("user deleted (UserNotFoundError) → 200", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    d.claims.setPremiumUntil.mockRejectedValue(new UserNotFoundError("u1"));
    const res = await handleAppleWebhook(webhookRequest({ signedPayload: await notification() }), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("bundleId mismatch → 200 ignored with log", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const payload = await notification({}, { bundleId: "com.other.app" });
    const res = await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
    expect(d.storeLinks.get).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("중복 알림(같은 notificationUUID)은 200이고 쓰지 않는다", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const payload = await notification();
    await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW);
    const written = d.store.write.mock.calls[0][1];
    d.store.get.mockResolvedValue({ doc: written, updateTime: "t1" });
    d.store.write.mockClear();
    const res = await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("페이로드 형식 오류(서명은 맞음)는 200으로 버리고 로그", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    const payload = await notification({ notificationUUID: 5 });
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: payload }), ENV, d, NOW)).status).toBe(200);
    const badTx = await notification({}, { signedTransactionInfo: await signTestJws({ originalTransactionId: "otx_1" }, chain) });
    expect((await handleAppleWebhook(webhookRequest({ signedPayload: badTx }), ENV, d, NOW)).status).toBe(200);
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("일시 오류(Firestore 등)는 던져서 500으로 재전송을 받는다", async () => {
    const d = deps(EMPTY_ENTITLEMENT, linkU1);
    d.storeLinks.get.mockRejectedValue(new Error("Firestore 503"));
    await expect(
      handleAppleWebhook(webhookRequest({ signedPayload: await notification() }), ENV, d, NOW),
    ).rejects.toThrow("Firestore 503");
  });
});
