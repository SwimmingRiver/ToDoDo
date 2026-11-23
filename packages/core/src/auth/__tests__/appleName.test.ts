import { describe, it, expect } from "vitest";
import { formatAppleDisplayName } from "../appleName.js";

describe("formatAppleDisplayName", () => {
  it("한글은 성+이름 순서로 붙인다", () => {
    expect(formatAppleDisplayName("수영", "강")).toBe("강수영");
    expect(formatAppleDisplayName(" 수영 ", " 강 ")).toBe("강수영");
  });

  it("영문은 이름 성 순서로 공백을 둔다", () => {
    expect(formatAppleDisplayName("Swim", "Kang")).toBe("Swim Kang");
  });

  it("한쪽이라도 한글이면 성+이름", () => {
    expect(formatAppleDisplayName("수영", "Kang")).toBe("Kang수영");
  });

  it("한쪽만 있으면 그대로 반환한다", () => {
    expect(formatAppleDisplayName("수영", null)).toBe("수영");
    expect(formatAppleDisplayName(undefined, "Kang")).toBe("Kang");
  });

  it("둘 다 비면 null", () => {
    expect(formatAppleDisplayName("", "  ")).toBeNull();
    expect(formatAppleDisplayName(null, undefined)).toBeNull();
  });
});
