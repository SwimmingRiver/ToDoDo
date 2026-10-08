import { describe, it, expect, vi } from "vitest";
import { EntitlementStore } from "../entitlementStore";
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
    });
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
