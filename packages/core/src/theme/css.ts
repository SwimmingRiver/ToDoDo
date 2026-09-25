import type { ThemeTokens, TokenRefs } from "./tokens";

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export const toCssVarName = (path: readonly string[]): string => `--${path.map(kebab).join("-")}`;

const mapLeaves = (node: object, path: string[], fn: (path: string[], value: string) => string): object =>
  Object.fromEntries(
    Object.entries(node).map(([k, v]) => [
      k,
      typeof v === "string" ? fn([...path, k], v) : mapLeaves(v as object, [...path, k], fn),
    ]),
  );

/** 같은 모양의 객체를 값만 `var(--경로)`로 바꿔 돌려준다. */
export const toCssVarRefs = <T extends object>(tokens: T): TokenRefs<T> =>
  mapLeaves(tokens, [], (path) => `var(${toCssVarName(path)})`) as TokenRefs<T>;

const declarations = (tokens: ThemeTokens): string => {
  const lines: string[] = [];
  mapLeaves(tokens, [], (path, value) => {
    lines.push(`  ${toCssVarName(path)}: ${value};`);
    return value;
  });
  return lines.join("\n");
};

export const buildThemeCss = (light: ThemeTokens, dark: ThemeTokens): string =>
  `:root {\n  color-scheme: light;\n${declarations(light)}\n}\n` +
  `:root[data-theme="dark"] {\n  color-scheme: dark;\n${declarations(dark)}\n}\n`;
