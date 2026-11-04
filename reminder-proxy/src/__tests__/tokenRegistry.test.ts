import { describe, it, expect, beforeEach } from "vitest";
import { registerTokenState, unregisterTokenState, hasRefreshableTokens } from "../tokenRegistry";
import { MemoryReminderStore } from "./memoryStore";

let store: MemoryReminderStore;
beforeEach(() => {
  store = new MemoryReminderStore();
});

describe("unregisterTokenState", () => {
  // 탈퇴 직후 웹 logout()이 같은 ID 토큰으로 DELETE /push-tokens를 보낸다. 이때 비워진 DO에 uid가 되살아나면 안 된다.
  it("비어 있는 저장소에서는 아무것도 기록하지 않는다(uid도)", () => {
    unregisterTokenState(store, "t1");
    expect(store.getMeta("uid")).toBeNull();
    expect(store.listTokens()).toEqual([]);
  });

  it("등록된 토큰만 지우고 기존 uid는 건드리지 않는다", () => {
    registerTokenState(store, "u1", "t1", "web", 1);
    unregisterTokenState(store, "t1");
    expect(store.listTokens()).toEqual([]);
    expect(store.getMeta("uid")).toBe("u1");
  });
});

describe("hasRefreshableTokens", () => {
  it("토큰이 없으면 false이고 uid를 기록하지 않는다", () => {
    expect(hasRefreshableTokens(store, "u1")).toBe(false);
    expect(store.getMeta("uid")).toBeNull();
  });

  it("토큰이 있으면 true이고 uid를 기록한다", () => {
    store.upsertToken("t1", "web", 1);
    expect(hasRefreshableTokens(store, "u1")).toBe(true);
    expect(store.getMeta("uid")).toBe("u1");
  });
});

describe("registerTokenState", () => {
  it("uid와 토큰을 함께 기록한다", () => {
    registerTokenState(store, "u1", "t1", "web", 1);
    expect(store.getMeta("uid")).toBe("u1");
    expect(store.listTokens()).toEqual(["t1"]);
  });
});
