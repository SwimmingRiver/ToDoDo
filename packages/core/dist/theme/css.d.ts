import type { ThemeTokens, TokenRefs } from "./tokens";
export declare const toCssVarName: (path: readonly string[]) => string;
/** 같은 모양의 객체를 값만 `var(--경로)`로 바꿔 돌려준다. */
export declare const toCssVarRefs: <T extends object>(tokens: T) => TokenRefs<T>;
export declare const buildThemeCss: (light: ThemeTokens, dark: ThemeTokens) => string;
