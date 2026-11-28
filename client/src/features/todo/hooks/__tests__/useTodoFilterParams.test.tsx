import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import type { ReactNode } from "react";
import { useTodoFilterParams } from "../useTodoFilterParams";

const setup = (entry: string) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ params: useTodoFilterParams(), location: useLocation(), navType: useNavigationType() }),
    { wrapper },
  );
};

const search = (r: { current: { location: { search: string } } }) =>
  new URLSearchParams(r.current.location.search);

describe("useTodoFilterParams", () => {
  it("URL에서 필터·탭을 읽고 알 수 없는 값은 무시하며 다른 키는 보존한다", () => {
    const { result } = setup("/list?p=foo,high&tab=xyz&x=1");

    expect(result.current.params.filter.priorities).toEqual(["high"]);
    expect(result.current.params.tab).toBe("active");
    expect(search(result).get("x")).toBe("1");
  });

  it("q를 그대로 filter.query로 읽는다", () => {
    const { result } = setup("/list?q=운동");
    expect(result.current.params.filter.query).toBe("운동");
  });

  it("setQuery는 q를 쓰고 replace로 히스토리를 늘리지 않으며 다른 키를 보존한다", () => {
    const { result } = setup("/list?x=1");

    act(() => result.current.params.setQuery("운동"));

    expect(search(result).get("q")).toBe("운동");
    expect(search(result).get("x")).toBe("1");
    expect(result.current.navType).toBe("REPLACE");
  });

  it("빈/공백 검색어는 q를 제거한다", () => {
    const { result } = setup("/list?q=a");
    act(() => result.current.params.setQuery("  "));
    expect(search(result).has("q")).toBe(false);
  });

  it("togglePriority를 두 번 하면 p가 제거되고, 순서는 high,medium,low로 정규화된다", () => {
    const { result } = setup("/list");

    act(() => result.current.params.togglePriority("low"));
    expect(search(result).get("p")).toBe("low");
    act(() => result.current.params.togglePriority("high"));
    expect(search(result).get("p")).toBe("high,low");
    act(() => result.current.params.togglePriority("low"));
    act(() => result.current.params.togglePriority("high"));
    expect(search(result).has("p")).toBe(false);
  });

  it("setTab은 done일 때만 tab을 기록한다", () => {
    const { result } = setup("/list");

    act(() => result.current.params.setTab("done"));
    expect(search(result).get("tab")).toBe("done");
    expect(result.current.params.tab).toBe("done");
    act(() => result.current.params.setTab("active"));
    expect(search(result).has("tab")).toBe(false);
  });

  it("setQuery·setTab을 같은 값으로 부르면 location이 바뀌지 않는다", () => {
    const { result } = setup("/list?q=a&tab=done");
    const key = result.current.location.key;

    // 같은 주소로 replace해도 react-router는 새 location을 만들어 구독자가 다시 렌더된다.
    // 디바운스 effect와 맞물리면 무한 반복이 되므로(칸반 I1) 훅에서 막는다.
    act(() => result.current.params.setQuery("a"));
    act(() => result.current.params.setTab("done"));
    act(() => result.current.params.setQuery("a"));

    expect(result.current.location.key).toBe(key);
  });

  it("지울 필터가 없을 때 resetFilter는 내비게이션하지 않는다", () => {
    const { result } = setup("/list?tab=done");
    const key = result.current.location.key;

    act(() => result.current.params.resetFilter());

    expect(result.current.location.key).toBe(key);
  });

  it("resetFilter는 q와 p를 한 번에 지우고 tab과 다른 키는 보존한다", () => {
    const { result } = setup("/list?q=a&p=high,low&tab=done&x=1");

    act(() => result.current.params.resetFilter());

    expect(search(result).has("q")).toBe(false);
    expect(search(result).has("p")).toBe(false);
    expect(search(result).get("tab")).toBe("done");
    expect(search(result).get("x")).toBe("1");
    expect(result.current.navType).toBe("REPLACE");
  });

  it("같은 틱에 연달아 불러도 앞선 변경을 덮어쓰지 않는다(resetFilter 직후 setQuery(\"\")가 p를 되살리지 않음)", () => {
    const { result } = setup("/list?q=a&p=high&tab=done");

    act(() => {
      result.current.params.resetFilter();
      result.current.params.setQuery("");
    });

    expect(search(result).has("q")).toBe(false);
    expect(search(result).has("p")).toBe(false);
    expect(search(result).get("tab")).toBe("done");
  });

  it("같은 틱에 칩 두 개를 연달아 켜도 둘 다 남는다", () => {
    const { result } = setup("/list");

    act(() => {
      result.current.params.togglePriority("low");
      result.current.params.togglePriority("high");
    });

    expect(search(result).get("p")).toBe("high,low");
  });
});
