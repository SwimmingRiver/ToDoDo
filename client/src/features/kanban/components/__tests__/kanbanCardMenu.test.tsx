import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KanbanCardMenu from "../kanbanCardMenu";

describe("KanbanCardMenu 컴포넌트", () => {
  it("버튼 클릭 시 상태 변경 바텀시트가 열려야 한다", async () => {
    const user = userEvent.setup();
    render(<KanbanCardMenu status="todo" onSelect={vi.fn()} />);

    await user.click(screen.getByLabelText("상태 변경 메뉴 열기"));

    expect(screen.getByText("상태 변경")).toBeInTheDocument();
  });

  it("현재 상태(todo)는 선택지에서 제외되고 나머지 상태만 노출되어야 한다", async () => {
    const user = userEvent.setup();
    render(<KanbanCardMenu status="todo" onSelect={vi.fn()} />);

    await user.click(screen.getByLabelText("상태 변경 메뉴 열기"));

    expect(screen.queryByText("할 일")).not.toBeInTheDocument();
    expect(screen.getByText("진행 중")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
  });

  it("상태 선택 시 onSelect가 선택한 값과 함께 호출되어야 한다", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<KanbanCardMenu status="doing" onSelect={onSelect} />);

    await user.click(screen.getByLabelText("상태 변경 메뉴 열기"));
    await user.click(screen.getByText("완료"));

    expect(onSelect).toHaveBeenCalledWith("done");
  });

  it("버튼 클릭 이벤트는 상위 요소로 전파되지 않아야 한다 (카드 네비게이션과 충돌 방지)", async () => {
    const onCardClick = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={onCardClick}>
        <KanbanCardMenu status="todo" onSelect={vi.fn()} />
      </div>,
    );

    await user.click(screen.getByLabelText("상태 변경 메뉴 열기"));

    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("백드롭(오버레이) 클릭 시 카드의 onClick(네비게이션)이 발동하지 않아야 한다", async () => {
    // BottomSheet는 createPortal로 document.body에 렌더링되지만 React 포털은
    // DOM 트리가 아닌 React 컴포넌트 트리로 이벤트가 버블링된다. 배경(overlay)을
    // 탭해서 시트를 닫을 때 클릭 이벤트가 상위 카드의 onClick(상세 페이지 이동)까지
    // 전파되면 안 된다.
    const onCardClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <div onClick={onCardClick}>
        <KanbanCardMenu status="todo" onSelect={vi.fn()} />
      </div>,
    );

    await user.click(screen.getByLabelText("상태 변경 메뉴 열기"));
    expect(screen.getByText("상태 변경")).toBeInTheDocument();

    // 포털로 document.body에 직접 추가된 오버레이 엘리먼트를 찾는다
    // (RTL이 렌더링에 사용한 container와는 다른 body의 자식 노드).
    const overlay = Array.from(document.body.children).find(
      (el) => el !== container,
    ) as HTMLElement | undefined;
    expect(overlay).toBeTruthy();

    await user.click(overlay!);

    expect(onCardClick).not.toHaveBeenCalled();
  });
});
