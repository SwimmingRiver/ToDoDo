import { describe, it, expect } from "vitest";
import { isAccountExistsError, isUserCancelledSignIn } from "../authErrors.js";

describe("isAccountExistsError", () => {
  it("다른 자격 증명으로 이미 가입된 코드만 true", () => {
    expect(isAccountExistsError("auth/account-exists-with-different-credential")).toBe(true);
    expect(isAccountExistsError("auth/popup-closed-by-user")).toBe(false);
    expect(isAccountExistsError(undefined)).toBe(false);
  });
});

describe("isUserCancelledSignIn", () => {
  it("사용자 취소 코드는 true", () => {
    expect(isUserCancelledSignIn("auth/popup-closed-by-user")).toBe(true);
    expect(isUserCancelledSignIn("auth/cancelled-popup-request")).toBe(true);
    expect(isUserCancelledSignIn("ERR_REQUEST_CANCELED")).toBe(true);
  });

  it("그 외는 false", () => {
    expect(isUserCancelledSignIn("auth/network-request-failed")).toBe(false);
    expect(isUserCancelledSignIn(null)).toBe(false);
  });
});
