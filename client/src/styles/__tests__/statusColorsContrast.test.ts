import { describe, it, expect } from "vitest";
import { statusColors } from "../statusColors";

/**
 * WCAG 2.1 상대 휘도. brandContrast.test.ts와 동일한 공식을 쓴다 — 색 계산
 * 라이브러리를 들이는 대신 테스트 전용으로 여기 직접 둔다.
 */
const relativeLuminance = (hex: string): number => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (a: string, b: string): number => {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
};

const AA_TEXT = 4.5;
const statuses = ["todo", "doing", "done"] as const;

describe("statusColors 대비", () => {
  it.each(statuses)("%s의 main은 light 배경 위 텍스트로 AA를 만족한다", (status) => {
    const { main, light } = statusColors[status];
    expect(contrast(main, light)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(statuses)("%s의 main은 흰 배경 위 텍스트로도 AA를 만족한다", (status) => {
    expect(contrast(statusColors[status].main, "#FFFFFF")).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });
});
