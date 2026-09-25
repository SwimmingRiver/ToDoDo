import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";

const eslint = new ESLint({ cwd: path.resolve(__dirname, "../../..") });
const lint = async (code: string, file = "src/features/x/probe.tsx") => {
  const [result] = await eslint.lintText(code, { filePath: path.resolve(__dirname, "../../..", file) });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax").length;
};

describe("하드코딩 색 규칙", () => {
  it("문자열 hex를 막는다", async () => {
    expect(await lint(`export const a = "#1a1a1a";`)).toBe(1);
  });
  it("템플릿 리터럴(styled) 안 hex와 브랜드 rgba를 막는다", async () => {
    expect(await lint("export const a = `color: #fff; background: rgba(15, 110, 86, 0.1);`;")).toBe(1);
  });
  it("그림자용 검정 rgba는 허용한다", async () => {
    expect(await lint("export const a = `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);`;")).toBe(0);
  });
  it("토큰 참조는 허용한다", async () => {
    expect(await lint("export const a = `color: ${'var(--text-primary)'};`;")).toBe(0);
  });
  it("styles 폴더와 테스트 파일은 예외다", async () => {
    expect(await lint(`export const a = "#1a1a1a";`, "src/styles/probe.ts")).toBe(0);
    expect(await lint(`export const a = "#1a1a1a";`, "src/features/x/__tests__/probe.test.ts")).toBe(0);
  });
});
