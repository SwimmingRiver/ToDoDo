import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TodoSearch } from "../todoSearch";

const renderSearch = (props: Partial<Parameters<typeof TodoSearch>[0]> = {}) => {
  const onSearch = props.onSearch ?? vi.fn();
  const onClear = props.onClear ?? vi.fn();
  const utils = render(
    <TodoSearch
      onSearch={onSearch}
      onClear={onClear}
      isSearching={false}
      {...props}
    />,
  );
  return { ...utils, onSearch, onClear };
};

// 디바운스(setTimeout 300ms)를 결정적으로 검증하기 위해 fake timer를 쓴다.
// user.type은 내부적으로 실제 지연(delay)에 의존해 fake timer와 잘 맞물리지 않으므로
// (조합 시 테스트가 타임아웃난다), 여기서는 fireEvent로 입력값만 바꾸고 타이머는
// vi.advanceTimersByTimeAsync로 직접 흘려보낸다.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const typeInto = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } });

describe("TodoSearch 기본 렌더링", () => {
  it("검색 placeholder를 표시한다", () => {
    renderSearch();
    expect(screen.getByPlaceholderText("할 일 검색...")).toBeInTheDocument();
  });

  it("입력값이 없을 때는 지우기 버튼을 표시하지 않는다", () => {
    const { container } = renderSearch();
    expect(container.querySelector(".lucide-x")).not.toBeInTheDocument();
  });

  it("isSearching이 false면 검색 결과 정보를 표시하지 않는다", () => {
    renderSearch({ isSearching: false });
    expect(screen.queryByText("검색 취소")).not.toBeInTheDocument();
  });
});

describe("TodoSearch 디바운스 검색", () => {
  it("입력 후 300ms가 지나야 trim된 값으로 onSearch가 호출된다", async () => {
    const onSearch = vi.fn();
    renderSearch({ onSearch });

    typeInto(screen.getByPlaceholderText("할 일 검색..."), "  회의  ");

    expect(onSearch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);

    expect(onSearch).toHaveBeenCalledWith("회의");
  });

  it("300ms 이내에 값이 또 바뀌면 이전 타이머는 취소되고 마지막 값으로만 호출된다", async () => {
    const onSearch = vi.fn();
    renderSearch({ onSearch });

    const input = screen.getByPlaceholderText("할 일 검색...");
    typeInto(input, "가");
    await vi.advanceTimersByTimeAsync(200);
    typeInto(input, "가나");
    await vi.advanceTimersByTimeAsync(200);

    // 두 번째 입력에서 타이머가 리셋됐으므로 이 시점엔 아직 호출되지 않는다.
    expect(onSearch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("가나");
  });

  it("입력값이 공백뿐이면 onSearch 대신 onClear가 즉시 호출된다", async () => {
    const onSearch = vi.fn();
    const onClear = vi.fn();
    renderSearch({ onSearch, onClear });

    typeInto(screen.getByPlaceholderText("할 일 검색..."), "   ");

    expect(onClear).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(onSearch).not.toHaveBeenCalled();
  });
});

describe("TodoSearch 초기값/지우기", () => {
  it("initialValue가 입력창 초기값이 된다", () => {
    renderSearch({ initialValue: "운동" });

    expect(
      (screen.getByPlaceholderText("할 일 검색...") as HTMLInputElement).value,
    ).toBe("운동");
  });

  it("입력값이 있으면 지우기 버튼이 나타나고, 클릭하면 입력값이 비워지며 onClear가 호출된다", async () => {
    const onClear = vi.fn();
    const { container } = renderSearch({ onClear });

    const input = screen.getByPlaceholderText(
      "할 일 검색...",
    ) as HTMLInputElement;
    typeInto(input, "검색어");
    await vi.advanceTimersByTimeAsync(300);
    onClear.mockClear();

    const clearButton = container.querySelector(".lucide-x")!.closest("button")!;
    fireEvent.click(clearButton);

    expect(input.value).toBe("");
    expect(onClear).toHaveBeenCalled();
  });
});

describe("TodoSearch 검색 결과 정보", () => {
  it("isSearching이면 결과 개수와 검색 취소 버튼을 보여준다", () => {
    renderSearch({ isSearching: true, resultCount: 5, initialValue: "회의" });

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("검색 취소")).toBeInTheDocument();
  });

  it("검색 취소를 누르면 입력값이 비워지고 onClear가 호출된다", async () => {
    const onClear = vi.fn();
    renderSearch({ isSearching: true, onClear });

    const input = screen.getByPlaceholderText(
      "할 일 검색...",
    ) as HTMLInputElement;
    typeInto(input, "검색어");
    await vi.advanceTimersByTimeAsync(300);
    onClear.mockClear();

    fireEvent.click(screen.getByText("검색 취소"));

    expect(input.value).toBe("");
    expect(onClear).toHaveBeenCalled();
  });
});

describe("TodoSearch 필터 전체 해제(onReset)", () => {
  it("입력이 비어 있고 칩만 켜져 있으면 버튼 이름이 '필터 해제'이고 누르면 onReset을 부른다", () => {
    const onReset = vi.fn();
    renderSearch({ isSearching: true, onReset });

    expect(screen.queryByRole("button", { name: "검색 취소" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 해제" }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("입력이 있으면 '검색 취소'이고, 누르면 입력을 비우고 onReset도 부른다", () => {
    const onReset = vi.fn();
    renderSearch({ isSearching: true, onReset, initialValue: "회의" });
    const input = screen.getByPlaceholderText("할 일 검색...") as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "검색 취소" }));

    expect(input.value).toBe("");
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
