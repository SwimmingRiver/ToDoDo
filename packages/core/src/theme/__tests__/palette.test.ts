import { describe, it, expect } from "vitest";
import { contrast } from "../contrast";
import { lightTokens, darkTokens, themes } from "..";

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
const statuses = ["todo", "doing", "done"] as const;

/** 두 팔레트가 같은 키 집합을 갖는지(한쪽에만 토큰을 추가하는 실수 방지). */
const leafPaths = (node: object, prefix = ""): string[] =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : leafPaths(v as object, `${prefix}${k}.`),
  );

describe("팔레트 구조", () => {
  it("light와 dark는 같은 토큰 경로를 가진다", () => {
    expect(leafPaths(darkTokens).sort()).toEqual(leafPaths(lightTokens).sort());
  });
  it("themes는 두 팔레트를 scheme 이름으로 노출한다", () => {
    expect(themes.light).toBe(lightTokens);
    expect(themes.dark).toBe(darkTokens);
  });
  it("urgency.danger는 danger 토큰을 그대로 재사용한다", () => {
    for (const t of [lightTokens, darkTokens]) {
      expect(t.urgency.danger).toEqual({ main: t.danger.main, background: t.danger.background, text: t.danger.text });
    }
  });
});

describe.each([
  ["light", lightTokens],
  ["dark", darkTokens],
] as const)("%s 팔레트 AA", (_name, t) => {
  const surfaces = [t.background.primary, t.surface.raised, t.surface.overlay];

  it.each(surfaces)("본문·보조 글자는 %s 위에서 AA", (bg) => {
    expect(contrast(t.text.primary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(t.text.secondary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("보조 글자는 background.secondary 위에서도 AA", () => {
    expect(contrast(t.text.secondary, t.background.secondary)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it.each(surfaces)("brand.strong은 %s 위 글자로 AA", (bg) => {
    expect(contrast(t.brand.strong, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("brand.strong은 tint 위에서 AA", () => {
    expect(contrast(t.brand.strong, t.brand.tint)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("onStrong은 strong·strongHover 솔리드 위에서 AA", () => {
    expect(contrast(t.brand.onStrong, t.brand.strong)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(t.brand.onStrong, t.brand.strongHover)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("strongHover는 바탕 위 글자로 AA", () => {
    expect(contrast(t.brand.strongHover, t.background.primary)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("strongHover는 strong과 1.2:1 이상 구분된다", () => {
    expect(contrast(t.brand.strong, t.brand.strongHover)).toBeGreaterThanOrEqual(1.2);
  });
  it("fill은 바탕 위 비텍스트 3:1", () => {
    expect(contrast(t.brand.fill, t.background.primary)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
  it.each(statuses)("status.%s.main은 자기 light 배경과 카드 위에서 AA", (s) => {
    expect(contrast(t.status[s].main, t.status[s].light)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(t.status[s].main, t.surface.raised)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("urgency.soon.text는 자기 배경 위에서 AA", () => {
    expect(contrast(t.urgency.soon.text, t.urgency.soon.background)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("danger.main은 카드 위 비텍스트 3:1", () => {
    expect(contrast(t.danger.main, t.surface.raised)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe("light 전용 불변식", () => {
  it("light fill은 글자색으로 쓸 수 없다(fill/strong을 나누는 이유)", () => {
    // 다크에서는 밝은 fill이 어두운 바탕 위에서 글자 대비를 넘기므로 light에만 적용한다.
    expect(contrast(lightTokens.brand.fill, "#FFFFFF")).toBeLessThan(AA_TEXT);
  });
});
