import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "./entitlement";

type FirestoreValue = { stringValue?: string; nullValue?: null };

export interface StoredEntitlement {
  doc: EntitlementDoc;
  /** 낙관적 동시성 제어용. null이면 문서가 아직 없다. */
  updateTime: string | null;
}

const STATUSES = new Set(["none", "trialing", "active", "past_due", "canceled"]);
const SOURCES = new Set(["manual", "trial", "paddle"]);
const PLANS = new Set(["free", "premium"]);
const FIELD_NAMES = Object.keys(EMPTY_ENTITLEMENT) as (keyof EntitlementDoc)[];

const readString = (value: FirestoreValue | undefined): string | null =>
  value && typeof value.stringValue === "string" ? value.stringValue : null;

const decode = (fields: Record<string, FirestoreValue>): EntitlementDoc => {
  const text = (name: keyof EntitlementDoc) => readString(fields[name]);
  const plan = text("plan");
  const status = text("status");
  const source = text("source");
  return {
    plan: plan && PLANS.has(plan) ? (plan as EntitlementDoc["plan"]) : EMPTY_ENTITLEMENT.plan,
    status: status && STATUSES.has(status) ? (status as EntitlementDoc["status"]) : EMPTY_ENTITLEMENT.status,
    source: source && SOURCES.has(source) ? (source as EntitlementDoc["source"]) : null,
    premiumUntil: text("premiumUntil"),
    trialUsedAt: text("trialUsedAt"),
    cancelAt: text("cancelAt"),
    currentPeriodEnd: text("currentPeriodEnd"),
    customerId: text("customerId"),
    subscriptionId: text("subscriptionId"),
    lastWebhookEventId: text("lastWebhookEventId"),
    lastEventOccurredAt: text("lastEventOccurredAt"),
    updatedAt: text("updatedAt") ?? "",
  };
};

const encode = (doc: EntitlementDoc): Record<string, FirestoreValue> =>
  Object.fromEntries(
    FIELD_NAMES.map((name) => {
      const value = doc[name];
      return [name, value === null ? { nullValue: null } : { stringValue: value }];
    }),
  );

const PRECONDITION_FAILURES = new Set(["FAILED_PRECONDITION", "ALREADY_EXISTS", "NOT_FOUND", "ABORTED"]);

/**
 * 서비스 계정으로 entitlements/{uid}를 읽고 쓴다(보안 규칙 우회). 쓰기는 항상 사전조건을 걸어
 * 동시에 들어온 웹훅·체험 요청이 서로의 결과를 덮어쓰지 않게 한다.
 */
export class EntitlementStore {
  private readonly base: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 기본값으로 담으면 Workers가 "Illegal invocation"을 던진다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    return this.fetchFn(`${this.base}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  }

  async get(uid: string): Promise<StoredEntitlement> {
    const res = await this.request(`/entitlements/${encodeURIComponent(uid)}`);
    if (res.status === 404) return { doc: EMPTY_ENTITLEMENT, updateTime: null };
    if (!res.ok) throw new Error(`Firestore 엔타이틀먼트 조회 실패 (${res.status})`);
    const body = (await res.json()) as { fields?: Record<string, FirestoreValue>; updateTime: string };
    return { doc: decode(body.fields ?? {}), updateTime: body.updateTime };
  }

  async write(uid: string, doc: EntitlementDoc, updateTime: string | null): Promise<"ok" | "conflict"> {
    const precondition =
      updateTime === null
        ? "currentDocument.exists=false"
        : `currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
    const res = await this.request(`/entitlements/${encodeURIComponent(uid)}?${precondition}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: encode(doc) }),
    });
    if (res.ok) return "ok";
    const body = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
    if (PRECONDITION_FAILURES.has(body?.error?.status ?? "")) return "conflict";
    throw new Error(`Firestore 엔타이틀먼트 쓰기 실패 (${res.status})`);
  }
}
