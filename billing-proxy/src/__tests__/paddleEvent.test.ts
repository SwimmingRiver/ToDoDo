import { describe, it, expect } from "vitest";
import { parseWebhook } from "../paddleEvent";

const payload = (overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  event_id: "evt_1",
  event_type: "subscription.updated",
  occurred_at: "2026-10-10T00:00:00.000000Z",
  data: {
    id: "sub_1",
    status: "active",
    customer_id: "ctm_1",
    custom_data: { uid: "u1", uid_sig: "sig_1" },
    current_billing_period: { starts_at: "2026-10-10T00:00:00Z", ends_at: "2026-11-10T00:00:00Z" },
    scheduled_change: null,
    ...data,
  },
  ...overrides,
});

describe("parseWebhook", () => {
  it("구독 이벤트를 내부 형태로 바꾼다", () => {
    expect(parseWebhook(payload())).toEqual({
      kind: "subscription",
      uid: "u1",
      uidSig: "sig_1",
      event: {
        eventId: "evt_1",
        occurredAt: "2026-10-10T00:00:00.000000Z",
        status: "active",
        customerId: "ctm_1",
        subscriptionId: "sub_1",
        currentPeriodEndsAt: "2026-11-10T00:00:00Z",
        scheduledCancelAt: null,
      },
    });
  });

  it("예약 해지는 scheduledCancelAt으로, 일시정지 예약은 무시한다", () => {
    const cancel = parseWebhook(payload({}, { scheduled_change: { action: "cancel", effective_at: "2026-11-10T00:00:00Z" } }));
    expect(cancel.kind === "subscription" && cancel.event.scheduledCancelAt).toBe("2026-11-10T00:00:00Z");
    const pause = parseWebhook(payload({}, { scheduled_change: { action: "pause", effective_at: "2026-11-10T00:00:00Z" } }));
    expect(pause.kind === "subscription" && pause.event.scheduledCancelAt).toBeNull();
  });

  it("해지된 구독은 기간이 null일 수 있다", () => {
    const parsed = parseWebhook(payload({ event_type: "subscription.canceled" }, { status: "canceled", current_billing_period: null }));
    expect(parsed.kind === "subscription" && parsed.event.currentPeriodEndsAt).toBeNull();
  });

  it("custom_data.uid가 없으면 uid null", () => {
    const parsed = parseWebhook(payload({}, { custom_data: null }));
    expect(parsed.kind === "subscription" && parsed.uid).toBeNull();
    expect(parsed.kind === "subscription" && parsed.uidSig).toBeNull();
  });

  it("custom_data.uid_sig가 없으면 uidSig null(uid는 그대로)", () => {
    const parsed = parseWebhook(payload({}, { custom_data: { uid: "u1" } }));
    expect(parsed.kind === "subscription" && parsed.uid).toBe("u1");
    expect(parsed.kind === "subscription" && parsed.uidSig).toBeNull();
  });

  it("구독 이벤트가 아니면 ignored", () => {
    expect(parseWebhook(payload({ event_type: "transaction.completed" }))).toEqual({ kind: "ignored" });
  });

  it("필수 필드가 없거나 모르는 상태면 invalid", () => {
    expect(parseWebhook(payload({}, { status: "weird" })).kind).toBe("invalid");
    expect(parseWebhook(payload({ event_id: undefined })).kind).toBe("invalid");
    expect(parseWebhook(null).kind).toBe("invalid");
  });

  it("해석할 수 없는 시각이면 invalid", () => {
    expect(parseWebhook(payload({ occurred_at: "not-a-date" })).kind).toBe("invalid");
    expect(parseWebhook(payload({}, { current_billing_period: { ends_at: "garbage" } })).kind).toBe("invalid");
    expect(
      parseWebhook(payload({}, { scheduled_change: { action: "cancel", effective_at: "garbage" } })).kind,
    ).toBe("invalid");
  });
});
