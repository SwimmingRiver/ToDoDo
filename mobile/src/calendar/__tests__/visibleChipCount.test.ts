import { describe, expect, it } from "@jest/globals";
import { countVisibleChips } from "../visibleChipCount";

describe("countVisibleChips", () => {
  it("다 들어가면 전부", () => {
    expect(countVisibleChips([20, 20, 44, 44, 68], 70)).toBe(5);
  });
  it("넘치면 들어가는 개수만큼(+n은 따로 비워 둔 오른쪽 자리에 고정되므로 빼지 않는다)", () => {
    expect(countVisibleChips([20, 20, 44, 44, 68, 68], 50)).toBe(4);
  });
  it("큰 글씨로 칩이 한 줄에 하나만 들어가도 그 1개를 보인다", () => {
    expect(countVisibleChips([20, 44, 68], 30)).toBe(1);
  });
  it("아무것도 안 들어가도 최소 1개", () => {
    expect(countVisibleChips([20, 44], 10)).toBe(1);
  });
  it("칩이 없으면 0", () => {
    expect(countVisibleChips([], 70)).toBe(0);
  });
});
