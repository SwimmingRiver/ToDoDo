import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemePreferenceProvider } from "@/shared/theme/themePreference";
import ThemeMenu from "../themeMenu";

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => vi.unstubAllGlobals());

const setup = () =>
  render(
    <ThemePreferenceProvider>
      <ThemeMenu />
      <button>outside</button>
    </ThemePreferenceProvider>,
  );
const trigger = () => screen.getByRole("button", { name: /화면 테마/ });

describe("ThemeMenu", () => {
  it("현재 선택을 라벨에 담고, 처음엔 닫혀 있다", () => {
    setup();
    expect(trigger()).toHaveAccessibleName("화면 테마: 시스템");
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("열면 3항목이 있고 현재 항목만 checked", async () => {
    setup();
    await userEvent.click(trigger());
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["라이트", "시스템", "다크"]);
    expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
  });

  it("항목을 고르면 적용되고 닫히며 포커스가 트리거로 돌아간다", async () => {
    setup();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitemradio", { name: "다크" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAccessibleName("화면 테마: 다크");
  });

  it("열면 현재 항목에 포커스, ↑↓로 순환 이동, Enter로 선택", async () => {
    setup();
    await userEvent.click(trigger());
    expect(screen.getByRole("menuitemradio", { name: "시스템" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "다크" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "라이트" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitemradio", { name: "다크" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("Esc로 닫히고 포커스가 트리거로 돌아간다", async () => {
    setup();
    await userEvent.click(trigger());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("바깥 클릭으로 닫히고 선택은 바뀌지 않는다", async () => {
    setup();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveAccessibleName("화면 테마: 시스템");
  });
});
