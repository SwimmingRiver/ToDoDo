import { describe, it, expect, vi } from "vitest";
import { hmacSha256Hex } from "../hmac";
import { TRIAL_HISTORY_TTL_MS, TrialHistoryStore, trialIdentityKeys } from "../trialHistory";

const BASE = "https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents";
const getToken = async () => "tok";
const now = new Date("2027-01-10T00:00:00.000Z");

const docResponse = (expireAt: string) =>
  new Response(
    JSON.stringify({
      fields: {
        provider: { stringValue: "google.com" },
        recordedAt: { stringValue: "2027-01-01T00:00:00.000Z" },
        expireAt: { timestampValue: expireAt },
      },
    }),
    { status: 200 },
  );

describe("trialIdentityKeys", () => {
  it("provider:sub를 HMAC한 키를 제공자별로 만든다", async () => {
    const keys = await trialIdentityKeys("secret", { "google.com": ["same"], "apple.com": ["same"] });
    expect(keys).toEqual([
      { provider: "google.com", key: await hmacSha256Hex("secret", "google.com:same") },
      { provider: "apple.com", key: await hmacSha256Hex("secret", "apple.com:same") },
    ]);
    expect(keys[0].key).not.toBe(keys[1].key);
  });

  it("식별자가 없으면 빈 배열", async () => {
    expect(await trialIdentityKeys("secret", {})).toEqual([]);
  });
});

describe("TrialHistoryStore", () => {
  it("record는 trialHistory/{key}에 provider·recordedAt·expireAt(+365일)만 쓴다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await new TrialHistoryStore("p", getToken, fetchFn).record([{ provider: "apple.com", key: "k1" }], now);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/trialHistory/k1`);
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string) as { fields: Record<string, unknown> };
    expect(body.fields).toEqual({
      provider: { stringValue: "apple.com" },
      recordedAt: { stringValue: now.toISOString() },
      expireAt: { timestampValue: new Date(now.getTime() + TRIAL_HISTORY_TTL_MS).toISOString() },
    });
    expect(TRIAL_HISTORY_TTL_MS).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it("record는 실패 응답이면 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(new TrialHistoryStore("p", getToken, fetchFn).record([{ provider: "google.com", key: "k" }], now)).rejects.toThrow();
  });

  it("hasActive는 만료 전 문서가 하나라도 있으면 true", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(docResponse("2027-12-31T00:00:00.000Z"));
    expect(await new TrialHistoryStore("p", getToken, fetchFn).hasActive(["a", "b"], now)).toBe(true);
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([`${BASE}/trialHistory/a`, `${BASE}/trialHistory/b`]);
  });

  it("hasActive는 expireAt이 지난 문서만 있으면 false (TTL 삭제 지연)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(docResponse("2027-01-09T23:59:59.000Z"));
    expect(await new TrialHistoryStore("p", getToken, fetchFn).hasActive(["a"], now)).toBe(false);
  });

  it("hasActive는 404면 false, 키가 없으면 조회하지 않는다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const store = new TrialHistoryStore("p", getToken, fetchFn);
    expect(await store.hasActive(["a"], now)).toBe(false);
    fetchFn.mockClear();
    expect(await store.hasActive([], now)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("hasActive는 조회 실패 응답이면 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(new TrialHistoryStore("p", getToken, fetchFn).hasActive(["a"], now)).rejects.toThrow();
  });
});
