import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo";
import {
  DEFAULT_INSIGHTS_FILTER,
  resolvePeriodRange,
  isKeyInRange,
  scopeTodosByProject,
  scopeTodosByRange,
} from "../filter";

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
  ...overrides,
});

describe("resolvePeriodRange", () => {
  // 2026-09-16은 수요일(getDay() === 3)
  const now = new Date(2026, 8, 16, 15);

  it("thisWeek는 이번 주 일요일부터 오늘까지다", () => {
    expect(resolvePeriodRange("thisWeek", now)).toEqual({ startKey: "2026-09-13", endKey: "2026-09-16" });
  });

  it("오늘이 일요일이면 thisWeek는 오늘 하루다", () => {
    const sunday = new Date(2026, 8, 13, 9);
    expect(resolvePeriodRange("thisWeek", sunday)).toEqual({ startKey: "2026-09-13", endKey: "2026-09-13" });
  });

  it("thisMonth는 1일부터 오늘까지다", () => {
    expect(resolvePeriodRange("thisMonth", now)).toEqual({ startKey: "2026-09-01", endKey: "2026-09-16" });
  });

  it("last90Days는 오늘 포함 90일이다", () => {
    expect(resolvePeriodRange("last90Days", now)).toEqual({ startKey: "2026-06-19", endKey: "2026-09-16" });
  });

  it("all은 null이다", () => {
    expect(resolvePeriodRange("all", now)).toBeNull();
  });
});

describe("isKeyInRange", () => {
  const range = { startKey: "2026-09-01", endKey: "2026-09-16" };

  it("양끝을 포함한다", () => {
    expect(isKeyInRange("2026-09-01", range)).toBe(true);
    expect(isKeyInRange("2026-09-16", range)).toBe(true);
    expect(isKeyInRange("2026-08-31", range)).toBe(false);
    expect(isKeyInRange("2026-09-17", range)).toBe(false);
  });

  it("range가 null이면 항상 true", () => {
    expect(isKeyInRange("1999-01-01", null)).toBe(true);
  });
});

describe("scopeTodosByProject", () => {
  const root = makeTodo({ id: "root" });
  const child = makeTodo({ id: "child", parentId: "root" });
  const other = makeTodo({ id: "other" });
  const otherChild = makeTodo({ id: "other-child", parentId: "other" });
  const todos = [root, child, other, otherChild];

  it("projectId가 null이면 전체를 돌려준다", () => {
    expect(scopeTodosByProject(todos, null)).toBe(todos);
  });

  it("루트 자신과 그 자식만 남긴다", () => {
    expect(scopeTodosByProject(todos, "root").map((t) => t.id)).toEqual(["root", "child"]);
  });

  it("자식이 없는 루트면 루트 하나만 남는다", () => {
    expect(scopeTodosByProject([root, other], "root").map((t) => t.id)).toEqual(["root"]);
  });
});

describe("scopeTodosByRange", () => {
  const range = { startKey: "2026-09-10", endKey: "2026-09-16" };

  it("range가 null이면 전체를 돌려준다(날짜 없는 항목 포함)", () => {
    const todos = [makeTodo({ id: "a" })];
    expect(scopeTodosByRange(todos, null)).toBe(todos);
  });

  it("dueAt이 기간 안이면 포함, 밖이면 제외한다", () => {
    const todos = [
      makeTodo({ id: "in", dueAt: "2026-09-12T12:00:00.000Z" }),
      makeTodo({ id: "out", dueAt: "2026-09-01T12:00:00.000Z" }),
    ];
    expect(scopeTodosByRange(todos, range).map((t) => t.id)).toEqual(["in"]);
  });

  it("dueAt이 없으면 doneAt으로 판단한다", () => {
    const todos = [makeTodo({ id: "done", status: "done", doneAt: "2026-09-12T12:00:00.000Z" })];
    expect(scopeTodosByRange(todos, range).map((t) => t.id)).toEqual(["done"]);
  });

  it("dueAt/doneAt 둘 다 없으면 제외한다", () => {
    expect(scopeTodosByRange([makeTodo({ id: "none" })], range)).toEqual([]);
  });
});

describe("DEFAULT_INSIGHTS_FILTER", () => {
  it("이번 달 + 전체 프로젝트다", () => {
    expect(DEFAULT_INSIGHTS_FILTER).toEqual({ period: "thisMonth", projectId: null });
  });
});
