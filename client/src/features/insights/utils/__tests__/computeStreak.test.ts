import { describe, it, expect } from "vitest";
import type { Todo } from "@/features/todo";
import { computeStreak } from "../computeStreak";

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

describe("computeStreak", () => {
  it("오늘까지 3일 연속 완료했으면 3을 반환한다", () => {
    const now = new Date(2026, 8, 14); // 9/14 (로컬)
    const todos = [
      baseTodo({ id: "1", doneAt: "2026-09-14T12:00:00.000Z" }),
      baseTodo({ id: "2", doneAt: "2026-09-13T12:00:00.000Z" }),
      baseTodo({ id: "3", doneAt: "2026-09-12T12:00:00.000Z" }),
      baseTodo({ id: "4", doneAt: "2026-09-05T12:00:00.000Z" }), // 끊긴 이후 과거 기록
    ];

    expect(computeStreak(todos, now)).toBe(3);
  });

  it("오늘 완료가 없어도 어제까지 이어진 스트릭은 0으로 끊지 않는다", () => {
    const now = new Date(2026, 8, 14);
    const todos = [
      baseTodo({ id: "1", doneAt: "2026-09-13T12:00:00.000Z" }),
      baseTodo({ id: "2", doneAt: "2026-09-12T12:00:00.000Z" }),
    ];

    expect(computeStreak(todos, now)).toBe(2);
  });

  it("어제도 완료가 없으면 스트릭은 0이다", () => {
    const now = new Date(2026, 8, 14);
    const todos = [baseTodo({ id: "1", doneAt: "2026-09-10T12:00:00.000Z" })];

    expect(computeStreak(todos, now)).toBe(0);
  });

  it("완료 항목이 없으면 0을 반환한다", () => {
    expect(computeStreak([], new Date(2026, 8, 14))).toBe(0);
  });

  it("status가 done이 아니면(doneAt이 남아있어도) 스트릭에 포함하지 않는다", () => {
    const now = new Date(2026, 8, 14);
    const todos = [baseTodo({ id: "1", status: "todo", doneAt: "2026-09-14T12:00:00.000Z" })];

    expect(computeStreak(todos, now)).toBe(0);
  });
});
