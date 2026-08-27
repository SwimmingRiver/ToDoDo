import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Todo } from "@tododo/core";
import { TodayTodoItem } from "../TodayTodoItem";

const baseTodo: Todo = {
  id: "t1",
  userId: "u1",
  title: "테스트 할 일",
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

describe("TodayTodoItem", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // @testing-library/react-native@14의 render()는 async 함수다 — 반드시 await하고
  // it 콜백도 async여야 한다(await 없이 부르면 screen이 렌더 결과를 못 받은 상태).
  it("제목을 렌더링한다", async () => {
    await render(
      <TodayTodoItem todo={baseTodo} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={jest.fn()} />,
    );
    expect(screen.getByText("테스트 할 일")).toBeTruthy();
  });

  it("체크박스를 누르면 onToggleDone이 호출된다", async () => {
    const onToggleDone = jest.fn();
    await render(
      <TodayTodoItem todo={baseTodo} selectedDate="2026-06-15" onToggleDone={onToggleDone} onPress={jest.fn()} />,
    );
    fireEvent.press(screen.getByRole("checkbox"));
    expect(onToggleDone).toHaveBeenCalledWith(baseTodo);
  });

  it("본문(제목 영역)을 누르면 onPress가 호출된다", async () => {
    const onPress = jest.fn();
    await render(
      <TodayTodoItem todo={baseTodo} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={onPress} />,
    );
    fireEvent.press(screen.getByText("테스트 할 일"));
    expect(onPress).toHaveBeenCalledWith(baseTodo);
  });

  it("마감이 지났으면(danger) 초과 배지를 보여준다", async () => {
    const overdue = { ...baseTodo, dueAt: new Date(2026, 5, 10, 9).toISOString() };
    await render(
      <TodayTodoItem todo={overdue} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={jest.fn()} />,
    );
    expect(screen.getByText("5일 초과")).toBeTruthy();
  });

  it("기간(startAt~dueAt) 항목이면 진행 일차 배지를 보여준다", async () => {
    const periodTodo = {
      ...baseTodo,
      startAt: new Date(2026, 5, 14, 9).toISOString(),
      dueAt: new Date(2026, 5, 16, 9).toISOString(),
    };
    await render(
      <TodayTodoItem todo={periodTodo} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={jest.fn()} />,
    );
    expect(screen.getByText("2/3일차")).toBeTruthy();
  });

  it("완료된 항목은 체크박스가 checked 상태다", async () => {
    const done = { ...baseTodo, status: "done" as const, doneAt: "2026-06-15T00:00:00.000Z" };
    await render(
      <TodayTodoItem todo={done} selectedDate="2026-06-15" onToggleDone={jest.fn()} onPress={jest.fn()} />,
    );
    expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(true);
  });
});
