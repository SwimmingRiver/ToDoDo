import { describe, it, expect } from "vitest";
import type { Todo } from "@/features/todo";
import { computeCompletionTrend } from "../computeCompletionTrend";

const baseTodo = (overrides: Partial<Todo>): Todo => ({
  id: "todo-1",
  userId: "user-1",
  title: "제목",
  status: "done",
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
  startAt: null,
  dueAt: null,
  doneAt: null,
  priority: "medium",
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  archived: false,
  ...overrides,
});

describe("computeCompletionTrend", () => {
  it("now를 마지막 날로 포함해 days일치 일별 완료 개수를 반환한다", () => {
    const now = new Date(2026, 8, 14);
    const todos = [
      baseTodo({ id: "1", doneAt: "2026-09-14T12:00:00.000Z" }),
      baseTodo({ id: "2", doneAt: "2026-09-14T05:00:00.000Z" }),
      baseTodo({ id: "3", doneAt: "2026-09-12T12:00:00.000Z" }),
    ];

    const trend = computeCompletionTrend(todos, 3, now);

    expect(trend).toEqual([
      { date: "2026-09-12", count: 1 },
      { date: "2026-09-13", count: 0 },
      { date: "2026-09-14", count: 2 },
    ]);
  });

  it("완료되지 않았거나 doneAt이 없는 항목은 집계에서 제외한다", () => {
    const now = new Date(2026, 8, 14);
    const todos = [
      baseTodo({ id: "1", status: "todo", doneAt: null }),
      baseTodo({ id: "2", status: "done", doneAt: null }),
    ];

    const trend = computeCompletionTrend(todos, 1, now);

    expect(trend).toEqual([{ date: "2026-09-14", count: 0 }]);
  });
});
