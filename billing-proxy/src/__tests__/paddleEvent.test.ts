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
    started_at: "2026-10-01T00:00:00Z",
    custom_data: { uid: "u1", uid_sig: "sig_1" },
    current_billing_period: { starts_at: "2026-10-10T00:00:00Z", ends_at: "2026-11-10T00:00:00Z" },
    scheduled_change: null,
    items: [{ status: "active", quantity: 1, price: { id: "pri_1" } }],
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
      priceIds: ["pri_1"],
      event: {
        eventId: "evt_1",
        occurredAt: "2026-10-10T00:00:00.000000Z",
        status: "active",
        customerId: "ctm_1",
        subscriptionId: "sub_1",
        currentPeriodEndsAt: "2026-11-10T00:00:00Z",
        scheduledCancelAt: null,
        startedAt: "2026-10-01T00:00:00Z",
      },
    });
  });

  it("paddleEvent parses started_at — 없거나 해석 불가면 null(이벤트는 반영)", () => {
    const missing = parseWebhook(payload({}, { started_at: null }));
    expect(missing.kind === "subscription" && missing.event.startedAt).toBeNull();
    // started_at은 이중 구독 판정용 부가 정보다 — 이 값 하나 때문에 권한 이벤트 전체를 버리지 않는다.
    const garbled = parseWebhook(payload({}, { started_at: "not-a-date" }));
    expect(garbled.kind).toBe("subscription");
    expect(garbled.kind === "subscription" && garbled.event.startedAt).toBeNull();
  });

  it("items의 가격 id를 모두 모으고, items가 없거나 형식이 다르면 빈 목록", () => {
    const two = parseWebhook(payload({}, { items: [{ price: { id: "pri_1" } }, { price: { id: "pri_2" } }] }));
    expect(two.kind === "subscription" && two.priceIds).toEqual(["pri_1", "pri_2"]);
    for (const items of [undefined, null, "x", [{ price: null }, { price: { id: 3 } }, null]]) {
      const parsed = parseWebhook(payload({}, { items }));
      expect(parsed.kind === "subscription" && parsed.priceIds).toEqual([]);
    }
  });

  it("비활성(청구되지 않는) 항목의 가격은 빼고, 상태가 없거나 다른 상태면 포함한다", () => {
    const parsed = parseWebhook(
      payload({}, {
        items: [
          { status: "inactive", price: { id: "pri_inactive" } },
          { status: "active", price: { id: "pri_active" } },
          { status: "trialing", price: { id: "pri_trialing" } },
          { price: { id: "pri_no_status" } },
        ],
      }),
    );
    expect(parsed.kind === "subscription" && parsed.priceIds).toEqual(["pri_active", "pri_trialing", "pri_no_status"]);
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
