import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isChunkLoadError,
  canAutoReload,
  markAutoReload,
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
} from "../chunkReload";

describe("isChunkLoadError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://x/assets/a.js",
    "Importing a module script failed.",
    "error loading dynamically imported module: https://x/assets/a.js",
    "Unable to preload CSS for /assets/a.css",
  ])("청크 로드 실패 메시지면 true: %s", (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it("일반 오류는 false", () => {
    expect(isChunkLoadError(new Error("boom"))).toBe(false);
  });

  it("Error가 아닌 값은 false", () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false);
  });
});

describe("canAutoReload / markAutoReload", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("상수 값", () => {
    expect(CHUNK_RELOAD_KEY).toBe("tododo:chunkReloadAt");
    expect(CHUNK_RELOAD_WINDOW_MS).toBe(5 * 60_000);
  });

  it("기록이 없으면 재시도할 수 있다", () => {
    expect(canAutoReload(1_000_000)).toBe(true);
  });

  it("5분 안에 다시 실패하면 재시도하지 않고, 5분이 지나면 다시 할 수 있다", () => {
    markAutoReload(1_000_000);
    expect(canAutoReload(1_005_000)).toBe(false);
    // 느린 망: 새로고침 후 인증·청크 요청이 오래 걸려 1분 뒤에 실패해도 다시 새로고침하지 않는다
    expect(canAutoReload(1_060_000)).toBe(false);
    expect(canAutoReload(1_300_000)).toBe(true);
  });

  it("저장소 읽기가 막히면 재시도하지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(canAutoReload()).toBe(false);
  });

  it("저장소 쓰기가 막혀도 throw하지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => markAutoReload()).not.toThrow();
  });
});
