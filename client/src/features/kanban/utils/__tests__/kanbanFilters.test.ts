import { describe, it, expect } from "vitest";
import { isVisibleInKanban } from "../kanbanFilters";
import type { Todo } from "@/features/todo";

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "user-1",
  title: "테스트 할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

describe("isVisibleInKanban", () => {
  const today = new Date("2026-07-10T12:00:00");

  it("반복이 아닌 todo는 dueAt과 무관하게 항상 true를 반환한다 (기존 로직에 영향 없음)", () => {
    const futureTodo = makeTodo({
      recurrence: null,
      dueAt: "2026-12-31T00:00:00",
    });
    expect(isVisibleInKanban(futureTodo, today)).toBe(true);

    const noDueTodo = makeTodo({ recurrence: null, dueAt: null });
    expect(isVisibleInKanban(noDueTodo, today)).toBe(true);
  });

  it("반복 인스턴스이고 dueAt <= 오늘이면 true를 반환한다", () => {
    const todoOnToday = makeTodo({
      recurrence: { type: "daily", endType: "indefinite" },
      recurrenceId: "series-1",
      dueAt: "2026-07-10T09:00:00",
    });
    expect(isVisibleInKanban(todoOnToday, today)).toBe(true);

    const todoInPast = makeTodo({
      recurrence: { type: "daily", endType: "indefinite" },
      recurrenceId: "series-1",
      dueAt: "2026-07-01T09:00:00",
    });
    expect(isVisibleInKanban(todoInPast, today)).toBe(true);
  });

  it("반복 인스턴스이고 dueAt > 오늘이면 false를 반환한다", () => {
    const futureInstance = makeTodo({
      recurrence: { type: "daily", endType: "indefinite" },
      recurrenceId: "series-1",
      dueAt: "2026-07-11T09:00:00",
    });
    expect(isVisibleInKanban(futureInstance, today)).toBe(false);
  });
});
