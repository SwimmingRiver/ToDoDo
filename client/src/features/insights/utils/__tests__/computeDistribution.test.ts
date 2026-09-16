import { describe, it, expect } from "vitest";
import type { Todo } from "@/features/todo";
import {
  computePriorityDistribution,
  computeRecurringVsOneOffRate,
  computeDueAdherence,
} from "../computeDistribution";

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

describe("computePriorityDistribution", () => {
  it("완료된 항목만 우선순위별로 센다", () => {
    const todos = [
      baseTodo({ id: "1", status: "done", priority: "high" }),
      baseTodo({ id: "2", status: "done", priority: "high" }),
      baseTodo({ id: "3", status: "done", priority: "medium" }),
      baseTodo({ id: "4", status: "todo", priority: "low" }), // 미완료라 제외
    ];

    expect(computePriorityDistribution(todos)).toEqual({ low: 0, medium: 1, high: 2 });
  });
});

describe("computeRecurringVsOneOffRate", () => {
  it("반복 투두와 일반 투두를 나눠서 완료율을 각각 계산한다", () => {
    const recurrenceRule = { type: "daily" as const, endType: "indefinite" as const };
    const todos = [
      baseTodo({ id: "1", status: "done", recurrence: recurrenceRule }),
      baseTodo({ id: "2", status: "todo", recurrence: recurrenceRule }),
      baseTodo({ id: "3", status: "done", recurrence: null }),
    ];

    expect(computeRecurringVsOneOffRate(todos)).toEqual({
      recurring: { completed: 1, total: 2, rate: 0.5 },
      oneOff: { completed: 1, total: 1, rate: 1 },
    });
  });

  it("recurrence 필드 자체가 없는(undefined) 레거시 문서는 일반 투두로 분류한다", () => {
    const legacyTodo = baseTodo({ id: "legacy", status: "done" });
    // @ts-expect-error 레거시 문서에는 필드 자체가 없을 수 있음을 재현
    delete legacyTodo.recurrence;

    expect(computeRecurringVsOneOffRate([legacyTodo])).toEqual({
      recurring: { completed: 0, total: 0, rate: 0 },
      oneOff: { completed: 1, total: 1, rate: 1 },
    });
  });
});

describe("computeDueAdherence", () => {
  it("마감 이내에 끝낸 완료 항목의 비율을 계산한다", () => {
    const todos = [
      baseTodo({
        id: "on-time",
        status: "done",
        dueAt: "2026-09-10T12:00:00.000Z",
        doneAt: "2026-09-09T12:00:00.000Z",
      }),
      baseTodo({
        id: "late",
        status: "done",
        dueAt: "2026-09-10T12:00:00.000Z",
        doneAt: "2026-09-11T12:00:00.000Z",
      }),
    ];

    expect(computeDueAdherence(todos)).toEqual({ completed: 1, total: 2, rate: 0.5 });
  });

  it("dueAt이 없는 완료 항목은 분모에서 제외한다", () => {
    const todos = [
      baseTodo({ id: "no-due", status: "done", dueAt: null, doneAt: "2026-09-09T12:00:00.000Z" }),
    ];

    expect(computeDueAdherence(todos)).toEqual({ completed: 0, total: 0, rate: 0 });
  });
});
