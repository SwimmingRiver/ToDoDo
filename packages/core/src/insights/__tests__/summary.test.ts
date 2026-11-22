import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Todo } from "../../types/todo";
import { computeInsightsMetrics } from "../summary";
import {
  computeCompletionRate,
  computeStatusBreakdown,
  computeStreak,
  listProjectOptions,
} from "../metrics";
import { bucketCompletions, resolveTrendGranularity } from "../trend";
import { resolvePeriodRange, scopeTodosByProject } from "../filter";

const iso = (m: number, d: number, h = 12) => new Date(2026, m, d, h).toISOString();

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
  createdAt: iso(10, 1),
  updatedAt: iso(10, 1),
  recurrence: null,
  recurrenceId: null,
  ...overrides,
});

const NOW = new Date(2026, 10, 22, 12);

const todos: Todo[] = [
  makeTodo({ id: "root", title: "프로젝트", status: "doing", dueAt: iso(10, 25) }),
  makeTodo({ id: "c1", parentId: "root", status: "done", dueAt: iso(10, 20), doneAt: iso(10, 19) }),
  makeTodo({ id: "c2", parentId: "root", status: "done", dueAt: iso(10, 18), doneAt: iso(10, 21) }),
  makeTodo({ id: "c3", parentId: "root", status: "todo", dueAt: iso(10, 24) }),
  makeTodo({ id: "rec", status: "done", dueAt: iso(10, 22), doneAt: iso(10, 22), recurrenceId: "r1" }),
];

describe("computeInsightsMetrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("projectId null이면 statusBreakdown은 null, 나머지는 core 함수 결과와 같다", () => {
    const filter = { period: "thisMonth", projectId: null } as const;
    const result = computeInsightsMetrics(todos, filter, NOW);
    const range = resolvePeriodRange("thisMonth", NOW);
    const scoped = scopeTodosByProject(todos, null);

    expect(result.statusBreakdown).toBeNull();
    expect(result.completionRate).toEqual(computeCompletionRate(scoped, range));
    expect(result.streak).toEqual(computeStreak(todos, NOW));
    expect(result.trend).toEqual(bucketCompletions(scoped, range, resolveTrendGranularity("thisMonth"), NOW));
    expect(result.projects).toEqual(listProjectOptions(todos));
  });

  it("projectId가 있으면 statusBreakdown을 계산하고 streak은 필터와 무관하다", () => {
    const all = computeInsightsMetrics(todos, { period: "thisMonth", projectId: null }, NOW);
    const result = computeInsightsMetrics(todos, { period: "thisMonth", projectId: "root" }, NOW);
    const scoped = scopeTodosByProject(todos, "root");

    expect(result.statusBreakdown).toEqual(computeStatusBreakdown(scoped, "root"));
    expect(result.statusBreakdown).not.toBeNull();
    expect(result.streak).toBe(all.streak);
    expect(result.projects).toEqual(all.projects);
  });
});
