import { describe, it, expect, beforeEach } from "vitest";
import { getTokenRecord, setTokenRecord, deleteTokenRecord } from "../tokenStore";

class FakeKVNamespace {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe("tokenStore", () => {
  let kv: FakeKVNamespace;

  beforeEach(() => {
    kv = new FakeKVNamespace();
  });

  it("저장한 적 없는 uid는 null을 반환한다", async () => {
    const result = await getTokenRecord(kv as never, "user-1");
    expect(result).toBeNull();
  });

  it("저장한 토큰을 그대로 읽어올 수 있다", async () => {
    await setTokenRecord(kv as never, "user-1", { refreshToken: "abc" });
    const result = await getTokenRecord(kv as never, "user-1");
    expect(result).toEqual({ refreshToken: "abc" });
  });

  it("삭제하면 다시 null을 반환한다", async () => {
    await setTokenRecord(kv as never, "user-1", { refreshToken: "abc" });
    await deleteTokenRecord(kv as never, "user-1");
    const result = await getTokenRecord(kv as never, "user-1");
    expect(result).toBeNull();
  });

  it("서로 다른 uid는 독립적으로 저장된다", async () => {
    await setTokenRecord(kv as never, "user-1", { refreshToken: "abc" });
    await setTokenRecord(kv as never, "user-2", { refreshToken: "xyz" });
    expect(await getTokenRecord(kv as never, "user-1")).toEqual({ refreshToken: "abc" });
    expect(await getTokenRecord(kv as never, "user-2")).toEqual({ refreshToken: "xyz" });
  });
});
