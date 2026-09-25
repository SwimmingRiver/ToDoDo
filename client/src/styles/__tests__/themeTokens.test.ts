import { describe, it, expect } from "vitest";
import { lightTokens } from "@tododo/core";
import { colors } from "../colors";
import { statusColors } from "../statusColors";
import { urgencyColors } from "../urgencyColors";

const leaves = (node: object): string[] =>
  Object.values(node).flatMap((v) => (typeof v === "string" ? [v] : leaves(v as object)));

describe("client 토큰 모듈", () => {
  it("모든 값이 CSS 변수 참조다(리터럴 색이 섞이면 다크에서 안 바뀐다)", () => {
    for (const v of [...leaves(colors), ...leaves(statusColors), ...leaves(urgencyColors)]) {
      expect(v).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });
  it("colors는 기존 그룹 + 신규 surface/scrim을 노출한다", () => {
    expect(Object.keys(colors).sort()).toEqual(
      ["background", "border", "brand", "danger", "scrim", "surface", "text"],
    );
    expect(colors.brand.onStrong).toBe("var(--brand-on-strong)");
    expect(colors.surface.overlay).toBe("var(--surface-overlay)");
  });
  it("statusColors·urgencyColors는 core 팔레트와 같은 키를 가진다", () => {
    expect(Object.keys(statusColors)).toEqual(Object.keys(lightTokens.status));
    expect(Object.keys(urgencyColors)).toEqual(Object.keys(lightTokens.urgency));
  });
});
