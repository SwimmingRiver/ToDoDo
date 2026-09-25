import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("Tab으로 포커스가 벗어나면 메뉴가 닫히고 선택은 바뀌지 않으며, 포커스는 트리거로 돌아오지 않는다", async () => {
    setup();
    await userEvent.click(trigger());
    await userEvent.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveAccessibleName("화면 테마: 시스템");
    expect(trigger()).not.toHaveFocus();
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);
  });

  it("아이템에 포커스가 있는 상태에서 relatedTarget 없는 blur 후 트리거를 클릭하면 닫힌 채로 유지된다 (Safari 포커스 레이스)", () => {
    setup();
    fireEvent.click(trigger());
    const systemItem = screen.getByRole("menuitemradio", { name: "시스템" });
    // Safari는 버튼을 마우스 클릭으로 포커스하지 않는다: 트리거를 클릭해도 포커스를
    // 받을 곳이 없어 relatedTarget이 null인 blur만 발생한다.
    fireEvent.blur(systemItem, { relatedTarget: null });
    fireEvent.click(trigger());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
