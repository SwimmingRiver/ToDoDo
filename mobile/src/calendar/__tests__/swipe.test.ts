import { describe, expect, it } from "@jest/globals";
import { swipeDirection } from "../swipe";

describe("swipeDirection", () => {
  it("왼쪽으로 50pt 이상 → 다음 주, 오른쪽 → 이전 주", () => {
    expect(swipeDirection(-60, 10)).toBe(1);
    expect(swipeDirection(60, 10)).toBe(-1);
  });
  it("짧거나 세로가 더 큰 움직임은 무시", () => {
    expect(swipeDirection(-40, 0)).toBe(0);
    expect(swipeDirection(-60, 80)).toBe(0);
  });
});
