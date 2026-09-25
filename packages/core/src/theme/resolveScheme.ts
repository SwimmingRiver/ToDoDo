import type { ThemePreference, ThemeScheme } from "./tokens";

export const THEME_STORAGE_KEY = "tododo:theme";

export const parsePreference = (raw: unknown): ThemePreference =>
  raw === "light" || raw === "dark" || raw === "system" ? raw : "system";

/**
 * client/index.html의 인라인 스크립트가 같은 규칙을 복제한다(첫 페인트 전이라 모듈을
 * import할 수 없다). 규칙을 바꾸면 그쪽도 함께 바꾸고 파리티 테스트를 돌릴 것.
 */
export const resolveScheme = (preference: ThemePreference, osPrefersDark: boolean): ThemeScheme =>
  preference === "system" ? (osPrefersDark ? "dark" : "light") : preference;
