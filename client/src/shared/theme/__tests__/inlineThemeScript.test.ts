import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveScheme, themes } from "@tododo/core/dist/theme/index.js";

const html = readFileSync(path.resolve(__dirname, "../../../../index.html"), "utf8");
const script = html.match(/<script data-theme-init>([\s\S]*?)<\/script>/)?.[1];

const run = (stored: string | null | "throw", osDark: boolean) => {
  document.documentElement.removeAttribute("data-theme");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    if (stored === "throw") throw new Error("blocked");
    return stored;
  });
  vi.stubGlobal("matchMedia", () => ({ matches: osDark }));
  new Function(script!)();
  return document.documentElement.dataset.theme;
};

beforeEach(() => {
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.appendChild(meta);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("index.html 테마 초기화 스크립트", () => {
  it("head 안, 모듈 스크립트보다 앞에 있다", () => {
    expect(script).toBeTruthy();
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toContain("data-theme-init");
    expect(html.indexOf("data-theme-init")).toBeLessThan(html.indexOf('type="module"'));
  });

  it.each([
    ["system", false], ["system", true], ["light", false],
    ["light", true], ["dark", false], ["dark", true],
  ] as const)("stored=%s osDark=%s → resolveScheme과 같은 결과", (stored, osDark) => {
    expect(run(stored, osDark)).toBe(resolveScheme(stored, osDark));
  });

  it("저장값 없음·잘못된 값·접근 throw는 system으로 판정", () => {
    expect(run(null, true)).toBe("dark");
    expect(run("purple", false)).toBe("light");
    expect(run("throw", true)).toBe("dark");
  });

  it("theme-color meta를 scheme 바탕색으로 맞춘다", () => {
    run("dark", false);
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute("content"))
      .toBe(themes.dark.background.primary);
  });
});
