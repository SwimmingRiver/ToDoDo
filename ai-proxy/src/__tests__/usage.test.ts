import { describe, it, expect, vi } from "vitest";
import { seoulDateKey, getUsage, incrementUsage, USAGE_TTL_SECONDS } from "../usage";

const makeKv = () => {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    } as unknown as KVNamespace,
  };
};

describe("seoulDateKey", () => {
  it("UTC 14:59는 서울 같은 날, 15:00은 서울 다음날이다", () => {
    expect(seoulDateKey(new Date("2026-09-25T14:59:59Z"))).toBe("2026-09-25");
    expect(seoulDateKey(new Date("2026-09-25T15:00:00Z"))).toBe("2026-09-26");
  });
});

describe("getUsage / incrementUsage", () => {
  it("기록이 없으면 0이다", async () => {
    const { kv } = makeKv();
    expect(await getUsage(kv, "u1", new Date("2026-09-25T03:00:00Z"))).toBe(0);
  });

  it("증가하면 서울 날짜 키에 TTL 2일로 저장한다", async () => {
    const { kv, store } = makeKv();
    const now = new Date("2026-09-25T03:00:00Z");
    expect(await incrementUsage(kv, "u1", now, 0)).toBe(1);
    expect(store.get("usage:u1:2026-09-25")).toBe("1");
    expect(vi.mocked(kv.put)).toHaveBeenCalledWith("usage:u1:2026-09-25", "1", {
      expirationTtl: USAGE_TTL_SECONDS,
    });
    expect(await getUsage(kv, "u1", now)).toBe(1);
  });

  it("서울 날짜가 바뀌면 새 키라 0부터 센다", async () => {
    const { kv } = makeKv();
    await incrementUsage(kv, "u1", new Date("2026-09-25T14:00:00Z"), 0);
    expect(await getUsage(kv, "u1", new Date("2026-09-25T15:00:00Z"))).toBe(0);
  });

  it("다른 uid와 섞이지 않는다", async () => {
    const { kv } = makeKv();
    const now = new Date("2026-09-25T03:00:00Z");
    await incrementUsage(kv, "u1", now, 0);
    expect(await getUsage(kv, "u2", now)).toBe(0);
  });

  it("저장값이 숫자가 아니면 0으로 취급한다", async () => {
    const { kv, store } = makeKv();
    store.set("usage:u1:2026-09-25", "garbage");
    expect(await getUsage(kv, "u1", new Date("2026-09-25T03:00:00Z"))).toBe(0);
  });
});
