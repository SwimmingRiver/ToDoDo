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

  it("대표가 나중에 만난(더 이른 dueAt) 인스턴스로 바뀌어도, 처음 만난 인스턴스의 자리가 아니라 대표 자신의 원래 위치에 남는다", () => {
    // 칸반 재정렬(useKanbanDrag)은 order로 정렬된 원본 배열에서 카드의 위치를
    // 계산하므로, collapse된 대표 카드가 화면에 보이는 위치는 반드시 그 대표
    // 자신의 order 순위와 일치해야 한다 — 첫 인스턴스의 자리를 빌려 쓰면 어긋난다.
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
      makeTodo({
        id: "future-1",
        recurrenceId: "series-1",
        dueAt: "2026-07-20T00:00:00.000Z",
      }),
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
      makeTodo({
        id: "other-series",
        recurrenceId: "series-b",
        dueAt: "2026-07-05T00:00:00.000Z",
      }),
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
    // overdueArchived는 planOverdueRecurringSweep이 status:"todo"인 문서만 대상으로 세팅하므로
    // done 인스턴스에는 애초에 붙지 않지만, collapseRecurringInstances 자체가 status를 보고
    // 분기하지 않는다는 점(overdueArchived 필드 유무만 본다)을 명시적으로 회귀 확인한다.
    const todos = [
      makeTodo({
        id: "done-1",
        status: "done",
        recurrenceId: "series-1",
        dueAt: "2026-07-01T00:00:00.000Z",
      }),
      makeTodo({
        id: "future-1",
        recurrenceId: "series-1",
        dueAt: "2026-07-20T00:00:00.000Z",
      }),
    ];
    const result = collapseRecurringInstances(todos);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("done-1");
  });
});
