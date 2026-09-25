import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  THEME_STORAGE_KEY, parsePreference, resolveScheme, themes,
  type ThemePreference, type ThemeScheme,
} from "@tododo/core/dist/theme/index.js";
import { ThemePreferenceContext } from "./themePreferenceContext";

const DARK_QUERY = "(prefers-color-scheme: dark)";

// 프라이빗 모드·쿠키 차단에서 localStorage 접근 자체가 throw할 수 있다.
const readStored = (): ThemePreference => {
  try {
    return parsePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
};
const writeStored = (p: ThemePreference) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, p);
  } catch {
    // 저장 실패 시 이번 세션에서만 유지된다.
  }
};
const mediaQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;

const applyScheme = (scheme: ThemeScheme) => {
  document.documentElement.dataset.theme = scheme;
  document.head
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themes[scheme].background.primary);
};

export const ThemePreferenceProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored);
  const [osDark, setOsDark] = useState<boolean>(() => mediaQuery()?.matches ?? false);

  useEffect(() => {
    const mq = mediaQuery();
    if (!mq) return;
    const onChange = (e: { matches: boolean }) => setOsDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // 다른 탭에서 테마를 바꾸면 이 탭도 즉시 따라간다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      setPreferenceState(parsePreference(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const scheme = resolveScheme(preference, osDark);

  useEffect(() => {
    applyScheme(scheme);
  }, [scheme]);

  const setPreference = useCallback((p: ThemePreference) => {
    writeStored(p);
    setPreferenceState(p);
  }, []);

  const value = useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme, setPreference]);
  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
};
