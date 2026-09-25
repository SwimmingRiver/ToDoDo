import { lightTokens } from "./light";
import { darkTokens } from "./dark";
import type { ThemeScheme, ThemeTokens } from "./tokens";

export type { ThemeTokens, ThemeScheme, ThemePreference, TokenRefs } from "./tokens";
export { lightTokens, darkTokens };
export { contrast } from "./contrast";

export const themes: Record<ThemeScheme, ThemeTokens> = { light: lightTokens, dark: darkTokens };
