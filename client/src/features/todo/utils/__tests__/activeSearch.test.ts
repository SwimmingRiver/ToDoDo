import { describe, it, expect } from "vitest";
import { EMPTY_TODO_FILTER } from "@tododo/core/dist/todoFilter/index.js";
import { buildActiveSearchResult } from "../activeSearch";
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

// 날짜는 로컬 생성자로 만든다(UTC 리터럴 픽스처 금지)
const localIso = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 9, 0, 0).toISOString();

describe("buildActiveSearchResult", () => {
  it("하위만 걸리면 부모 카드 1건이 나오고 부모가 자동 펼침 대상이 된다", () => {
    const todos = [
      makeTodo({ id: "p", title: "이사 준비" }),
      makeTodo({ id: "c1", title: "짐 싸기", parentId: "p" }),
      makeTodo({ id: "c2", title: "전입 신고", parentId: "p" }),
    ];
    const result = buildActiveSearchResult(todos, { query: "전입", priorities: [] });

    expect(result.roots.map((t) => t.id)).toEqual(["p"]);
    expect([...result.autoExpandIds]).toEqual(["p"]);
    expect([...result.matchedChildIds]).toEqual(["c2"]);
  });

  it("부모와 하위가 모두 걸려도 부모 카드 1건만 나오고 자동 펼침하지 않는다", () => {
    const todos = [
      makeTodo({ id: "p", title: "보고서 작성" }),
      makeTodo({ id: "c1", title: "보고서 초안", parentId: "p" }),
    ];
    const result = buildActiveSearchResult(todos, { query: "보고서", priorities: [] });

    expect(result.roots.map((t) => t.id)).toEqual(["p"]);
    expect(result.autoExpandIds.size).toBe(0);
    expect(result.matchedChildIds.has("c1")).toBe(true);
  });

  it("설명에만 검색어가 있어도 걸리고, 우선순위 칩도 함께 적용된다", () => {
    const todos = [
      makeTodo({ id: "a", title: "A", description: "영수증 정리", priority: "high" }),
      makeTodo({ id: "b", title: "B", description: "영수증 확인", priority: "low" }),
    ];
    const result = buildActiveSearchResult(todos, { query: "영수증", priorities: ["high"] });
    expect(result.roots.map((t) => t.id)).toEqual(["a"]);
  });

  it("반복 시리즈 회차 3건이 모두 걸려도 카드는 1건이다", () => {
    const todos = [
      makeTodo({ id: "r1", title: "운동", recurrenceId: "s", dueAt: localIso(2026, 11, 28) }),
      makeTodo({ id: "r2", title: "운동", recurrenceId: "s", dueAt: localIso(2026, 11, 29) }),
      makeTodo({ id: "r3", title: "운동", recurrenceId: "s", dueAt: localIso(2026, 11, 30) }),
    ];
    const result = buildActiveSearchResult(todos, { query: "운동", priorities: [] });
    expect(result.roots.map((t) => t.id)).toEqual(["r1"]);
  });

  it("대표 회차는 안 걸려도 다른 회차가 걸리면 시리즈 카드(대표)를 낸다", () => {
    // "이 일정과 이후 일정"으로 앞으로의 회차만 이름을 바꾼 경우: 대표(가장 이른 마감)는 옛 이름
    const todos = [
      makeTodo({ id: "r1", title: "Gym", recurrenceId: "s", dueAt: localIso(2026, 11, 27) }),
      makeTodo({ id: "r2", title: "Workout", recurrenceId: "s", dueAt: localIso(2026, 11, 29) }),
      makeTodo({ id: "r3", title: "Workout", recurrenceId: "s", dueAt: localIso(2026, 11, 30) }),
    ];
    const result = buildActiveSearchResult(todos, { query: "Workout", priorities: [] });
    expect(result.roots.map((t) => t.id)).toEqual(["r1"]);
    expect(result.autoExpandIds.size).toBe(0);
  });

  it("보관된(overdueArchived) 회차만 걸리면 시리즈 카드를 내지 않는다", () => {
    const todos = [
      makeTodo({ id: "old", title: "Workout", recurrenceId: "s", overdueArchived: true, dueAt: localIso(2026, 11, 20) }),
      makeTodo({ id: "r1", title: "Gym", recurrenceId: "s", dueAt: localIso(2026, 11, 28) }),
    ];
    const result = buildActiveSearchResult(todos, { query: "Workout", priorities: [] });
    expect(result.roots).toHaveLength(0);
  });

  it("완료된 루트는 걸려도 제외된다", () => {
    const todos = [
      makeTodo({ id: "done", title: "회의", status: "done" }),
      makeTodo({ id: "open", title: "회의록" }),
    ];
    const result = buildActiveSearchResult(todos, { query: "회의", priorities: [] });
    expect(result.roots.map((t) => t.id)).toEqual(["open"]);
  });

  it("완료된 루트의 하위가 걸려도 그 루트는 나오지 않는다", () => {
    const todos = [
      makeTodo({ id: "done", title: "끝난 일", status: "done" }),
      makeTodo({ id: "c", title: "회의", parentId: "done" }),
    ];
    const result = buildActiveSearchResult(todos, { query: "회의", priorities: [] });
    expect(result.roots).toHaveLength(0);
    expect(result.autoExpandIds.size).toBe(0);
  });

  it("필터가 꺼지면 지금 목록(루트·미완료·반복 축약)과 같은 id 순서이고 Set은 비어 있다", () => {
    const todos = [
      makeTodo({ id: "a", order: 0 }),
      makeTodo({ id: "c", parentId: "a" }),
      makeTodo({ id: "d", status: "done", order: 1 }),
      makeTodo({ id: "r2", recurrenceId: "s", dueAt: localIso(2026, 12, 2), order: 2 }),
      makeTodo({ id: "b", order: 3 }),
      makeTodo({ id: "r1", recurrenceId: "s", dueAt: localIso(2026, 12, 1), order: 4 }),
    ];
    const expected = collapseRecurringInstances(
      todos.filter((t) => t.parentId === null && t.status !== "done"),
    ).map((t) => t.id);

    const result = buildActiveSearchResult(todos, EMPTY_TODO_FILTER);
    expect(result.roots.map((t) => t.id)).toEqual(expected);
    expect(result.roots.map((t) => t.id)).toEqual(["a", "b", "r1"]);
    expect(result.matchedChildIds.size).toBe(0);
    expect(result.autoExpandIds.size).toBe(0);
  });
});
