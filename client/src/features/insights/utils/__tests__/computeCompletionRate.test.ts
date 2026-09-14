import { describe, it, expect } from "vitest";
import type { Todo } from "@/features/todo";
import { computeCompletionRate } from "../computeCompletionRate";

const baseTodo = (overrides: Partial<Todo>): Todo => ({
  id: "todo-1",
  userId: "user-1",
  title: "제목",
  status: "todo",
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

describe("computeCompletionRate", () => {
  it("days를 생략하면 전체 todos를 스코프로 잡는다", () => {
    const todos = [
      baseTodo({ id: "1", status: "done" }),
      baseTodo({ id: "2", status: "todo" }),
      baseTodo({ id: "3", status: "todo" }),
    ];

    expect(computeCompletionRate(todos)).toEqual({ completed: 1, total: 3, rate: 1 / 3 });
  });

  it("dueAt이 최근 days일 안이면 스코프에 포함한다", () => {
    const now = new Date(2026, 8, 14); // 로컬 9/14
    const todos = [
      baseTodo({ id: "in-range", status: "done", dueAt: "2026-09-10T12:00:00.000Z" }),
      baseTodo({ id: "out-of-range", status: "done", dueAt: "2026-08-01T12:00:00.000Z" }),
    ];

    expect(computeCompletionRate(todos, { days: 7, now })).toEqual({
      completed: 1,
      total: 1,
      rate: 1,
    });
  });

  it("dueAt이 없으면 doneAt으로 기간을 판단한다", () => {
    const now = new Date(2026, 8, 14);
    const todos = [
      baseTodo({ id: "1", status: "done", dueAt: null, doneAt: "2026-09-12T12:00:00.000Z" }),
    ];

    expect(computeCompletionRate(todos, { days: 7, now })).toEqual({
      completed: 1,
      total: 1,
      rate: 1,
    });
  });

  it("dueAt과 doneAt이 모두 없으면 기간 스코프에서 제외한다", () => {
    const now = new Date(2026, 8, 14);
    const todos = [baseTodo({ id: "1", status: "todo", dueAt: null, doneAt: null })];

    expect(computeCompletionRate(todos, { days: 7, now })).toEqual({
      completed: 0,
      total: 0,
      rate: 0,
    });
  });

  it("total이 0이면 rate는 0이다 (0으로 나누기 방지)", () => {
    expect(computeCompletionRate([])).toEqual({ completed: 0, total: 0, rate: 0 });
  });
});
