import { describe, it, expect, beforeEach } from "vitest";
import { getTokenRecord, setTokenRecord, deleteTokenRecord, createOAuthState, consumeOAuthState } from "../tokenStore";

class FakeKVNamespace {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  // 세 번째 인자(TTL 등 옵션)는 실제 Workers KV의 만료 동작을 흉내 내지 않고
  // 무시한다 — 이 스위트는 "TTL이 실제로 만료되는지"가 아니라 "TTL 옵션과 함께
  // put이 호출되는지, 1회용 소비가 되는지"만 검증한다(만료 자체는 Cloudflare KV의
  // 보장이라 유닛 테스트 대상이 아니다).
  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> {
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

describe("createOAuthState / consumeOAuthState", () => {
  let kv: FakeKVNamespace;

  beforeEach(() => {
    kv = new FakeKVNamespace();
  });

  it("발급한 state로 원래 uid를 조회할 수 있다", async () => {
    const state = await createOAuthState(kv as never, "user-1");
    const uid = await consumeOAuthState(kv as never, state);
    expect(uid).toBe("user-1");
  });

  it("한 번 소비한 state는 다시 쓸 수 없다(1회용)", async () => {
    const state = await createOAuthState(kv as never, "user-1");
    await consumeOAuthState(kv as never, state);
    const second = await consumeOAuthState(kv as never, state);
    expect(second).toBeNull();
  });

  it("존재하지 않는 state는 null을 반환한다", async () => {
    const uid = await consumeOAuthState(kv as never, "forged-state-token");
    expect(uid).toBeNull();
  });

  it("호출마다 서로 다른 state를 발급한다", async () => {
    const state1 = await createOAuthState(kv as never, "user-1");
    const state2 = await createOAuthState(kv as never, "user-1");
    expect(state1).not.toBe(state2);
  });
});
