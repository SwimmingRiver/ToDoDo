import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Todo } from "@tododo/core";
import {
  collapseRecurringInstances,
  getProjectOverdue,
  getRecurringMissedCount,
} from "../projectUtils";

// client/src/features/todo/utils/__tests__/projectUtils.test.ts +
// __tests__/collapseRecurringInstances.test.ts의 핵심 케이스를 그대로 포팅.
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
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

// 절대 날짜 하드코딩 대신, 고정된 시스템 시간(ANCHOR) 기준 상대 offset으로 dueAt을 만든다.
const ANCHOR = new Date("2026-06-14T09:00:00.000Z");

const daysFromAnchor = (offsetDays: number): string => {
  const d = new Date(ANCHOR);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};

describe("getProjectOverdue", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(ANCHOR);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("하위 투두가 없고 루트 자신의 dueAt이 과거이면 초과로 판정해야 한다", () => {
    const project = makeTodo({ id: "project-1", status: "todo", dueAt: daysFromAnchor(-3) });

    const result = getProjectOverdue([project], project);

    expect(result).toEqual({ isOverdue: true, daysOver: 3 });
  });

  it("하위 투두가 없고 루트 자신의 dueAt이 미래이면 초과가 아니어야 한다", () => {
    const project = makeTodo({ id: "project-1", status: "todo", dueAt: daysFromAnchor(2) });

    const result = getProjectOverdue([project], project);

    expect(result).toEqual({ isOverdue: false, daysOver: 0 });
  });

  it("루트와 하위 투두 모두 아직 초과되지 않았으면 초과가 아니어야 한다", () => {
    const project = makeTodo({ id: "project-1", status: "todo", dueAt: daysFromAnchor(1) });
    const subtask = makeTodo({
      id: "sub-1",
      parentId: "project-1",
      status: "todo",
      dueAt: daysFromAnchor(2),
    });

    const result = getProjectOverdue([project, subtask], project);

    expect(result).toEqual({ isOverdue: false, daysOver: 0 });
  });

  it("루트는 초과되지 않았지만 하위 투두가 초과됐으면 하위 기준으로 초과 판정해야 한다 (기존 동작 유지)", () => {
    const project = makeTodo({ id: "project-1", status: "todo", dueAt: daysFromAnchor(5) });
    const subtask = makeTodo({
      id: "sub-1",
      parentId: "project-1",
      status: "todo",
      dueAt: daysFromAnchor(-4),
    });

    const result = getProjectOverdue([project, subtask], project);

    expect(result).toEqual({ isOverdue: true, daysOver: 4 });
  });

  it("루트와 하위 투두 모두 초과됐으면 가장 오래 초과된 것(daysOver 최대) 기준으로 계산해야 한다", () => {
    const project = makeTodo({ id: "project-1", status: "todo", dueAt: daysFromAnchor(-2) });
    const olderSubtask = makeTodo({
      id: "sub-1",
      parentId: "project-1",
      status: "todo",
      dueAt: daysFromAnchor(-10),
    });
    const newerSubtask = makeTodo({
      id: "sub-2",
      parentId: "project-1",
      status: "todo",
      dueAt: daysFromAnchor(-1),
    });

    const result = getProjectOverdue([project, olderSubtask, newerSubtask], project);

    expect(result).toEqual({ isOverdue: true, daysOver: 10 });
  });

  it("루트 자신의 dueAt이 과거여도 status가 done이면 초과가 아니어야 한다", () => {
    const project = makeTodo({ id: "project-1", status: "done", dueAt: daysFromAnchor(-3) });

    const result = getProjectOverdue([project], project);

    expect(result).toEqual({ isOverdue: false, daysOver: 0 });
  });

  it("루트 dueAt이 null이고 하위 투두도 없으면 초과가 아니어야 한다", () => {
    const project = makeTodo({ id: "project-1", status: "todo", dueAt: null });

    const result = getProjectOverdue([project], project);

    expect(result).toEqual({ isOverdue: false, daysOver: 0 });
  });
});

describe("getRecurringMissedCount", () => {
  it("recurrenceId가 없는(반복 아닌) 할 일이면 0을 반환해야 한다", () => {
    const todo = makeTodo({ id: "todo-1", recurrenceId: null });

    expect(getRecurringMissedCount([todo], todo)).toBe(0);
  });

  it("같은 recurrenceId를 가진 형제 중 overdueArchived === true인 것만 센다", () => {
    const representative = makeTodo({ id: "rep", recurrenceId: "series-1" });
    const missed1 = makeTodo({ id: "missed-1", recurrenceId: "series-1", overdueArchived: true });
    const missed2 = makeTodo({ id: "missed-2", recurrenceId: "series-1", overdueArchived: true });
    const notArchived = makeTodo({
      id: "future",
      recurrenceId: "series-1",
      overdueArchived: false,
    });

    const result = getRecurringMissedCount(
      [representative, missed1, missed2, notArchived],
      representative,
    );

    expect(result).toBe(2);
  });

  it("overdueArchived된 형제가 하나도 없으면 0을 반환해야 한다", () => {
    const representative = makeTodo({ id: "rep", recurrenceId: "series-1" });
    const future = makeTodo({ id: "future", recurrenceId: "series-1", overdueArchived: false });

    expect(getRecurringMissedCount([representative, future], representative)).toBe(0);
  });

  it("다른 recurrenceId를 가진 형제는 세지 않는다", () => {
    const representative = makeTodo({ id: "rep", recurrenceId: "series-1" });
    const otherSeriesMissed = makeTodo({
      id: "other",
      recurrenceId: "series-2",
      overdueArchived: true,
    });

    expect(
      getRecurringMissedCount([representative, otherSeriesMissed], representative),
    ).toBe(0);
  });
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

  it("대표가 나중에 만난(더 이른 dueAt) 인스턴스로 바뀌어도, 처음 만난 인스턴스의 자리가 아니라 대표 자신의 원래 위치에 남는다", () => {
    const todos = [
      makeTodo({ id: "other-1", order: 0 }),
      makeTodo({ id: "first-seen", recurrenceId: "series-1", order: 1, dueAt: "2026-07-12T00:00:00.000Z" }),
      makeTodo({ id: "other-2", order: 2 }),
      makeTodo({ id: "other-3", order: 3 }),
      makeTodo({
        id: "true-representative",
        recurrenceId: "series-1",
        order: 4,
        dueAt: "2026-07-10T00:00:00.000Z",
      }),
    ];
    const result = collapseRecurringInstances(todos);
    expect(result.map((t) => t.id)).toEqual(["other-1", "other-2", "other-3", "true-representative"]);
  });

  it("overdue 인스턴스가 overdueArchived: true가 되면 대표 후보에서 제외되고, 아직 archived 안 된 미래 인스턴스가 새 대표로 뜬다", () => {
    const todos = [
      makeTodo({
        id: "overdue-archived",
        recurrenceId: "series-1",
        dueAt: "2026-07-01T00:00:00.000Z",
        overdueArchived: true,
      }),
      makeTodo({ id: "future-1", recurrenceId: "series-1", dueAt: "2026-07-20T00:00:00.000Z" }),
      makeTodo({
        id: "future-2-nearer",
        recurrenceId: "series-1",
        dueAt: "2026-07-15T00:00:00.000Z",
      }),
    ];
    const result = collapseRecurringInstances(todos);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("future-2-nearer");
  });

  it("시리즈 내 모든 인스턴스가 overdueArchived 상태면 해당 시리즈는 대표가 없어 결과에서 완전히 빠진다", () => {
    const todos = [
      makeTodo({ id: "other-series", recurrenceId: "series-b", dueAt: "2026-07-05T00:00:00.000Z" }),
      makeTodo({
        id: "all-archived-1",
        recurrenceId: "series-a",
        dueAt: "2026-07-01T00:00:00.000Z",
        overdueArchived: true,
      }),
      makeTodo({
        id: "all-archived-2",
        recurrenceId: "series-a",
        dueAt: "2026-07-02T00:00:00.000Z",
        overdueArchived: true,
      }),
    ];
    const result = collapseRecurringInstances(todos);
    expect(result.map((t) => t.id)).toEqual(["other-series"]);
  });

  it("done 상태 인스턴스는 overdueArchived 정책과 무관하게 기존처럼 그대로 대표 후보로 노출된다 (회귀 확인)", () => {
    const todos = [
      makeTodo({ id: "done-1", status: "done", recurrenceId: "series-1", dueAt: "2026-07-01T00:00:00.000Z" }),
      makeTodo({ id: "future-1", recurrenceId: "series-1", dueAt: "2026-07-20T00:00:00.000Z" }),
    ];
    const result = collapseRecurringInstances(todos);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("done-1");
  });
});
