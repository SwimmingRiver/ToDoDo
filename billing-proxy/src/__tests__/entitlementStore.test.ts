import { describe, it, expect, vi } from "vitest";
import { EntitlementStore, toFirestoreValue, fromFirestoreValue } from "../entitlementStore";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";

const getToken = async () => "access-token";
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const SAMPLE: EntitlementDoc = {
  ...EMPTY_ENTITLEMENT,
  plan: "premium",
  status: "active",
  source: "paddle",
  premiumUntil: "2026-11-13T00:00:00.000Z",
  customerId: "ctm_1",
  updatedAt: "2026-10-10T00:00:00.000Z",
};

describe("EntitlementStore.get", () => {
  it("문서가 없으면 빈 엔타이틀먼트와 updateTime null", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const store = new EntitlementStore("proj", getToken, fetchFn);
    await expect(store.get("u1")).resolves.toEqual({ doc: EMPTY_ENTITLEMENT, updateTime: null });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents/entitlements/u1",
    );
  });

  it("필드를 디코드하고 모르는 값·누락은 기본값으로 채운다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes({
        updateTime: "2026-10-10T00:00:00.123456Z",
        fields: {
          plan: { stringValue: "premium" },
          status: { stringValue: "expired" },
          source: { stringValue: "manual" },
          premiumUntil: { stringValue: "2099-12-31T00:00:00.000Z" },
          customerId: { nullValue: null },
          updatedAt: { stringValue: "2026-09-19T00:00:00.000Z" },
        },
      }),
    );
    const { doc, updateTime } = await new EntitlementStore("proj", getToken, fetchFn).get("u1");
    expect(updateTime).toBe("2026-10-10T00:00:00.123456Z");
    expect(doc).toEqual({
      ...EMPTY_ENTITLEMENT,
      plan: "premium",
      status: "none",
      source: "manual",
      premiumUntil: "2099-12-31T00:00:00.000Z",
      updatedAt: "2026-09-19T00:00:00.000Z",
      // 예전 문서(sources 없음)는 최상위 필드가 manual 출처 하나로 이주된다.
      sources: {
        manual: {
          status: "none",
          premiumUntil: "2099-12-31T00:00:00.000Z",
          cancelAt: null,
          currentPeriodEnd: null,
          autoRenew: false,
          startedAt: null,
          updatedAt: "2026-09-19T00:00:00.000Z",
        },
      },
    });
  });

  it("decodes legacy doc without sources into migrated sources", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes({
        updateTime: "t",
        fields: {
          source: { stringValue: "paddle" },
          status: { stringValue: "active" },
          premiumUntil: { stringValue: "2026-12-01T00:00:00.000Z" },
          customerId: { stringValue: "ctm_1" },
          subscriptionId: { stringValue: "sub_1" },
        },
      }),
    );
    const { doc } = await new EntitlementStore("proj", getToken, fetchFn).get("u1");
    expect(doc.sources.paddle).toMatchObject({ customerId: "ctm_1", subscriptionId: "sub_1", autoRenew: true });
  });

  it("그 외 오류는 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(new EntitlementStore("proj", getToken, fetchFn).get("u1")).rejects.toThrow("500");
  });
});

describe("EntitlementStore.write", () => {
  it("기존 문서면 updateTime 사전조건으로 전체 필드를 PATCH한다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({}));
    const result = await new EntitlementStore("proj", getToken, fetchFn).write("u1", SAMPLE, "2026-10-10T00:00:00.123456Z");
    expect(result).toBe("ok");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents/entitlements/u1" +
        "?currentDocument.updateTime=2026-10-10T00%3A00%3A00.123456Z",
    );
    expect(init.method).toBe("PATCH");
    expect(init.headers.Authorization).toBe("Bearer access-token");
    const fields = JSON.parse(init.body).fields;
    expect(fields.plan).toEqual({ stringValue: "premium" });
    expect(fields.trialUsedAt).toEqual({ nullValue: null });
    expect(Object.keys(fields).sort()).toEqual(Object.keys(EMPTY_ENTITLEMENT).sort());
  });

  it("문서가 없던 경우 exists=false 사전조건을 쓴다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({}));
    await new EntitlementStore("proj", getToken, fetchFn).write("u1", SAMPLE, null);
    expect(fetchFn.mock.calls[0][0]).toMatch(/\?currentDocument\.exists=false$/);
  });

  it.each([
    [409, { error: { status: "ALREADY_EXISTS" } }],
    [404, { error: { status: "NOT_FOUND" } }],
    [400, { error: { status: "FAILED_PRECONDITION" } }],
  ])("사전조건 실패(%i)는 conflict로 돌려준다", async (status, body) => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes(body, status));
    await expect(new EntitlementStore("proj", getToken, fetchFn).write("u1", SAMPLE, null)).resolves.toBe("conflict");
  });

  it("다른 400·500은 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ error: { status: "INVALID_ARGUMENT" } }, 400));
    await expect(new EntitlementStore("proj", getToken, fetchFn).write("u1", SAMPLE, null)).rejects.toThrow("400");
  });
});

const PADDLE_APPLE: EntitlementDoc = {
  ...SAMPLE,
  customerId: "ctm_1",
  subscriptionId: "sub_1",
  sources: {
    paddle: {
      status: "active",
      premiumUntil: "2026-11-13T00:00:00.000Z",
      cancelAt: null,
      currentPeriodEnd: "2026-11-10T00:00:00.000Z",
      autoRenew: true,
      startedAt: null,
      updatedAt: "2026-10-10T00:00:00.000Z",
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      lastWebhookEventId: null,
      lastEventOccurredAt: null,
    },
    apple: {
      status: "active",
      premiumUntil: "2026-12-01T00:00:00.000Z",
      cancelAt: null,
      currentPeriodEnd: "2026-12-01T00:00:00.000Z",
      autoRenew: false,
      startedAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      originalTransactionId: "tx1",
      productId: "premium_monthly",
      environment: "Sandbox",
      appAccountToken: null,
      lastNotificationUUID: null,
      lastSignedDate: null,
    },
  },
  duplicate: { laterSource: "apple", detectedAt: "2026-11-01T00:00:00.000Z" },
};

describe("Firestore 값 인코딩", () => {
  it("encodes sources as mapValue with booleanValue for autoRenew", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({}));
    await new EntitlementStore("proj", getToken, fetchFn).write("u1", PADDLE_APPLE, null);
    const fields = JSON.parse(fetchFn.mock.calls[0][1].body).fields;
    expect(fields.sources.mapValue.fields.paddle.mapValue.fields.autoRenew).toEqual({ booleanValue: true });
    expect(fields.sources.mapValue.fields.apple.mapValue.fields.autoRenew).toEqual({ booleanValue: false });
    expect(fields.duplicate.mapValue.fields.laterSource).toEqual({ stringValue: "apple" });
  });

  it("round-trips a doc with paddle+apple sources and duplicate", async () => {
    let stored: unknown;
    const fetchFn = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        stored = JSON.parse(init.body as string).fields;
        return jsonRes({});
      }
      return jsonRes({ updateTime: "t", fields: stored });
    });
    const store = new EntitlementStore("proj", getToken, fetchFn);
    await store.write("u1", PADDLE_APPLE, null);
    expect((await store.get("u1")).doc).toEqual(PADDLE_APPLE);
  });

  it("omits undefined source keys instead of writing null", () => {
    const value = toFirestoreValue({ a: "x", b: undefined, c: null });
    expect(Object.keys(value.mapValue?.fields ?? {}).sort()).toEqual(["a", "c"]);
    expect(fromFirestoreValue(value)).toEqual({ a: "x", c: null });
  });
});
