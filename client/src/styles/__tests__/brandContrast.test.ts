import { describe, it, expect } from "vitest";
import { colors } from "../colors";

/**
 * WCAG 2.1 상대 휘도. 색 계산 라이브러리를 들이는 대신 여기 직접 둔다 —
 * 테스트 전용이라 번들과 무관하고, 공식이 20줄이라 의존성이 과하다.
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

const WHITE = "#FFFFFF";
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe("대비 계산 helper", () => {
  // 공식이 틀리면 아래 토큰 검증이 전부 무의미하게 통과할 수 있어 먼저 고정한다.
  it("검정과 흰색의 대비는 21:1이다", () => {
    expect(contrast("#000000", WHITE)).toBeCloseTo(21, 1);
  });

  it("같은 색끼리의 대비는 1:1이다", () => {
    expect(contrast(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it("인자 순서와 무관하게 같은 값을 낸다", () => {
    expect(contrast("#0F6E56", WHITE)).toBeCloseTo(contrast(WHITE, "#0F6E56"), 5);
  });
});

describe("brand 토큰 대비", () => {
  it("strong은 흰 배경 위 글자로 AA를 만족한다", () => {
    expect(contrast(colors.brand.strong, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("strong은 흰 글자를 얹는 배경으로도 AA를 만족한다", () => {
    // 대비는 대칭이라 위 검증과 같은 수식이지만, 솔리드 버튼이라는
    // 별개 용도를 명시적으로 고정해 둔다.
    expect(contrast(WHITE, colors.brand.strong)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("strong은 tint 배경 위에서도 AA를 만족한다", () => {
    expect(contrast(colors.brand.strong, colors.brand.tint)).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it("strongHover는 흰 배경·흰 글자 양쪽으로 AA를 만족한다", () => {
    expect(contrast(colors.brand.strongHover, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("strongHover는 strong과 눈에 띄게 구분된다", () => {
    // 1.2:1 미만이면 hover가 바뀐 걸 인지하기 어렵다.
    expect(
      contrast(colors.brand.strong, colors.brand.strongHover),
    ).toBeGreaterThanOrEqual(1.2);
  });

  it("fill은 흰 배경 위 비텍스트 기준(3:1)을 만족한다", () => {
    expect(contrast(colors.brand.fill, WHITE)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("fill은 글자색으로 쓸 수 없다", () => {
    // 이 테스트가 깨진다면 fill이 밝기를 잃은 것이다. 그렇다면 fill과 strong을
    // 나눌 이유 자체가 사라지므로 토큰 구조를 다시 봐야 한다.
    expect(contrast(colors.brand.fill, WHITE)).toBeLessThan(AA_TEXT);
  });
});
