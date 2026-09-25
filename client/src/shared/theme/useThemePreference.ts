import { useContext } from "react";
import { ThemePreferenceContext, type ThemePreferenceValue } from "./themePreferenceContext";

export const useThemePreference = (): ThemePreferenceValue => {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error("useThemePreference는 ThemePreferenceProvider 안에서만 쓸 수 있습니다");
  return ctx;
};
