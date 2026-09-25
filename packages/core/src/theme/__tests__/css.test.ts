import { describe, it, expect } from "vitest";
import { toCssVarName, toCssVarRefs, buildThemeCss, lightTokens, darkTokens } from "..";

const leafPaths = (node: object, prefix: string[] = []): string[][] =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === "string" ? [[...prefix, k]] : leafPaths(v as object, [...prefix, k]),
  );

describe("toCssVarName", () => {
  it("경로를 kebab-case로 잇는다", () => {
    expect(toCssVarName(["status", "doing", "main"])).toBe("--status-doing-main");
    expect(toCssVarName(["brand", "strongHover"])).toBe("--brand-strong-hover");
    expect(toCssVarName(["scrim"])).toBe("--scrim");
  });
});

describe("toCssVarRefs", () => {
  it("모든 leaf를 var(--경로)로 바꾸고 모양은 유지한다", () => {
    const refs = toCssVarRefs(lightTokens);
    expect(refs.brand.strong).toBe("var(--brand-strong)");
    expect(refs.status.done.light).toBe("var(--status-done-light)");
    expect(refs.scrim).toBe("var(--scrim)");
    expect(leafPaths(refs)).toEqual(leafPaths(lightTokens));
  });
});

describe("buildThemeCss", () => {
  const css = buildThemeCss(lightTokens, darkTokens);
  it("light는 :root, dark는 :root[data-theme=\"dark\"]에 선언한다", () => {
    expect(css).toMatch(/:root\s*\{[^}]*--brand-strong:\s*#0F6E56;/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*--brand-strong:\s*#3CCB9A;/);
  });
  it("각 블록에 color-scheme을 선언한다", () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light;/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark;/);
  });
  it("모든 토큰 경로가 두 블록에 모두 선언된다", () => {
    for (const path of leafPaths(lightTokens)) {
      const name = toCssVarName(path);
      expect(css.split(`${name}:`).length - 1).toBe(2);
    }
  });
});
