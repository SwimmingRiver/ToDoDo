import type { PaddleSubscriptionEvent } from "./entitlement";

const SUBSCRIPTION_EVENTS = new Set(["subscription.created", "subscription.updated", "subscription.canceled"]);
const STATUSES = new Set(["active", "trialing", "past_due", "paused", "canceled"]);

export type ParsedWebhook =
  | { kind: "ignored" }
  | { kind: "invalid"; reason: string }
  | {
      kind: "subscription";
      uid: string | null;
      uidSig: string | null;
      /** 구독 항목(data.items[].price.id)의 가격 id. inactive 항목과 형식이 다른 항목은 건너뛴다. */
      priceIds: string[];
      event: PaddleSubscriptionEvent;
    };

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null;
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export const parseWebhook = (body: unknown): ParsedWebhook => {
  if (!isObject(body)) return { kind: "invalid", reason: "본문이 객체가 아님" };
  const eventType = str(body.event_type);
  if (eventType === null) return { kind: "invalid", reason: "event_type 없음" };
  if (!SUBSCRIPTION_EVENTS.has(eventType)) return { kind: "ignored" };

  const eventId = str(body.event_id);
  const occurredAt = str(body.occurred_at);
  const data = isObject(body.data) ? body.data : null;
  const subscriptionId = str(data?.id);
  const customerId = str(data?.customer_id);
  const status = str(data?.status);
  if (!eventId || !occurredAt || !data || !subscriptionId || !customerId || !status || !STATUSES.has(status)) {
    return { kind: "invalid", reason: `필수 필드 누락 또는 알 수 없는 상태(${status})` };
  }

  if (Number.isNaN(Date.parse(occurredAt))) return { kind: "invalid", reason: `occurred_at 해석 불가(${occurredAt})` };

  const period = isObject(data.current_billing_period) ? data.current_billing_period : null;
  const scheduled = isObject(data.scheduled_change) ? data.scheduled_change : null;
  const customData = isObject(data.custom_data) ? data.custom_data : null;
  const priceIds = (Array.isArray(data.items) ? data.items : [])
    // inactive 항목은 청구되지 않으므로 "우리 가격으로 결제했다"의 근거가 되지 않는다.
    .map((item) => (isObject(item) && item.status !== "inactive" && isObject(item.price) ? str(item.price.id) : null))
    .filter((id): id is string => id !== null);

  const currentPeriodEndsAt = str(period?.ends_at);
  const scheduledCancelAt = scheduled?.action === "cancel" ? str(scheduled.effective_at) : null;
  for (const value of [currentPeriodEndsAt, scheduledCancelAt]) {
    if (value !== null && Number.isNaN(Date.parse(value))) return { kind: "invalid", reason: `시각 해석 불가(${value})` };
  }

  return {
    kind: "subscription",
    uid: str(customData?.uid),
    uidSig: str(customData?.uid_sig),
    priceIds,
    event: {
      eventId,
      occurredAt,
      status: status as PaddleSubscriptionEvent["status"],
      customerId,
      subscriptionId,
      currentPeriodEndsAt,
      scheduledCancelAt,
    },
  };
};
