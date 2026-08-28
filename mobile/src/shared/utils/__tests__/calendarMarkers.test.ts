import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Todo } from "@tododo/core";
import { buildCalendarMarkedDates } from "../calendarMarkers";
import { statusColors } from "../../../theme/statusColors";
import { colors } from "../../../theme/colors";

// dateRange.test.ts와 동일한 이유(로컬 타임존 기준 UTC ISO 생성) + isTodoOverdue가
// new Date()를 참조하므로 시스템 시각을 고정한다(useTodayTodos.test.tsx와 동일 패턴).
const localISO = (y: number, m: number, d: number, h = 9): string =>
  new Date(y, m - 1, d, h).toISOString();

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
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

describe("buildCalendarMarkedDates", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("완료 항목만 있는 날짜는 마커에 포함하지 않는다", () => {
    const todos = [makeTodo({ dueAt: localISO(2026, 6, 20), status: "done" })];
    expect(buildCalendarMarkedDates(todos)).toEqual({});
  });

  it("dueAt만 있는 항목은 그 날짜 하루에만 상태색 점을 남긴다", () => {
    const todos = [makeTodo({ dueAt: localISO(2026, 6, 20), status: "doing" })];
    const marked = buildCalendarMarkedDates(todos);
    expect(Object.keys(marked)).toEqual(["2026-06-20"]);
    expect(marked["2026-06-20"].dots).toEqual([{ key: "doing", color: statusColors.doing.main }]);
  });

  it("startAt~dueAt 구간의 모든 날짜에 점을 남긴다", () => {
    const todos = [
      makeTodo({ startAt: localISO(2026, 6, 20), dueAt: localISO(2026, 6, 22), status: "doing" }),
    ];
    const marked = buildCalendarMarkedDates(todos);
    expect(Object.keys(marked).sort()).toEqual(["2026-06-20", "2026-06-21", "2026-06-22"]);
    expect(marked["2026-06-21"].dots).toEqual([{ key: "doing", color: statusColors.doing.main }]);
  });

  it("마감이 지난(overdue) 항목이 있으면 그 날짜는 danger 점 하나만 표시한다(다른 상태 무시)", () => {
    const todos = [
      // 2026-06-15가 오늘(시스템 시각 고정)이므로 06-10 dueAt은 overdue.
      makeTodo({ id: "overdue", dueAt: localISO(2026, 6, 10), status: "todo" }),
      // 같은 06-10을 포함하는 진행중(비overdue) 기간 항목.
      makeTodo({ id: "period", startAt: localISO(2026, 6, 9), dueAt: localISO(2026, 6, 11), status: "doing" }),
    ];
    const marked = buildCalendarMarkedDates(todos);
    expect(marked["2026-06-10"].dots).toEqual([{ key: "overdue", color: colors.danger.main }]);
  });

  it("overdue 없이 서로 다른 상태의 항목이 겹치면 상태별 점을 todo→doing 순서로 각각 표시한다", () => {
    const todos = [
      makeTodo({ id: "a", dueAt: localISO(2026, 6, 20), status: "todo" }),
      makeTodo({ id: "b", startAt: localISO(2026, 6, 19), dueAt: localISO(2026, 6, 21), status: "doing" }),
    ];
    const marked = buildCalendarMarkedDates(todos);
    expect(marked["2026-06-20"].dots).toEqual([
      { key: "todo", color: statusColors.todo.main },
      { key: "doing", color: statusColors.doing.main },
    ]);
  });

  it("startAt/dueAt이 모두 없는 항목은 무시한다", () => {
    const todos = [makeTodo({ startAt: null, dueAt: null, status: "todo" })];
    expect(buildCalendarMarkedDates(todos)).toEqual({});
  });
});
