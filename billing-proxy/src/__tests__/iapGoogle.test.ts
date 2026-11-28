import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import type { GoogleRecord } from "@tododo/core/dist/entitlement/index.js";
import { handleGoogleVerify, handleGoogleWebhook, type GoogleIapDeps } from "../handlers/iapGoogle";
import type { PlaySubscription } from "../google/playApi";
import { deriveAccountToken } from "../accountToken";
import { UserNotFoundError } from "../claims";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import type { StoreLink } from "../storeLinks";
import { asStored } from "./helpers/storedDoc";
import { hmacSha256Hex } from "../hmac";
import { handleRequest, type BillingDeps } from "../router";
import type { Env } from "../env";

const PACKAGE = "com.swimmingriver.tododo";
const ENV = { GOOGLE_PLAY_PACKAGE_NAME: PACKAGE, IAP_ACCOUNT_TOKEN_SECRET: "iap-secret" };
const ROUTER_ENV = { ...ENV, FIREBASE_PROJECT_ID: "p", CLIENT_APP_URL: "https://x" } as unknown as Env;
const NOW = new Date("2026-11-19T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const EXPIRES = NOW.getTime() + 30 * DAY;
const TOKEN = "purchase-token-new";
const OLD_TOKEN = "purchase-token-old";

let TOKEN_U1 = "";

const subscription = (over: Partial<PlaySubscription> = {}): PlaySubscription => ({
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  startTime: new Date(NOW.getTime() - DAY).toISOString(),
  linkedPurchaseToken: null,
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  testPurchase: false,
  obfuscatedAccountId: TOKEN_U1,
  lineItems: [
    {
      productId: "premium_monthly",
      expiryTime: new Date(EXPIRES).toISOString(),
      autoRenewEnabled: true,
      basePlanId: "monthly",
      offerId: null,
      inFreeTrial: false,
    },
  ],
  ...over,
});

const linkOf = (uid: string): StoreLink => ({ uid, linkedAt: "2026-11-01T00:00:00.000Z", accountToken: null });

/** links는 구매 토큰별 연결. 없는 토큰은 연결 없음으로 읽힌다. */
const deps = (existing: EntitlementDoc = EMPTY_ENTITLEMENT, links: Record<string, StoreLink> = {}) => {
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
      get: vi.fn(async (_store: "apple" | "google", id: string) => ({
        link: (links[id] ?? null) as StoreLink | null,
        updateTime: links[id] ? "2026-11-01T00:00:00Z" : (null as string | null),
      })),
      put: vi.fn(async (_store: "apple" | "google", _id: string, _link: StoreLink, _updateTime: string | null) => "ok" as "ok" | "conflict"),
    },
    play: {
      getSubscription: vi.fn(async (_token: string): Promise<PlaySubscription | null> => subscription()),
      acknowledge: vi.fn(async (_productId: string, _token: string) => {
        order.push("ack");
      }),
    },
    verifyPubSub: vi.fn(async (_authHeader: string | null) => true),
  };
  return d satisfies GoogleIapDeps;
};

const verifyRequest = (body: unknown) =>
  new Request("https://billing.example/iap/google/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const VERIFY_BODY = { purchaseToken: TOKEN, productId: "premium_monthly" };

const b64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

const rtdn = (over: Record<string, unknown> = {}) => ({
  version: "1.0",
  packageName: PACKAGE,
  eventTimeMillis: String(NOW.getTime() - 1000),
  subscriptionNotification: { version: "1.0", notificationType: 2, purchaseToken: TOKEN, subscriptionId: "premium_monthly" },
  ...over,
});

const pushBody = (data: unknown, messageId = "msg-1") => ({
  message: { data: typeof data === "string" ? data : b64(JSON.stringify(data)), messageId },
  subscription: "projects/p/subscriptions/play-rtdn",
});

const webhookRequest = (body: unknown, auth: string | null = "Bearer oidc") =>
  new Request("https://billing.example/webhooks/google", {
    method: "POST",
    headers: auth === null ? {} : { Authorization: auth },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const googleRecord = (over: Partial<GoogleRecord> = {}): GoogleRecord => ({
  status: "active",
  premiumUntil: new Date(EXPIRES + 3 * DAY).toISOString(),
  cancelAt: null,
  currentPeriodEnd: new Date(EXPIRES).toISOString(),
  autoRenew: true,
  startedAt: null,
  updatedAt: "",
  purchaseToken: OLD_TOKEN,
  productId: "premium_monthly",
  basePlanId: "monthly",
  environment: "Production",
  obfuscatedAccountId: null,
  lastMessageId: null,
  lastEventTime: null,
  ...over,
});

const quietConsole = () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
};

const allLogs = () =>
  [console.warn, console.error, console.log].flatMap((fn) => vi.mocked(fn).mock.calls.map((c) => c.join(" "))).join("\n");

describe("handleGoogleVerify", () => {
  beforeAll(async () => {
    TOKEN_U1 = await deriveAccountToken("u1", ENV.IAP_ACCOUNT_TOKEN_SECRET);
  });
  beforeEach(quietConsole);
  afterEach(() => vi.restoreAllMocks());

  it("시행 후 무료 체험 구매를 반영할 때 지금 토큰의 로그인 계정 키를 함께 저장한다", async () => {
    const token = { uid: "u1", premium: false, premiumUntil: null, identities: { "google.com": ["g1"] } };
    const AFTER = new Date("2026-12-28T03:00:00.000Z");
    const d = { ...deps(), trialHistory: { store: { record: vi.fn(), hasActive: vi.fn() }, secret: "s" } };
    const trialItem = { ...subscription().lineItems[0], inFreeTrial: true, expiryTime: new Date(AFTER.getTime() + 30 * DAY).toISOString() };
    d.play.getSubscription.mockResolvedValue(subscription({ lineItems: [trialItem] }));
    const res = await handleGoogleVerify("u1", d, AFTER, ENV, verifyRequest(VERIFY_BODY), token);
    expect(res.status).toBe(200);
    const doc = d.store.write.mock.calls[0][1];
    expect(doc.trialUsedAt).not.toBeNull();
    expect(doc.trialIdentities).toEqual({ [await hmacSha256Hex("s", "google.com:g1")]: "google.com" });
  });

  it("valid token → link, sources.google, acknowledge when ACKNOWLEDGEMENT_STATE_PENDING", async () => {
    const d = deps();
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(200);
    const premiumUntil = new Date(EXPIRES + 3 * DAY).toISOString();
    expect(await res.json()).toEqual({ premiumUntil });

    expect(d.play.getSubscription).toHaveBeenCalledWith(TOKEN);
    expect(d.storeLinks.put).toHaveBeenCalledWith(
      "google",
      TOKEN,
      { uid: "u1", linkedAt: NOW.toISOString(), accountToken: TOKEN_U1 },
      null,
    );
    // 클레임 → 문서 → 승인 순서. 승인은 반영이 끝난 뒤에만 한다.
    expect(d.order).toEqual(["claim", "doc", "ack"]);
    expect(d.play.acknowledge).toHaveBeenCalledWith("premium_monthly", TOKEN);
    const google = d.store.write.mock.calls[0][1].sources.google;
    expect(google?.purchaseToken).toBe(TOKEN);
    expect(google?.premiumUntil).toBe(premiumUntil);
    expect(google?.lastMessageId).toBeNull();
    expect(d.claims.setPremiumUntil).toHaveBeenCalledWith("u1", Math.floor((EXPIRES + 3 * DAY) / 1000));
  });

  it("re-verify same token is idempotent", async () => {
    const d = deps();
    const first = (await (await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY))).json()) as unknown;
    const written = d.store.write.mock.calls[0][1];

    const again = deps(written, { [TOKEN]: { uid: "u1", linkedAt: NOW.toISOString(), accountToken: TOKEN_U1 } });
    again.play.getSubscription.mockResolvedValue(subscription({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" }));
    const res = await handleGoogleVerify("u1", again, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(first);
    // 재연결: 처음 연결 시각을 유지하고 updateTime 사전조건으로 쓴다.
    expect(again.storeLinks.put).toHaveBeenCalledWith(
      "google",
      TOKEN,
      { uid: "u1", linkedAt: NOW.toISOString(), accountToken: TOKEN_U1 },
      "2026-11-01T00:00:00Z",
    );
    expect(again.play.acknowledge).not.toHaveBeenCalled();
    expect(again.store.write.mock.calls[0][1].premiumUntil).toBe(written.premiumUntil);
  });

  it("productId not premium_monthly → 400", async () => {
    const d = deps();
    const bodies = [
      { purchaseToken: TOKEN, productId: "other_product" },
      { purchaseToken: TOKEN },
      { purchaseToken: "", productId: "premium_monthly" },
      { productId: "premium_monthly" },
      { purchaseToken: 1, productId: "premium_monthly" },
      {},
    ];
    for (const body of bodies) {
      const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "INVALID_PURCHASE" });
    }
    const notJson = new Request("https://billing.example/iap/google/verify", { method: "POST", body: "{" });
    expect((await handleGoogleVerify("u1", d, NOW, ENV, notJson)).status).toBe(400);
    expect(d.play.getSubscription).not.toHaveBeenCalled();
    expect(d.storeLinks.put).not.toHaveBeenCalled();
  });

  it("getSubscription null → 400", async () => {
    const d = deps();
    d.play.getSubscription.mockResolvedValue(null);
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_PURCHASE" });
    expect(d.storeLinks.put).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.play.acknowledge).not.toHaveBeenCalled();
  });

  it("조회한 구독의 상품이 premium_monthly가 아니면 400", async () => {
    const d = deps();
    const item = subscription().lineItems[0];
    d.play.getSubscription.mockResolvedValue(subscription({ lineItems: [{ ...item, productId: "other_product" }] }));
    expect((await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY))).status).toBe(400);
    // 활성 상태인데 라인 아이템이 없는 것도 상품을 확인할 수 없으니 거절한다.
    d.play.getSubscription.mockResolvedValue(subscription({ lineItems: [] }));
    expect((await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY))).status).toBe(400);
    expect(d.storeLinks.put).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("결제 대기(PENDING)는 승인하지 않고 현재 값과 pending: true를 돌려준다", async () => {
    const d = deps({ ...EMPTY_ENTITLEMENT, premiumUntil: null });
    d.play.getSubscription.mockResolvedValue(subscription({ subscriptionState: "SUBSCRIPTION_STATE_PENDING", lineItems: [] }));
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ premiumUntil: null, pending: true });
    // 연결은 만들어 둔다 — 결제가 끝나면 RTDN이 이 연결로 반영한다.
    expect(d.storeLinks.put).toHaveBeenCalledTimes(1);
    expect(d.play.acknowledge).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("linkedPurchaseToken whose link belongs to other uid → 409", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [OLD_TOKEN]: linkOf("u2") });
    d.play.getSubscription.mockResolvedValue(subscription({ linkedPurchaseToken: OLD_TOKEN }));
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "LINKED_TO_OTHER_ACCOUNT" });
    expect(d.storeLinks.get).toHaveBeenCalledWith("google", OLD_TOKEN);
    expect(d.storeLinks.put).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.play.acknowledge).not.toHaveBeenCalled();
  });

  it("새 토큰이 이미 다른 계정에 연결돼 있으면 409", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u2") });
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(409);
    expect(d.storeLinks.put).not.toHaveBeenCalled();
    expect(d.play.acknowledge).not.toHaveBeenCalled();
  });

  it("linkedPurchaseToken whose link belongs to same uid → new link, record replaced", async () => {
    const existing: EntitlementDoc = {
      ...EMPTY_ENTITLEMENT,
      plan: "premium",
      status: "active",
      source: "google",
      premiumUntil: new Date(NOW.getTime() + 5 * DAY).toISOString(),
      sources: { google: googleRecord({ premiumUntil: new Date(NOW.getTime() + 5 * DAY).toISOString() }) },
    };
    const d = deps(existing, { [OLD_TOKEN]: linkOf("u1") });
    d.play.getSubscription.mockResolvedValue(subscription({ linkedPurchaseToken: OLD_TOKEN }));
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(200);
    expect(d.storeLinks.put).toHaveBeenCalledWith(
      "google",
      TOKEN,
      { uid: "u1", linkedAt: NOW.toISOString(), accountToken: TOKEN_U1 },
      null,
    );
    const google = d.store.write.mock.calls[0][1].sources.google;
    expect(google?.purchaseToken).toBe(TOKEN);
    expect(google?.premiumUntil).toBe(new Date(EXPIRES + 3 * DAY).toISOString());
  });

  it("acknowledge failure after commit → 500 (app retries; commit is idempotent)", async () => {
    const d = deps();
    d.play.acknowledge.mockRejectedValue(new Error("Play 구매 승인 실패: 503"));
    await expect(handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY))).rejects.toThrow("503");
    // 반영은 이미 끝났다 — 앱이 다시 보내면 같은 값으로 다시 쓰고 승인을 재시도한다.
    expect(d.order).toEqual(["claim", "doc"]);
  });

  it("obfuscatedAccountId가 이 계정 것이 아니어도 연결하고 토큰 없이 로그만 남긴다", async () => {
    const d = deps();
    const foreign = "00000000-0000-4000-8000-000000000000";
    d.play.getSubscription.mockResolvedValue(subscription({ obfuscatedAccountId: foreign }));
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(200);
    expect(d.storeLinks.put.mock.calls[0][2]).toEqual({ uid: "u1", linkedAt: NOW.toISOString(), accountToken: foreign });
    expect(console.warn).toHaveBeenCalledTimes(1);
    const logs = allLogs();
    expect(logs).toContain("u1");
    expect(logs).not.toContain(foreign);
    expect(logs).not.toContain(TOKEN_U1);
    expect(logs).not.toContain(TOKEN);
  });

  it("연결 쓰기 경합: 다시 읽어 다른 계정이 먼저 연결했으면 409", async () => {
    const d = deps();
    d.storeLinks.put.mockResolvedValueOnce("conflict");
    d.storeLinks.get
      .mockResolvedValueOnce({ link: null, updateTime: null })
      .mockResolvedValueOnce({ link: linkOf("u2"), updateTime: "t2" });
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(409);
    expect(d.storeLinks.put).toHaveBeenCalledTimes(1);
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("연결 쓰기 경합: 같은 계정의 병렬 요청이 먼저 연결했으면 재연결로 진행", async () => {
    const d = deps();
    d.storeLinks.put.mockResolvedValueOnce("conflict");
    d.storeLinks.get
      .mockResolvedValueOnce({ link: null, updateTime: null })
      .mockResolvedValueOnce({ link: linkOf("u1"), updateTime: "t2" });
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(200);
    expect(d.storeLinks.put).toHaveBeenCalledTimes(2);
    expect(d.storeLinks.put.mock.calls[1][3]).toBe("t2");
  });

  it("OTHER_SUBSCRIPTION → 409 ALREADY_SUBSCRIBED and acknowledge not called", async () => {
    const until = new Date(NOW.getTime() + 10 * DAY).toISOString();
    const d = deps({
      ...EMPTY_ENTITLEMENT,
      plan: "premium",
      status: "active",
      source: "google",
      premiumUntil: until,
      sources: { google: googleRecord({ purchaseToken: "purchase-token-other", premiumUntil: until }) },
    });
    const res = await handleGoogleVerify("u1", d, NOW, ENV, verifyRequest(VERIFY_BODY));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "ALREADY_SUBSCRIBED" });
    // 기록하지 않은 구독을 승인하면 반영 안 된 정기 결제가 굳는다 — 승인하지 않아 Google 자동 환불에 맡긴다.
    expect(d.play.acknowledge).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });
});

describe("handleGoogleWebhook", () => {
  beforeAll(async () => {
    TOKEN_U1 ||= await deriveAccountToken("u1", ENV.IAP_ACCOUNT_TOKEN_SECRET);
  });
  beforeEach(quietConsole);
  afterEach(() => vi.restoreAllMocks());

  it("linked token → re-fetches state and writes sources.google with messageId/eventTime", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    const res = await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.verifyPubSub).toHaveBeenCalledWith("Bearer oidc");
    expect(d.play.getSubscription).toHaveBeenCalledWith(TOKEN);
    // 클레임 → 문서 → (미승인이면) 승인.
    expect(d.order).toEqual(["claim", "doc", "ack"]);
    expect(d.store.get).toHaveBeenCalledWith("u1");
    const google = d.store.write.mock.calls[0][1].sources.google;
    expect(google?.lastMessageId).toBe("msg-1");
    expect(google?.lastEventTime).toBe(new Date(NOW.getTime() - 1000).toISOString());
    expect(google?.premiumUntil).toBe(new Date(EXPIRES + 3 * DAY).toISOString());
  });

  it("webhook acknowledges completed purchase after write", async () => {
    // 결제 대기였다가 완료된 구매: 앱이 다시 verify하지 않아도 3일 자동 환불되지 않게 웹훅이 승인한다.
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    expect((await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW)).status).toBe(200);
    expect(d.order).toEqual(["claim", "doc", "ack"]);
    expect(d.play.acknowledge).toHaveBeenCalledWith("premium_monthly", TOKEN);

    // 교체 토큰(이전 토큰의 연결을 따라감)도 같다.
    const viaOld = deps(EMPTY_ENTITLEMENT, { [OLD_TOKEN]: linkOf("u1") });
    viaOld.play.getSubscription.mockResolvedValue(subscription({ linkedPurchaseToken: OLD_TOKEN }));
    await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, viaOld, NOW);
    expect(viaOld.play.acknowledge).toHaveBeenCalledWith("premium_monthly", TOKEN);

    // 이미 승인된 구매는 다시 승인하지 않는다.
    const acked = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    acked.play.getSubscription.mockResolvedValue(subscription({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" }));
    await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, acked, NOW);
    expect(acked.play.acknowledge).not.toHaveBeenCalled();
  });

  it("webhook does not acknowledge when skipped or pending", async () => {
    const pending = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    pending.play.getSubscription.mockResolvedValue(subscription({ subscriptionState: "SUBSCRIPTION_STATE_PENDING", lineItems: [] }));
    expect((await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, pending, NOW)).status).toBe(200);
    expect(pending.play.acknowledge).not.toHaveBeenCalled();

    const until = new Date(NOW.getTime() + 10 * DAY).toISOString();
    const other = deps(
      { ...EMPTY_ENTITLEMENT, sources: { google: googleRecord({ purchaseToken: "purchase-token-other", premiumUntil: until }) } },
      { [TOKEN]: linkOf("u1") },
    );
    expect((await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, other, NOW)).status).toBe(200);
    expect(other.store.write).not.toHaveBeenCalled();
    expect(other.play.acknowledge).not.toHaveBeenCalled();

    // 연결이 없으면 반영도 승인도 없다.
    const unlinked = deps();
    await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, unlinked, NOW);
    expect(unlinked.play.acknowledge).not.toHaveBeenCalled();
  });

  it("웹훅 승인 실패는 500(반영은 같은 값이라 재전송이 승인까지 이어짐)", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    d.play.acknowledge.mockRejectedValue(new Error("Play 구매 승인 실패: 503"));
    const req = webhookRequest(pushBody(rtdn()));
    await expect(handleGoogleWebhook(req.clone(), ENV, d, NOW)).rejects.toThrow("503");
    expect((await handleRequest(req, ROUTER_ENV, () => d as unknown as BillingDeps, NOW)).status).toBe(500);
  });

  it("승인 실패 뒤 같은 messageId 재전송은 쓰지 않고 승인만 다시 시도한다", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    d.play.acknowledge.mockRejectedValueOnce(new Error("Play 구매 승인 실패: 503"));
    await expect(handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW)).rejects.toThrow("503");
    d.store.get.mockResolvedValue({ doc: d.store.write.mock.calls[0][1], updateTime: "t1" });
    d.store.write.mockClear();
    expect((await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW)).status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
    expect(d.play.acknowledge).toHaveBeenCalledTimes(2);
  });

  it("구독이 아닌 상품의 환불 알림(productType ≠ 1)은 200으로 무시", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    for (const productType of [2, undefined]) {
      const body = pushBody(
        rtdn({ subscriptionNotification: undefined, voidedPurchaseNotification: { purchaseToken: TOKEN, orderId: "GPA.1", productType } }),
      );
      expect((await handleGoogleWebhook(webhookRequest(body), ENV, d, NOW)).status).toBe(200);
    }
    expect(console.log).toHaveBeenCalledTimes(2);
    expect(d.play.getSubscription).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("webhook before link is a no-op", async () => {
    const d = deps();
    const res = await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.storeLinks.put).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("new token with linkedPurchaseToken linked → follows old link's uid and creates new link", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [OLD_TOKEN]: linkOf("u-old") });
    d.play.getSubscription.mockResolvedValue(subscription({ linkedPurchaseToken: OLD_TOKEN }));
    const res = await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.storeLinks.put).toHaveBeenCalledWith(
      "google",
      TOKEN,
      { uid: "u-old", linkedAt: NOW.toISOString(), accountToken: TOKEN_U1 },
      null,
    );
    expect(d.store.get).toHaveBeenCalledWith("u-old");
    expect(d.store.write.mock.calls[0][0]).toBe("u-old");
    expect(d.store.write.mock.calls[0][1].sources.google?.purchaseToken).toBe(TOKEN);
  });

  it("testNotification → 200", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    const body = pushBody(rtdn({ subscriptionNotification: undefined, testNotification: { version: "1.0" } }));
    expect((await handleGoogleWebhook(webhookRequest(body), ENV, d, NOW)).status).toBe(200);
    expect(d.play.getSubscription).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("구매 토큰이 없는 알림(일회성 상품 등)은 200", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    const body = pushBody(rtdn({ subscriptionNotification: undefined, oneTimeProductNotification: { sku: "x" } }));
    expect((await handleGoogleWebhook(webhookRequest(body), ENV, d, NOW)).status).toBe(200);
    expect(d.play.getSubscription).not.toHaveBeenCalled();
  });

  it("bad OIDC → 401", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    d.verifyPubSub.mockResolvedValue(false);
    const res = await handleGoogleWebhook(webhookRequest(pushBody(rtdn()), null), ENV, d, NOW);
    expect(res.status).toBe(401);
    expect(d.verifyPubSub).toHaveBeenCalledWith(null);
    expect(d.storeLinks.get).not.toHaveBeenCalled();
    expect(d.play.getSubscription).not.toHaveBeenCalled();
  });

  it("OIDC 공개키 조회 실패는 500(Pub/Sub 재전송)", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    d.verifyPubSub.mockRejectedValue(new Error("JWKS fetch failed: 503"));
    const res = await handleRequest(webhookRequest(pushBody(rtdn())), ROUTER_ENV, () => d as unknown as BillingDeps, NOW);
    expect(res.status).toBe(500);
  });

  it("packageName mismatch → 200 ignored", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    const res = await handleGoogleWebhook(webhookRequest(pushBody(rtdn({ packageName: "com.other.app" }))), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
    expect(d.storeLinks.get).not.toHaveBeenCalled();
    expect(d.play.getSubscription).not.toHaveBeenCalled();
  });

  it("voidedPurchaseNotification → re-fetch and apply", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    d.play.getSubscription.mockResolvedValue(subscription({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" }));
    const body = pushBody(
      rtdn({
        subscriptionNotification: undefined,
        voidedPurchaseNotification: { purchaseToken: TOKEN, orderId: "GPA.1", productType: 1, refundType: 1 },
      }),
    );
    expect((await handleGoogleWebhook(webhookRequest(body), ENV, d, NOW)).status).toBe(200);
    expect(d.play.getSubscription).toHaveBeenCalledWith(TOKEN);
    const google = d.store.write.mock.calls[0][1].sources.google;
    expect(google?.status).toBe("canceled");
    expect(google?.premiumUntil).toBe(NOW.toISOString());
  });

  it("알림 본문 상태가 아니라 조회한 상태를 반영한다", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    // 알림 종류는 해지(3)지만 지금 조회한 상태는 활성이다(재구독 등).
    const body = pushBody(rtdn({ subscriptionNotification: { notificationType: 3, purchaseToken: TOKEN, subscriptionId: "premium_monthly" } }));
    expect((await handleGoogleWebhook(webhookRequest(body), ENV, d, NOW)).status).toBe(200);
    expect(d.store.write.mock.calls[0][1].sources.google?.status).toBe("active");
  });

  it("형식이 깨진 메시지(OIDC는 정상)는 200으로 버리고 로그", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    const bodies: unknown[] = [
      pushBody("@@not-base64@@"),
      pushBody(b64("{not json")),
      pushBody(b64("42")),
      pushBody(rtdn({ eventTimeMillis: "soon" })),
      { message: { data: b64(JSON.stringify(rtdn())) } },
      { subscription: "x" },
      "{",
    ];
    for (const body of bodies) {
      expect((await handleGoogleWebhook(webhookRequest(body), ENV, d, NOW)).status).toBe(200);
    }
    expect(console.error).toHaveBeenCalledTimes(bodies.length);
    expect(d.play.getSubscription).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("getSubscription null → 200 no write", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    d.play.getSubscription.mockResolvedValue(null);
    expect((await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW)).status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("중복 메시지(같은 messageId)는 200이고 쓰지 않는다", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW);
    d.store.get.mockResolvedValue({ doc: d.store.write.mock.calls[0][1], updateTime: "t1" });
    d.store.write.mockClear();
    expect((await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW)).status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("user deleted (UserNotFoundError) → 200", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    d.claims.setPremiumUntil.mockRejectedValue(new UserNotFoundError("u1"));
    expect((await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW)).status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("Play API 오류·이상 응답은 500으로 재전송을 받는다", async () => {
    const d = deps(EMPTY_ENTITLEMENT, { [TOKEN]: linkOf("u1") });
    d.play.getSubscription.mockRejectedValue(new Error("Play 구독 조회 실패: 503"));
    const req = webhookRequest(pushBody(rtdn()));
    await expect(handleGoogleWebhook(req.clone(), ENV, d, NOW)).rejects.toThrow("503");
    expect((await handleRequest(req, ROUTER_ENV, () => d as unknown as BillingDeps, NOW)).status).toBe(500);

    // 만료 시각 없는 활성 상태 같은 이상 응답은 결정 함수가 던진다 — 조용히 권한을 지우지 않는다.
    d.play.getSubscription.mockResolvedValue(subscription({ lineItems: [] }));
    await expect(handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW)).rejects.toThrow();
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("로그에 구매 토큰을 남기지 않는다", async () => {
    const d = deps();
    await handleGoogleWebhook(webhookRequest(pushBody(rtdn())), ENV, d, NOW);
    await handleGoogleWebhook(webhookRequest(pushBody(rtdn({ packageName: "com.other.app" }))), ENV, d, NOW);
    expect(allLogs()).not.toContain(TOKEN);
  });
});
