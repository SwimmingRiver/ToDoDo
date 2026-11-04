import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import type { Todo } from "@tododo/core";
import { colors } from "../../../../theme/colors";
import { statusColors } from "../../../../theme/statusColors";

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
        todos={[]}
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
        todos={[baseTodo]}
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

  it("체크박스 없이 상태·시작·마감을 한 줄로 보여준다", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 20, 12, 0));
    const todo: Todo = {
      ...baseTodo,
      status: "doing",
      startAt: new Date(2026, 5, 18, 9, 0).toISOString(),
      dueAt: new Date(2026, 5, 22, 18, 0).toISOString(),
    };
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[todo]}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("진행 중 · 시작: 6월 18일 · 마감: 6월 22일")).toBeTruthy();
    });
    expect(screen.queryByLabelText("할 일 A 완료 처리")).toBeNull();
    expect(screen.getByTestId("date-todo-a")).toHaveStyle({ borderLeftColor: statusColors.doing.main });
    jest.useRealTimers();
  });

  it("반복 할 일이면 반복 요약을 보여준다", async () => {
    const todo: Todo = {
      ...baseTodo,
      recurrenceId: "r1",
      recurrence: { type: "weekly", weekdays: [1, 3], endType: "indefinite" },
    };
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[todo]}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("매주 월・수 반복")).toBeTruthy();
    });
  });

  it("기한이 지난 미완료 항목은 위험 색 보더와 배경으로 표시한다", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 25, 12, 0));
    const todo: Todo = { ...baseTodo, dueAt: new Date(2026, 5, 20, 18, 0).toISOString() };
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[todo]}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("date-todo-a")).toHaveStyle({
        borderLeftColor: colors.danger.main,
        backgroundColor: colors.danger.background,
      });
    });
    jest.useRealTimers();
  });

  it("항목이 있어도 하단 '할 일 추가' 버튼을 보여준다", async () => {
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[baseTodo]}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("할 일 추가")).toBeTruthy();
    });
  });
});
