import { describe, it, expect } from "vitest";
import { collapseRecurringInstances } from "../projectUtils";
import type { Todo } from "../../types";

const makeTodo = (overrides: Partial<Todo>): Todo => ({
  id: "id",
  userId: "u1",
  title: "title",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "",
  updatedAt: "",
  recurrence: null,
  recurrenceId: null,
  ...overrides,
});

describe("collapseRecurringInstances", () => {
  it("반복 아닌 할 일은 그대로 통과시킨다", () => {
    const todos = [makeTodo({ id: "a" }), makeTodo({ id: "b" })];
    expect(collapseRecurringInstances(todos)).toHaveLength(2);
  });

  it("같은 recurrenceId를 가진 인스턴스 중 dueAt이 가장 이른 것 하나만 남긴다", () => {
    const todos = [
      makeTodo({ id: "future", recurrenceId: "series-1", dueAt: "2026-07-20T00:00:00.000Z" }),
      makeTodo({ id: "overdue", recurrenceId: "series-1", dueAt: "2026-07-01T00:00:00.000Z" }),
      makeTodo({ id: "nearer", recurrenceId: "series-1", dueAt: "2026-07-10T00:00:00.000Z" }),
    ];
    const result = collapseRecurringInstances(todos);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("overdue");
  });

  it("서로 다른 recurrenceId는 각각 대표 1건씩 남긴다", () => {
    const todos = [
      makeTodo({ id: "a1", recurrenceId: "series-a", dueAt: "2026-07-05T00:00:00.000Z" }),
      makeTodo({ id: "b1", recurrenceId: "series-b", dueAt: "2026-07-06T00:00:00.000Z" }),
      makeTodo({ id: "a2", recurrenceId: "series-a", dueAt: "2026-07-01T00:00:00.000Z" }),
    ];
    const result = collapseRecurringInstances(todos);
    expect(result.map((t) => t.id).sort()).toEqual(["a2", "b1"]);
  });
});
