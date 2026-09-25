import { describe, it, expect } from "vitest";
import { contrast } from "../contrast";

describe("contrast", () => {
  // 공식이 틀리면 팔레트 검증이 전부 공허하게 통과하므로 먼저 고정한다.
  it("검정과 흰색은 21:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });
  it("같은 색은 1:1", () => {
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("인자 순서와 무관", () => {
    expect(contrast("#0F6E56", "#FFFFFF")).toBeCloseTo(contrast("#FFFFFF", "#0F6E56"), 5);
  });
  it("소문자 hex도 같은 값", () => {
    expect(contrast("#0f6e56", "#ffffff")).toBeCloseTo(contrast("#0F6E56", "#FFFFFF"), 5);
  });
});
