import { describe, it, expect } from "vitest";
import { formatTimeAgo } from "../timeAgo";

const NOW = 1_000_000_000_000;
const MIN = 60_000;

describe("formatTimeAgo", () => {
  it.each([
    [30 * 1000, "방금"],
    [-5 * 1000, "방금"], // 기기 시계가 서버보다 늦은 경우
    [MIN, "1분 전"],
    [59 * MIN, "59분 전"],
    [60 * MIN, "1시간 전"],
    [23 * 60 * MIN, "23시간 전"],
    [24 * 60 * MIN, "1일 전"],
    [7 * 24 * 60 * MIN, "7일 전"],
  ])("%d ms 전 → %s", (ago, text) => {
    expect(formatTimeAgo(NOW - ago, NOW)).toBe(text);
  });
});
