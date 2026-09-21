import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo";
import {
  computeCompletionRate,
  computeStreak,
  computePriorityDistribution,
  computeRecurringVsOneOffRate,
  computeDueAdherence,
  computeStatusBreakdown,
  listProjectOptions,
} from "../metrics";

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "u1",
  title: "할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
  recurrence: null,
  recurrenceId: null,
  ...overrides,
});

const range = { startKey: "2026-09-10", endKey: "2026-09-16" };

describe("computeCompletionRate", () => {
  it("range가 null이면 전체 todos를 스코프로 잡는다", () => {
    const todos = [
      makeTodo({ id: "1", status: "done" }),
      makeTodo({ id: "2" }),
      makeTodo({ id: "3" }),
    ];
    expect(computeCompletionRate(todos, null)).toEqual({ completed: 1, total: 3, rate: 1 / 3 });
  });

  it("dueAt이 범위 안인 항목만 센다", () => {
    const todos = [
      makeTodo({ id: "in", status: "done", dueAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "out", status: "done", dueAt: "2026-08-01T12:00:00.000Z" }),
    ];
    expect(computeCompletionRate(todos, range)).toEqual({ completed: 1, total: 1, rate: 1 });
  });

  it("total이 0이면 rate는 0이다", () => {
    expect(computeCompletionRate([], range)).toEqual({ completed: 0, total: 0, rate: 0 });
  });
});

describe("computeStreak", () => {
  const now = new Date(2026, 8, 16, 15);
  const doneOn = (id: string, key: string) =>
    makeTodo({ id, status: "done", doneAt: `${key}T12:00:00.000Z` });

  it("오늘부터 거꾸로 연속 완료일을 센다", () => {
    const todos = [doneOn("1", "2026-09-16"), doneOn("2", "2026-09-15"), doneOn("3", "2026-09-13")];
    expect(computeStreak(todos, now)).toBe(2);
  });

  it("오늘 완료가 없어도 어제까지의 스트릭은 유지한다", () => {
    const todos = [doneOn("1", "2026-09-15"), doneOn("2", "2026-09-14")];
    expect(computeStreak(todos, now)).toBe(2);
  });

  it("오늘도 어제도 없으면 0이다", () => {
    expect(computeStreak([doneOn("1", "2026-09-10")], now)).toBe(0);
  });
});

describe("computePriorityDistribution", () => {
  it("범위 안 완료 항목만 우선순위별로 센다", () => {
    const todos = [
      makeTodo({ id: "1", status: "done", priority: "high", doneAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "2", status: "done", priority: "high", doneAt: "2026-08-12T12:00:00.000Z" }),
      makeTodo({ id: "3", status: "todo", priority: "low", dueAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "4", status: "done", priority: "low", doneAt: "2026-09-11T12:00:00.000Z" }),
    ];
    expect(computePriorityDistribution(todos, range)).toEqual({ low: 1, medium: 0, high: 1 });
  });
});

describe("computeRecurringVsOneOffRate", () => {
  it("반복/단발을 나눠 범위 안 완료율을 낸다. recurrence undefined는 단발로 본다", () => {
    const todos = [
      makeTodo({
        id: "r1",
        status: "done",
        dueAt: "2026-09-12T12:00:00.000Z",
        recurrence: { type: "daily", endType: "indefinite" },
      }),
      makeTodo({ id: "o1", status: "todo", dueAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "o2", status: "done", dueAt: "2026-09-12T12:00:00.000Z", recurrence: undefined }),
    ];
    expect(computeRecurringVsOneOffRate(todos, range)).toEqual({
      recurring: { completed: 1, total: 1, rate: 1 },
      oneOff: { completed: 1, total: 2, rate: 0.5 },
    });
  });
});

describe("computeDueAdherence", () => {
  it("dueAt·doneAt이 모두 있는 범위 안 완료 항목 중 제때 끝낸 비율", () => {
    const todos = [
      makeTodo({ id: "on", status: "done", dueAt: "2026-09-12T12:00:00.000Z", doneAt: "2026-09-12T10:00:00.000Z" }),
      makeTodo({ id: "late", status: "done", dueAt: "2026-09-12T12:00:00.000Z", doneAt: "2026-09-12T13:00:00.000Z" }),
      makeTodo({ id: "no-due", status: "done", dueAt: null, doneAt: "2026-09-12T13:00:00.000Z" }),
    ];
    expect(computeDueAdherence(todos, range)).toEqual({ completed: 1, total: 2, rate: 0.5 });
  });
});

describe("computeStatusBreakdown", () => {
  it("루트는 제외하고 자식만 상태별로 센다", () => {
    const scoped = [
      makeTodo({ id: "root", status: "doing" }),
      makeTodo({ id: "c1", parentId: "root", status: "todo" }),
      makeTodo({ id: "c2", parentId: "root", status: "doing" }),
      makeTodo({ id: "c3", parentId: "root", status: "done" }),
      makeTodo({ id: "c4", parentId: "root", status: "done" }),
    ];
    expect(computeStatusBreakdown(scoped, "root")).toEqual({ todo: 1, doing: 1, done: 2 });
  });

  it("자식이 없으면 루트 자신 1건으로 센다", () => {
    expect(computeStatusBreakdown([makeTodo({ id: "root", status: "done" })], "root")).toEqual({
      todo: 0,
      doing: 0,
      done: 1,
    });
  });
});

describe("listProjectOptions", () => {
  it("루트만, 진행 중 먼저 → 완료 순, 각 그룹은 updatedAt 내림차순", () => {
    const todos = [
      makeTodo({ id: "done-old", status: "done", title: "완료 오래됨", updatedAt: "2026-07-01T00:00:00.000Z" }),
      makeTodo({ id: "child", parentId: "active-new", title: "자식" }),
      makeTodo({ id: "active-old", status: "todo", title: "진행 오래됨", updatedAt: "2026-08-01T00:00:00.000Z" }),
      makeTodo({ id: "done-new", status: "done", title: "완료 최근", updatedAt: "2026-09-01T00:00:00.000Z" }),
      makeTodo({ id: "active-new", status: "doing", title: "진행 최근", updatedAt: "2026-09-10T00:00:00.000Z" }),
    ];
    expect(listProjectOptions(todos)).toEqual([
      { id: "active-new", title: "진행 최근", isDone: false },
      { id: "active-old", title: "진행 오래됨", isDone: false },
      { id: "done-new", title: "완료 최근", isDone: true },
      { id: "done-old", title: "완료 오래됨", isDone: true },
    ]);
  });
});
