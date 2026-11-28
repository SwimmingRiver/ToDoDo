import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Todo } from "@tododo/core";
import type { GoogleCalendarEvent } from "@tododo/core/dist/calendarSync/index.js";
import { buildWeekDayItems } from "../weekDayItems";
import { statusColors } from "../../theme/statusColors";
import { colors } from "../../theme/colors";

const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();

const todo = (over: Partial<Todo>): Todo => ({
  id: "x",
  userId: "u1",
  title: "t",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: at(1),
  updatedAt: at(1),
  ...over,
});

const google = (id: string, title: string): GoogleCalendarEvent => ({ id, title, start: at(26, 9), end: at(26, 10) });

describe("buildWeekDayItems", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 28, 12) });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("기한 초과(마감일) → todo → doing → 구글 → 완료 순", () => {
    const items = buildWeekDayItems(
      "2026-11-26",
      [
        todo({ id: "A", title: "A", status: "done", dueAt: at(26) }),
        todo({ id: "B", title: "B", status: "doing", dueAt: at(30) }),
        todo({ id: "C", title: "C", status: "todo", dueAt: at(30) }),
        todo({ id: "D", title: "D", status: "todo", dueAt: at(26) }),
      ],
      [google("G", "G")],
    );
    expect(items.map((i) => i.title)).toEqual(["D", "C", "B", "G", "A"]);
  });

  it("기간 할 일이 기한을 넘겼으면 마감일 줄만 빨강, 앞선 날은 상태 색", () => {
    const e = todo({ id: "E", title: "E", startAt: at(24), dueAt: at(26) });
    expect(buildWeekDayItems("2026-11-24", [e], [])[0].dotColor).toBe(statusColors.todo.main);
    expect(buildWeekDayItems("2026-11-26", [e], [])[0].dotColor).toBe(colors.danger.main);
  });

  it("같은 묶음 안에서는 마감 이른 순, 마감 없는 것은 뒤에서 제목 순", () => {
    const items = buildWeekDayItems(
      "2026-11-30",
      [
        todo({ id: "1", title: "다", dueAt: null, startAt: at(30) }),
        todo({ id: "2", title: "늦게", dueAt: at(30, 18) }),
        todo({ id: "3", title: "가", dueAt: null, startAt: at(30) }),
        todo({ id: "4", title: "일찍", dueAt: at(30, 9) }),
      ],
      [],
    );
    expect(items.map((i) => i.title)).toEqual(["일찍", "늦게", "가", "다"]);
  });

  it("완료·구글은 흐리게(muted), 색과 key 규칙", () => {
    const items = buildWeekDayItems(
      "2026-11-26",
      [todo({ id: "A", title: "A", status: "done", dueAt: at(26) }), todo({ id: "B", title: "B", dueAt: at(30) })],
      [google("G", "G")],
    );
    expect(items).toEqual([
      { key: "todo-B", title: "B", dotColor: statusColors.todo.main, muted: false, kind: "todo" },
      { key: "google-G", title: "G", dotColor: colors.text.tertiary, muted: true, kind: "google" },
      { key: "todo-A", title: "A", dotColor: statusColors.done.main, muted: true, kind: "todo" },
    ]);
  });
});
