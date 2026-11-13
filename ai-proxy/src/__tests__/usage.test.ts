import { describe, it, expect, vi } from "vitest";
import {
  seoulDateKey,
  getUsage,
  incrementUsage,
  getAttempts,
  incrementAttempts,
  USAGE_TTL_SECONDS,
} from "../usage";

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
    expect(await incrementUsage(kv, "u1", now)).toBe(1);
    expect(store.get("usage:u1:2026-09-25")).toBe("1");
    expect(vi.mocked(kv.put)).toHaveBeenCalledWith("usage:u1:2026-09-25", "1", {
      expirationTtl: USAGE_TTL_SECONDS,
    });
    expect(await getUsage(kv, "u1", now)).toBe(1);
  });

  it("서울 날짜가 바뀌면 새 키라 0부터 센다", async () => {
    const { kv } = makeKv();
    await incrementUsage(kv, "u1", new Date("2026-09-25T14:00:00Z"));
    expect(await getUsage(kv, "u1", new Date("2026-09-25T15:00:00Z"))).toBe(0);
  });

  it("다른 uid와 섞이지 않는다", async () => {
    const { kv } = makeKv();
    const now = new Date("2026-09-25T03:00:00Z");
    await incrementUsage(kv, "u1", now);
    expect(await getUsage(kv, "u2", now)).toBe(0);
  });

  it("쓰기 직전에 최신값을 다시 읽어 latest+1을 쓴다(경쟁 상태 대비)", async () => {
    const { kv, store } = makeKv();
    const now = new Date("2026-09-25T03:00:00Z");
    store.set("usage:u1:2026-09-25", "5"); // 게이트 체크 이후 다른 요청이 먼저 써놓은 상태
    expect(await incrementUsage(kv, "u1", now)).toBe(6);
    expect(store.get("usage:u1:2026-09-25")).toBe("6");
  });

  it("저장값이 숫자가 아니면 0으로 취급한다", async () => {
    const { kv, store } = makeKv();
    store.set("usage:u1:2026-09-25", "garbage");
    expect(await getUsage(kv, "u1", new Date("2026-09-25T03:00:00Z"))).toBe(0);
  });
});

describe("getAttempts / incrementAttempts", () => {
  const now = new Date("2026-09-25T03:00:00Z");

  it("두 번 증가하면 2이고 서울 날짜 attempts 키에 TTL 2일로 저장한다", async () => {
    const { kv } = makeKv();
    await incrementAttempts(kv, "user-1", now);
    expect(await incrementAttempts(kv, "user-1", now)).toBe(2);
    expect(vi.mocked(kv.put)).toHaveBeenLastCalledWith("attempts:user-1:2026-09-25", "2", {
      expirationTtl: USAGE_TTL_SECONDS,
    });
    expect(await getAttempts(kv, "user-1", now)).toBe(2);
  });

  it("값이 없거나 숫자가 아니면 0이다", async () => {
    const { kv, store } = makeKv();
    expect(await getAttempts(kv, "user-1", now)).toBe(0);
    store.set("attempts:user-1:2026-09-25", "garbage");
    expect(await getAttempts(kv, "user-1", now)).toBe(0);
  });

  it("성공 카운트(usage 키)를 건드리지 않는다", async () => {
    const { kv, store } = makeKv();
    store.set("usage:user-1:2026-09-25", "4");
    await incrementAttempts(kv, "user-1", now);
    expect(store.get("usage:user-1:2026-09-25")).toBe("4");
    expect(await getUsage(kv, "user-1", now)).toBe(4);
  });

  it("서울 자정(UTC 15:00)이 지나면 새 날짜 키를 쓴다", async () => {
    const { kv, store } = makeKv();
    await incrementAttempts(kv, "user-1", new Date("2026-09-25T15:00:00Z"));
    expect(store.get("attempts:user-1:2026-09-26")).toBe("1");
  });
});
