import { describe, it, expect } from "vitest";
import { PREMIUM_BENEFITS } from "../config";

describe("PREMIUM_BENEFITS", () => {
  it("프리미엄 혜택 3가지를 순서대로 가진다", () => {
    expect(PREMIUM_BENEFITS.map((b) => b.title)).toEqual([
      "AI 할 일 플랜",
      "구글 캘린더 연동",
      "완료 통계",
    ]);
    for (const benefit of PREMIUM_BENEFITS) {
      expect(benefit.description.length).toBeGreaterThan(0);
      expect(benefit.icon).toBeDefined();
    }
  });
});
