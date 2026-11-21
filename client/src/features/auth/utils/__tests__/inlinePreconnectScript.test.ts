import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SIGNED_IN_HINT_KEY, writeSignedInHint } from "../signedInHint";

// index.html의 preconnect 스크립트는 번들 밖이라 signedInHint.ts를 import할 수 없어
// 키를 문자열로 직접 갖고 있다. 둘이 어긋나면 preconnect가 조용히 꺼지므로 실제
// 스크립트를 실행해 같은 힌트에 반응하는지 확인한다.
const html = readFileSync(path.resolve(__dirname, "../../../../../index.html"), "utf8");
const script = html.match(/<script data-preconnect-init>([\s\S]*?)<\/script>/)?.[1];

const preconnects = () =>
  [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]')].map(
    (l) => ({ href: l.href, crossOrigin: l.crossOrigin }),
  );

beforeEach(() => {
  localStorage.clear();
  document.head.querySelectorAll('link[rel="preconnect"]').forEach((l) => l.remove());
});
afterEach(() => vi.restoreAllMocks());

describe("index.html preconnect 초기화 스크립트", () => {
  it("head 안, 모듈 스크립트보다 앞에 있고 같은 힌트 키를 쓴다", () => {
    expect(script).toBeTruthy();
    expect(script).toContain(`"${SIGNED_IN_HINT_KEY}"`);
    expect(html.indexOf("data-preconnect-init")).toBeLessThan(html.indexOf("</head>"));
    expect(html.indexOf("data-preconnect-init")).toBeLessThan(html.indexOf('type="module"'));
  });

  it("로그인 힌트가 있으면 Google API 3곳에 crossorigin preconnect를 연다", () => {
    writeSignedInHint(true);
    new Function(script!)();
    expect(preconnects()).toEqual([
      { href: "https://identitytoolkit.googleapis.com/", crossOrigin: "anonymous" },
      { href: "https://securetoken.googleapis.com/", crossOrigin: "anonymous" },
      { href: "https://firestore.googleapis.com/", crossOrigin: "anonymous" },
    ]);
  });

  it("힌트가 없으면(비로그인) 아무 연결도 열지 않는다", () => {
    new Function(script!)();
    expect(preconnects()).toEqual([]);
  });

  it("저장소 접근이 막혀도 던지지 않고 연결을 열지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => new Function(script!)()).not.toThrow();
    expect(preconnects()).toEqual([]);
  });
});
