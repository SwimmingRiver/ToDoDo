import { describe, it, expect, vi } from "vitest";
import { hmacSha256Hex } from "../hmac";
import { TrialHistoryStore, attachTrialIdentities, trialHistoryExpireAt, trialIdentityKeys } from "../trialHistory";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";

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

describe("attachTrialIdentities", () => {
  const G = { provider: "google.com" as const, key: "g-key" };
  const A = { provider: "apple.com" as const, key: "a-key" };
  const AFTER = new Date("2026-12-28T03:00:00.000Z");
  const GRANTED = "2026-12-28T03:00:00.000Z";
  const written = (doc: Partial<EntitlementDoc>) => ({ write: { ...EMPTY_ENTITLEMENT, ...doc } });

  it("이번 결정이 체험을 새로 시작하면 지금 토큰의 키를 붙인다", () => {
    const out = attachTrialIdentities(EMPTY_ENTITLEMENT, written({ trialUsedAt: GRANTED }), [G, A], AFTER);
    expect(out).toEqual(written({ trialUsedAt: GRANTED, trialIdentities: { "g-key": "google.com", "a-key": "apple.com" } }));
  });

  it("시행 시각(12-28 00:00 KST) 전에는 체험을 시작해도 키를 붙이지 않는다 — 4판 처리방침 시행 전에는 모으지 않는다", () => {
    const before = attachTrialIdentities(EMPTY_ENTITLEMENT, written({ trialUsedAt: GRANTED }), [G], new Date("2026-12-27T14:59:59.999Z"));
    expect("write" in before && before.write.trialIdentities).toEqual({});
    const at = attachTrialIdentities(EMPTY_ENTITLEMENT, written({ trialUsedAt: GRANTED }), [G], new Date("2026-12-27T15:00:00.000Z"));
    expect("write" in at && at.write.trialIdentities).toEqual({ "g-key": "google.com" });
  });

  it("이미 체험한 문서의 이후 결정(유료 구매·복원)에는 붙이지 않는다 — 체험 뒤에 연결한 계정은 체험 당시 계정이 아니다", () => {
    const existing = { ...EMPTY_ENTITLEMENT, trialUsedAt: "2026-12-01T00:00:00.000Z" };
    const out = attachTrialIdentities(existing, written({ trialUsedAt: existing.trialUsedAt }), [A], AFTER);
    expect("write" in out && out.write.trialIdentities).toEqual({});
  });

  it("체험을 쓰지 않은 문서(일반 구독)에는 붙이지 않는다", () => {
    const out = attachTrialIdentities(EMPTY_ENTITLEMENT, written({ trialUsedAt: null }), [G], AFTER);
    expect("write" in out && out.write.trialIdentities).toEqual({});
  });

  it("반영하지 않는 결정(skip)은 그대로 돌려준다", () => {
    expect(attachTrialIdentities(EMPTY_ENTITLEMENT, { skip: "TRIAL_ALREADY_USED" }, [G], AFTER)).toEqual({ skip: "TRIAL_ALREADY_USED" });
  });
});

describe("TrialHistoryStore", () => {
  it("record는 모든 키를 한 번의 commit으로 원자적으로 쓰고, provider·recordedAt·expireAt만 담는다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await new TrialHistoryStore("p", getToken, fetchFn).record(
      [
        { provider: "google.com", key: "k1" },
        { provider: "apple.com", key: "k2" },
      ],
      now,
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}:commit`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { writes: { update: { name: string; fields: unknown } }[] };
    const expireAt = trialHistoryExpireAt(now).toISOString();
    expect(body.writes).toEqual([
      {
        update: {
          name: "projects/p/databases/(default)/documents/trialHistory/k1",
          fields: {
            provider: { stringValue: "google.com" },
            recordedAt: { stringValue: now.toISOString() },
            expireAt: { timestampValue: expireAt },
          },
        },
      },
      {
        update: {
          name: "projects/p/databases/(default)/documents/trialHistory/k2",
          fields: {
            provider: { stringValue: "apple.com" },
            recordedAt: { stringValue: now.toISOString() },
            expireAt: { timestampValue: expireAt },
          },
        },
      },
    ]);
  });

  it("만료는 달력 기준 1년 뒤다(윤일이 끼어도 하루 짧아지지 않는다)", () => {
    expect(trialHistoryExpireAt(new Date("2027-12-27T15:00:00.000Z")).toISOString()).toBe("2028-12-27T15:00:00.000Z");
    expect(trialHistoryExpireAt(new Date("2027-01-10T00:00:00.000Z")).toISOString()).toBe("2028-01-10T00:00:00.000Z");
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
