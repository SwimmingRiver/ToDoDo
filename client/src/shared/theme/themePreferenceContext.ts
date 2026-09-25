import { createContext } from "react";
import type { ThemePreference, ThemeScheme } from "@tododo/core/dist/theme/index.js";

export interface ThemePreferenceValue {
  preference: ThemePreference;
  scheme: ThemeScheme;
  setPreference: (p: ThemePreference) => void;
}

export const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);
