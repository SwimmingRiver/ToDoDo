import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { handleWebhook } from "../handlers/webhook";
import { UserNotFoundError } from "../claims";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import { asStored } from "./helpers/storedDoc";
import { signUid } from "../uidSignature";
import { signForTest } from "./helpers/signForTest";

const SECRET = "whsec";
const UID_SECRET = "uid-secret";
const PRICE = "pri_premium_monthly";
const ENV = {
  PADDLE_WEBHOOK_SECRET: SECRET,
  BILLING_UID_SECRET: UID_SECRET,
  BILLING_ALLOWED_UIDS: "u1,u2",
  PADDLE_PRICE_ID: PRICE,
};
const ITEMS = [{ status: "active", quantity: 1, price: { id: PRICE } }];
let SIG_U1 = "";
let SIG_STRANGER = "";
const NOW = new Date("2026-10-10T00:00:05.000Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const body = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    event_id: "evt_1",
    event_type: "subscription.created",
    occurred_at: "2026-10-10T00:00:00.000Z",
    data: {
      id: "sub_1",
      status: "active",
      customer_id: "ctm_1",
      custom_data: { uid: "u1", uid_sig: SIG_U1 },
      current_billing_period: { ends_at: "2026-11-10T00:00:00.000Z" },
      scheduled_change: null,
      items: ITEMS,
    },
    ...overrides,
  });

const request = async (raw: string, header?: string) =>
  new Request("https://billing.example/webhooks/paddle", {
    method: "POST",
    headers: { "Paddle-Signature": header ?? (await signForTest(raw, SECRET, NOW_SEC)) },
    body: raw,
  });

const deps = (existing: EntitlementDoc = EMPTY_ENTITLEMENT) => ({
  store: {
    get: vi.fn(async () => ({ doc: asStored(existing), updateTime: null })),
    write: vi.fn(async (_uid: string, _doc: EntitlementDoc, _updateTime: string | null) => "ok" as const),
  },
  claims: { setPremiumUntil: vi.fn(async (_uid: string, _seconds: number) => undefined) },
});

const withCustomData = (customData: unknown) =>
  body({
    data: {
      id: "sub_1",
      status: "active",
      customer_id: "ctm_1",
      custom_data: customData,
      current_billing_period: { ends_at: "2026-11-10T00:00:00.000Z" },
      scheduled_change: null,
      items: ITEMS,
    },
  });

describe("handleWebhook", () => {
  beforeAll(async () => {
    SIG_U1 = await signUid("u1", UID_SECRET);
    SIG_STRANGER = await signUid("stranger", UID_SECRET);
  });
  afterEach(() => vi.restoreAllMocks());

  it("서명이 틀리면 401이고 아무것도 쓰지 않는다", async () => {
    const d = deps();
    const res = await handleWebhook(await request(body(), "ts=1;h1=00"), ENV, d, NOW);
    expect(res.status).toBe(401);
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  const subData = (data: Record<string, unknown>) =>
    body({
      data: {
        id: "sub_1",
        status: "active",
        customer_id: "ctm_1",
        custom_data: { uid: "u1", uid_sig: SIG_U1 },
        current_billing_period: { ends_at: "2026-11-10T00:00:00.000Z" },
        scheduled_change: null,
        items: ITEMS,
        ...data,
      },
    });
  const OTHER_PRICE_ITEMS = [{ status: "active", quantity: 1, price: { id: "pri_other" } }];
  const tracked = (overrides: Partial<EntitlementDoc> = {}): EntitlementDoc => ({
    ...EMPTY_ENTITLEMENT,
    plan: "premium",
    status: "active",
    source: "paddle",
    customerId: "ctm_1",
    subscriptionId: "sub_1",
    premiumUntil: "2026-11-13T00:00:00.000Z",
    lastEventOccurredAt: "2026-10-09T00:00:00.000Z",
    ...overrides,
  });

  it("추적하지 않는 구독의 가격이 PADDLE_PRICE_ID가 아니면 반영하지 않고 500(설정 실수면 고친 뒤 재전송으로 복구)", async () => {
    const d = deps();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await handleWebhook(await request(subData({ items: OTHER_PRICE_ITEMS })), ENV, d, NOW);
    expect(res.status).toBe(500);
    expect(d.store.write).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("가격"), "u1", "sub_1", ["pri_other"]);
  });

  it("추적하지 않는 구독에 items가 없으면 가격을 확인할 수 없으니 반영하지 않는다", async () => {
    const d = deps();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await handleWebhook(await request(subData({ items: undefined })), ENV, d, NOW);
    expect(res.status).toBe(500);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("이미 추적 중인 구독은 가격이 달라도 갱신을 반영한다(가격 변경 전 가입자)", async () => {
    const d = deps(tracked());
    const res = await handleWebhook(
      await request(subData({ items: OTHER_PRICE_ITEMS, current_billing_period: { ends_at: "2026-12-10T00:00:00.000Z" } })),
      ENV,
      d,
      NOW,
    );
    expect(res.status).toBe(200);
    expect(d.store.write.mock.calls[0][1]).toMatchObject({ premiumUntil: "2026-12-13T00:00:00.000Z" });
  });

  it("이미 추적 중인 구독은 가격이 달라도 해지를 반영한다(권한 회수는 가격과 무관)", async () => {
    const d = deps(tracked());
    const res = await handleWebhook(
      await request(subData({ status: "canceled", current_billing_period: null, items: OTHER_PRICE_ITEMS })),
      ENV,
      d,
      NOW,
    );
    expect(res.status).toBe(200);
    expect(d.store.write.mock.calls[0][1]).toMatchObject({ status: "canceled", plan: "free" });
  });

  it("살아 있는 다른 구독이 있으면 다른 구독의 past_due는 건너뛴다", async () => {
    const d = deps(tracked({ subscriptionId: "sub_old" }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await handleWebhook(await request(subData({ status: "past_due" })), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("이중 구독"), "u1", "sub_old", "sub_1");
  });

  it("active 구독이면 클레임과 문서를 반영하고 200", async () => {
    const d = deps();
    const res = await handleWebhook(await request(body()), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.claims.setPremiumUntil).toHaveBeenCalledWith("u1", Math.floor(Date.parse("2026-11-13T00:00:00.000Z") / 1000));
    expect(d.store.write.mock.calls[0][1]).toMatchObject({ status: "active", customerId: "ctm_1", lastWebhookEventId: "evt_1" });
  });

  it("이미 처리한 이벤트면 200이고 쓰지 않는다", async () => {
    const d = deps({ ...EMPTY_ENTITLEMENT, source: "paddle", customerId: "ctm_1", subscriptionId: "sub_1", lastWebhookEventId: "evt_1" });
    const res = await handleWebhook(await request(body()), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("uid가 없으면 200(재시도해도 해결 안 됨)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps();
    const raw = body({ data: { id: "sub_1", status: "active", customer_id: "ctm_1", custom_data: null, current_billing_period: null, scheduled_change: null } });
    const res = await handleWebhook(await request(raw), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.get).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("Auth 사용자가 삭제됐으면 200(무한 재전송 방지)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps();
    d.claims.setPremiumUntil.mockRejectedValue(new UserNotFoundError("u1"));
    const res = await handleWebhook(await request(body()), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(errorLog).toHaveBeenCalled();
    // 탈퇴 후 도착한 해지 웹훅이 entitlements 문서를 되살리지 않는다(클레임을 문서보다 먼저 쓰기 때문).
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("구독 외 이벤트는 200으로 무시한다", async () => {
    const d = deps();
    const res = await handleWebhook(await request(body({ event_type: "transaction.completed" })), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.get).not.toHaveBeenCalled();
  });

  it("문서 쓰기 실패는 던진다(라우터가 500 → Paddle 재전송)", async () => {
    const d = deps();
    d.store.write.mockRejectedValue(new Error("Firestore 엔타이틀먼트 쓰기 실패 (503)"));
    await expect(handleWebhook(await request(body()), ENV, d, NOW)).rejects.toThrow("503");
  });

  it("uid_sig가 없으면 200이고 아무것도 읽거나 쓰지 않는다(브라우저가 넣은 custom_data 차단)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps();
    const res = await handleWebhook(await request(withCustomData({ uid: "u1" })), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.get).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("다른 uid의 서명을 붙인 위조 uid면 200이고 쓰지 않는다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps();
    const res = await handleWebhook(await request(withCustomData({ uid: "u2", uid_sig: SIG_U1 })), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("서명은 맞지만 허용 목록 밖 uid면 200이고 쓰지 않는다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps();
    const res = await handleWebhook(await request(withCustomData({ uid: "stranger", uid_sig: SIG_STRANGER })), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.get).not.toHaveBeenCalled();
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("UID 시크릿이 비어 있으면 올바른 서명이어도 쓰지 않는다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps();
    const res = await handleWebhook(await request(body()), { ...ENV, BILLING_UID_SECRET: "" }, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("살아 있는 다른 구독이 있으면 다른 구독의 해지 이벤트는 건너뛰고 이중 구독 경고를 남긴다", async () => {
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deps({
      ...EMPTY_ENTITLEMENT,
      source: "paddle",
      status: "active",
      customerId: "ctm_1",
      subscriptionId: "sub_old",
      premiumUntil: "2026-11-13T00:00:00.000Z",
    });
    const raw = body({
      event_type: "subscription.canceled",
      data: { id: "sub_1", status: "canceled", customer_id: "ctm_1", custom_data: { uid: "u1", uid_sig: SIG_U1 }, current_billing_period: null, scheduled_change: null, items: ITEMS },
    });
    const res = await handleWebhook(await request(raw), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(d.store.write).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalledWith(expect.any(String), "u1", "sub_old", "sub_1");
  });

  it("같은 구독의 해지는 반영한다", async () => {
    const d = deps({
      ...EMPTY_ENTITLEMENT,
      source: "paddle",
      status: "active",
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      premiumUntil: "2026-11-13T00:00:00.000Z",
    });
    const raw = body({
      event_type: "subscription.canceled",
      data: { id: "sub_1", status: "canceled", customer_id: "ctm_1", custom_data: { uid: "u1", uid_sig: SIG_U1 }, current_billing_period: null, scheduled_change: null, items: ITEMS },
    });
    const res = await handleWebhook(await request(raw), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.write.mock.calls[0][1]).toMatchObject({ status: "canceled", premiumUntil: NOW.toISOString() });
  });

  it("Paddle 해지는 Apple 기록을 건드리지 않고 클레임은 Apple 만료로 남긴다", async () => {
    const appleUntil = "2026-12-01T00:00:00.000Z";
    const apple = {
      status: "active" as const,
      premiumUntil: appleUntil,
      cancelAt: null,
      currentPeriodEnd: appleUntil,
      autoRenew: true,
      startedAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "",
      originalTransactionId: "otx_1",
      productId: "premium_monthly",
      environment: "Production" as const,
      appAccountToken: null,
      lastNotificationUUID: null,
      lastSignedDate: null,
    };
    const d = deps({ ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "apple", premiumUntil: appleUntil, sources: { apple } });
    const raw = body({
      event_type: "subscription.canceled",
      data: { id: "sub_1", status: "canceled", customer_id: "ctm_1", custom_data: { uid: "u1", uid_sig: SIG_U1 }, current_billing_period: null, scheduled_change: null, items: ITEMS },
    });
    const res = await handleWebhook(await request(raw), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(d.claims.setPremiumUntil).toHaveBeenCalledWith("u1", Math.floor(Date.parse(appleUntil) / 1000));
    expect(d.store.write.mock.calls[0][1]).toMatchObject({
      plan: "premium",
      source: "apple",
      sources: { apple, paddle: { status: "canceled", premiumUntil: NOW.toISOString() } },
    });
  });

  it("Paddle trialing은 예상 밖이라 경고하되 active처럼 반영한다", async () => {
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deps();
    const raw = body({
      data: { id: "sub_1", status: "trialing", customer_id: "ctm_1", custom_data: { uid: "u1", uid_sig: SIG_U1 }, current_billing_period: { ends_at: "2026-11-10T00:00:00.000Z" }, scheduled_change: null, items: ITEMS },
    });
    const res = await handleWebhook(await request(raw), ENV, d, NOW);
    expect(res.status).toBe(200);
    expect(warnLog).toHaveBeenCalledWith(expect.stringContaining("trialing"), "u1", "sub_1");
    expect(d.store.write.mock.calls[0][1]).toMatchObject({ status: "active", premiumUntil: "2026-11-13T00:00:00.000Z" });
  });

  describe("Paddle id가 남은 예전 manual 문서(부여 스크립트가 source만 덮음)", () => {
    const legacyManual = (): EntitlementDoc => ({
      ...EMPTY_ENTITLEMENT,
      plan: "premium",
      status: "active",
      source: "manual",
      premiumUntil: "2027-01-01T00:00:00.000Z",
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      lastWebhookEventId: "evt_0",
      lastEventOccurredAt: "2026-10-09T00:00:00.000Z",
    });

    it("그 구독의 새 active 이벤트는 반영되고 manual 부여와 고객 id가 함께 남는다", async () => {
      const d = deps(legacyManual());
      const res = await handleWebhook(await request(body()), ENV, d, NOW);
      expect(res.status).toBe(200);
      const written = d.store.write.mock.calls[0][1];
      expect(written.sources.paddle).toMatchObject({ status: "active", customerId: "ctm_1", subscriptionId: "sub_1", lastWebhookEventId: "evt_1" });
      expect(written.sources.manual).toMatchObject({ premiumUntil: "2027-01-01T00:00:00.000Z" });
      expect(written).toMatchObject({ source: "manual", customerId: "ctm_1", subscriptionId: "sub_1" });
    });

    it("이미 반영한 시각 이전의 낡은 이벤트는 건너뛴다(낡은 이벤트 차단이 유지된다)", async () => {
      const d = deps(legacyManual());
      const res = await handleWebhook(
        await request(body({ event_id: "evt_old", occurred_at: "2026-10-08T00:00:00.000Z" })),
        ENV,
        d,
        NOW,
      );
      expect(res.status).toBe(200);
      expect(d.store.write).not.toHaveBeenCalled();
    });
  });

  it("JSON이 깨졌으면 400", async () => {
    const d = deps();
    const res = await handleWebhook(await request("{not json"), ENV, d, NOW);
    expect(res.status).toBe(400);
  });
});
