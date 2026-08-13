import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo.type";
import { planArchivedSweep, planOverdueRecurringSweep } from "../startupMaintenance";

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "test-user-id",
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
  archived: false,
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

const CUTOFF = "2026-06-10T00:00:00.000Z";
const NOW = "2026-07-10T00:00:00.000Z";

describe("planArchivedSweep", () => {
  it("컷오프보다 오래된 done 루트를 그룹으로 만든다", () => {
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });

    const groups = planArchivedSweep([root], CUTOFF, NOW);

    expect(groups).toEqual([
      { updates: [{ id: "root-1", fields: { archived: true, updatedAt: NOW } }] },
    ]);
  });

  it("루트와 그 자식을 같은 그룹에 담는다", () => {
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });
    const child = makeTodo({ id: "child-1", parentId: "root-1", status: "done" });
    const otherChild = makeTodo({ id: "child-2", parentId: "root-9", status: "done" });

    const groups = planArchivedSweep([root, child, otherChild], CUTOFF, NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].updates.map((u) => u.id)).toEqual(["root-1", "child-1"]);
  });

  it("컷오프보다 최근에 done된 루트는 제외한다", () => {
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-20T00:00:00.000Z" });

    expect(planArchivedSweep([root], CUTOFF, NOW)).toEqual([]);
  });

  it("done이 아닌 루트, 자식 항목, 이미 archived인 루트는 제외한다", () => {
    const notDone = makeTodo({ id: "a", status: "doing", doneAt: "2026-06-01T00:00:00.000Z" });
    const isChild = makeTodo({
      id: "b", parentId: "root-x", status: "done", doneAt: "2026-06-01T00:00:00.000Z",
    });
    const already = makeTodo({
      id: "c", status: "done", doneAt: "2026-06-01T00:00:00.000Z", archived: true,
    });

    expect(planArchivedSweep([notDone, isChild, already], CUTOFF, NOW)).toEqual([]);
  });

  it("archived 필드가 아예 없는 레거시 문서도 대상에 포함한다", () => {
    const legacy = makeTodo({ id: "legacy-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });
    delete (legacy as Partial<Todo>).archived;

    const groups = planArchivedSweep([legacy], CUTOFF, NOW);

    expect(groups[0].updates[0].id).toBe("legacy-1");
  });

  it("doneAt이 없는 done 루트는 제외한다", () => {
    const root = makeTodo({ id: "root-1", status: "done", doneAt: null });

    expect(planArchivedSweep([root], CUTOFF, NOW)).toEqual([]);
  });

  it("대상이 없으면 빈 배열을 반환한다", () => {
    expect(planArchivedSweep([makeTodo()], CUTOFF, NOW)).toEqual([]);
  });
});

describe("planOverdueRecurringSweep", () => {
  const todayStart = new Date(2026, 5, 10);
  todayStart.setHours(0, 0, 0, 0);
  const NOW_ISO = new Date(2026, 5, 10).toISOString();

  const makeInstance = (overrides: Partial<Todo> = {}): Todo =>
    makeTodo({
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "indefinite" },
      dueAt: new Date(2026, 5, 1, 12, 0).toISOString(),
      ...overrides,
    });

  it("dueAt이 오늘보다 이전인 미완료 반복 인스턴스를 대상으로 삼는다", () => {
    const overdue = makeInstance({ id: "inst-1" });

    expect(planOverdueRecurringSweep([overdue], todayStart, NOW_ISO)).toEqual([
      { id: "inst-1", fields: { overdueArchived: true, updatedAt: NOW_ISO } },
    ]);
  });

  it("오늘 마감인 인스턴스는 제외한다", () => {
    const today = makeInstance({ id: "inst-1", dueAt: new Date(2026, 5, 10, 9, 0).toISOString() });

    expect(planOverdueRecurringSweep([today], todayStart, NOW_ISO)).toEqual([]);
  });

  it("status가 todo가 아닌 인스턴스는 제외한다", () => {
    const done = makeInstance({ id: "inst-1", status: "done" });
    const doing = makeInstance({ id: "inst-2", status: "doing" });

    expect(planOverdueRecurringSweep([done, doing], todayStart, NOW_ISO)).toEqual([]);
  });

  it("반복이 아닌 할 일은 제외한다", () => {
    const plain = makeTodo({ id: "plain-1", dueAt: new Date(2026, 5, 1, 12, 0).toISOString() });

    expect(planOverdueRecurringSweep([plain], todayStart, NOW_ISO)).toEqual([]);
  });

  it("이미 overdueArchived인 인스턴스는 제외한다", () => {
    const already = makeInstance({ id: "inst-1", overdueArchived: true });

    expect(planOverdueRecurringSweep([already], todayStart, NOW_ISO)).toEqual([]);
  });

  it("overdueArchived 필드가 없는 문서는 대상에 포함한다", () => {
    const legacy = makeInstance({ id: "inst-1" });
    expect(legacy.overdueArchived).toBeUndefined();

    expect(planOverdueRecurringSweep([legacy], todayStart, NOW_ISO)).toHaveLength(1);
  });

  it("dueAt이 없는 인스턴스는 제외한다", () => {
    const noDue = makeInstance({ id: "inst-1", dueAt: null });

    expect(planOverdueRecurringSweep([noDue], todayStart, NOW_ISO)).toEqual([]);
  });

  it("오전 마감인 반복 인스턴스는 KST에서도 오늘로 취급한다", () => {
    // This test ensures that early-morning local times are not accidentally swept.
    // In KST (UTC+9), an early morning local deadline should NOT be marked as overdue
    // when it's still the same calendar day locally.
    const earlyMorning = makeInstance({
      id: "inst-kst",
      dueAt: new Date(2026, 5, 10, 5, 0).toISOString() // 5 AM local time
    });

    expect(planOverdueRecurringSweep([earlyMorning], todayStart, NOW_ISO)).toEqual([]);
  });
});
