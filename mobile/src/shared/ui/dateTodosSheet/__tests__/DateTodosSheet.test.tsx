import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import type { Todo } from "@tododo/core";

const baseTodo: Todo = {
  id: "a",
  userId: "u1",
  title: "할 일 A",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("DateTodosSheet", () => {
  it("항목이 없으면 빈 상태와 할 일 추가 버튼을 보여준다", async () => {
    const onAddTodo = jest.fn();
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        selectedDate="2026-06-20"
        todos={[]}
        onToggleDone={jest.fn()}
        onPressTodo={jest.fn()}
        onAddTodo={onAddTodo}
      />,
    );

    // RN Modal jest mock 특성상 visible=true 초기 렌더도 한 틱 뒤에 반영된다.
    await waitFor(() => {
      expect(screen.getByText("6월 20일, 토요일")).toBeTruthy();
    });
    expect(screen.getByText("이 날짜엔 할 일이 없어요")).toBeTruthy();

    fireEvent.press(screen.getByText("할 일 추가"));
    expect(onAddTodo).toHaveBeenCalled();
  });

  it("항목이 있으면 목록을 보여주고, 항목을 누르면 onPressTodo를 호출한다", async () => {
    const onPressTodo = jest.fn();
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        selectedDate="2026-06-20"
        todos={[baseTodo]}
        onToggleDone={jest.fn()}
        onPressTodo={onPressTodo}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("할 일 A")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("할 일 A"));
    expect(onPressTodo).toHaveBeenCalledWith(baseTodo);
  });

  it("체크박스를 누르면 onToggleDone을 호출한다", async () => {
    const onToggleDone = jest.fn();
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        selectedDate="2026-06-20"
        todos={[baseTodo]}
        onToggleDone={onToggleDone}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("할 일 A 완료 처리")).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText("할 일 A 완료 처리"));
    expect(onToggleDone).toHaveBeenCalledWith(baseTodo);
  });

  it("항목이 있어도 하단 '할 일 추가' 버튼을 보여준다", async () => {
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        selectedDate="2026-06-20"
        todos={[baseTodo]}
        onToggleDone={jest.fn()}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("할 일 추가")).toBeTruthy();
    });
  });
});
