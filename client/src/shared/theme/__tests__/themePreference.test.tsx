import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemePreferenceProvider } from "../themePreference";
import { useThemePreference } from "../useThemePreference";

let osDark = false;
let listeners: Array<(e: { matches: boolean }) => void> = [];
const setOsDark = (v: boolean) => {
  osDark = v;
  listeners.forEach((l) => l({ matches: v }));
};

beforeEach(() => {
  osDark = false;
  listeners = [];
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.appendChild(meta);
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() { return osDark; },
    media: query,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => {
      listeners = listeners.filter((x) => x !== l);
    },
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const Probe = () => {
  const { preference, scheme, setPreference } = useThemePreference();
  return (
    <>
      <span data-testid="pref">{preference}</span>
      <span data-testid="scheme">{scheme}</span>
      <button onClick={() => setPreference("dark")}>dark</button>
      <button onClick={() => setPreference("system")}>system</button>
    </>
  );
};
const renderProbe = () => render(<ThemePreferenceProvider><Probe /></ThemePreferenceProvider>);
const themeAttr = () => document.documentElement.dataset.theme;
const metaColor = () => document.head.querySelector('meta[name="theme-color"]')?.getAttribute("content");

describe("ThemePreferenceProvider", () => {
  it("저장값이 없으면 system이고 OS를 따른다", () => {
    osDark = true;
    renderProbe();
    expect(screen.getByTestId("pref")).toHaveTextContent("system");
    expect(themeAttr()).toBe("dark");
    expect(metaColor()).toBe("#121212");
  });

  it("저장된 선택값을 읽는다", () => {
    window.localStorage.setItem("tododo:theme", "dark");
    renderProbe();
    expect(screen.getByTestId("scheme")).toHaveTextContent("dark");
  });

  it("잘못된 저장값은 system", () => {
    window.localStorage.setItem("tododo:theme", "purple");
    renderProbe();
    expect(screen.getByTestId("pref")).toHaveTextContent("system");
  });

  it("localStorage가 throw해도 system으로 동작하고 선택도 된다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    renderProbe();
    expect(screen.getByTestId("pref")).toHaveTextContent("system");
    await userEvent.click(screen.getByText("dark"));
    expect(themeAttr()).toBe("dark");
  });

  it("setPreference는 저장하고 data-theme·meta를 즉시 갱신한다", async () => {
    renderProbe();
    await userEvent.click(screen.getByText("dark"));
    expect(window.localStorage.getItem("tododo:theme")).toBe("dark");
    expect(themeAttr()).toBe("dark");
    expect(metaColor()).toBe("#121212");
  });

  it("system일 때 OS 전환을 즉시 반영한다", () => {
    renderProbe();
    expect(themeAttr()).toBe("light");
    act(() => setOsDark(true));
    expect(themeAttr()).toBe("dark");
    expect(screen.getByTestId("scheme")).toHaveTextContent("dark");
  });

  it("light/dark를 고른 뒤에는 OS 전환을 무시한다", async () => {
    renderProbe();
    await userEvent.click(screen.getByText("dark"));
    act(() => setOsDark(false));
    expect(themeAttr()).toBe("dark");
  });

  it("matchMedia가 없는 환경에서도 라이트로 렌더된다", () => {
    vi.stubGlobal("matchMedia", undefined);
    renderProbe();
    expect(themeAttr()).toBe("light");
  });

  it("Provider 밖에서 훅을 쓰면 throw", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow();
  });

  it("다른 탭에서 저장값이 바뀌면 storage 이벤트로 반영한다", () => {
    renderProbe();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "tododo:theme", newValue: "dark" }));
    });
    expect(themeAttr()).toBe("dark");
    expect(screen.getByTestId("pref")).toHaveTextContent("dark");
  });

  it("다른 key의 storage 이벤트는 무시한다", () => {
    renderProbe();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "other-key", newValue: "dark" }));
    });
    expect(themeAttr()).toBe("light");
    expect(screen.getByTestId("pref")).toHaveTextContent("system");
  });
});
