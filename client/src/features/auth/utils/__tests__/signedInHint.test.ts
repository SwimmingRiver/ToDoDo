import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readSignedInHint, writeSignedInHint } from "../signedInHint";

describe("signedInHint", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("로그인을 기록하면 true, 로그아웃을 기록하면 false를 읽는다", () => {
    expect(readSignedInHint()).toBe(false);
    writeSignedInHint(true);
    expect(readSignedInHint()).toBe(true);
    writeSignedInHint(false);
    expect(readSignedInHint()).toBe(false);
  });

  it("저장소 접근이 막혀도 던지지 않고 false로 취급한다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => writeSignedInHint(true)).not.toThrow();
    expect(readSignedInHint()).toBe(false);
  });
});
