import { describe, it, expect, vi, afterEach } from "vitest";
import { handleWebhook } from "../handlers/webhook";
import { UserNotFoundError } from "../claims";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import { signForTest } from "./helpers/signForTest";

const SECRET = "whsec";
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
      custom_data: { uid: "u1" },
      current_billing_period: { ends_at: "2026-11-10T00:00:00.000Z" },
      scheduled_change: null,
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
    get: vi.fn(async () => ({ doc: existing, updateTime: null })),
    write: vi.fn(async (_uid: string, _doc: EntitlementDoc, _updateTime: string | null) => "ok" as const),
  },
  claims: { setPremiumUntil: vi.fn(async (_uid: string, _seconds: number) => undefined) },
});

describe("handleWebhook", () => {
  afterEach(() => vi.restoreAllMocks());

  it("서명이 틀리면 401이고 아무것도 쓰지 않는다", async () => {
    const d = deps();
    const res = await handleWebhook(await request(body(), "ts=1;h1=00"), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(401);
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("active 구독이면 클레임과 문서를 반영하고 200", async () => {
    const d = deps();
    const res = await handleWebhook(await request(body()), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
    expect(d.claims.setPremiumUntil).toHaveBeenCalledWith("u1", Math.floor(Date.parse("2026-11-13T00:00:00.000Z") / 1000));
    expect(d.store.write.mock.calls[0][1]).toMatchObject({ status: "active", customerId: "ctm_1", lastWebhookEventId: "evt_1" });
  });

  it("이미 처리한 이벤트면 200이고 쓰지 않는다", async () => {
    const d = deps({ ...EMPTY_ENTITLEMENT, lastWebhookEventId: "evt_1" });
    const res = await handleWebhook(await request(body()), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("uid가 없으면 200(재시도해도 해결 안 됨)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps();
    const raw = body({ data: { id: "sub_1", status: "active", customer_id: "ctm_1", custom_data: null, current_billing_period: null, scheduled_change: null } });
    const res = await handleWebhook(await request(raw), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.get).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("Auth 사용자가 삭제됐으면 200(무한 재전송 방지)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps();
    d.claims.setPremiumUntil.mockRejectedValue(new UserNotFoundError("u1"));
    const res = await handleWebhook(await request(body()), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
    expect(errorLog).toHaveBeenCalled();
  });

  it("구독 외 이벤트는 200으로 무시한다", async () => {
    const d = deps();
    const res = await handleWebhook(await request(body({ event_type: "transaction.completed" })), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.get).not.toHaveBeenCalled();
  });

  it("문서 쓰기 실패는 던진다(라우터가 500 → Paddle 재전송)", async () => {
    const d = deps();
    d.store.write.mockRejectedValue(new Error("Firestore 엔타이틀먼트 쓰기 실패 (503)"));
    await expect(handleWebhook(await request(body()), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW)).rejects.toThrow("503");
  });

  it("JSON이 깨졌으면 400", async () => {
    const d = deps();
    const res = await handleWebhook(await request("{not json"), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(400);
  });
});
