import { describe, it, expect } from "vitest";
import { computeSchedule, shouldSend, WINDOW_MS, type ReminderTodo, type ScheduleEntry } from "../schedule";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");
const iso = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const todo = (overrides: Partial<ReminderTodo> = {}): ReminderTodo => ({
  id: "t1",
  userId: "u1",
  title: "보고서",
  status: "todo",
  archived: false,
  dueAt: iso(2 * HOUR),
  reminderOffsetMinutes: undefined,
  ...overrides,
});

describe("computeSchedule", () => {
  it("기본값(30분)으로 fireAt을 계산한다", () => {
    expect(computeSchedule([todo()], undefined, NOW)).toEqual([
      { todoId: "t1", fireAt: NOW + 2 * HOUR - 30 * MIN, dueAt: iso(2 * HOUR), offsetMinutes: 30 },
    ]);
  });

  it("할 일별 재지정과 사용자 기본값을 적용한다", () => {
    const result = computeSchedule(
      [todo({ id: "a", reminderOffsetMinutes: 10 }), todo({ id: "b" })],
      60,
      NOW,
    );
    expect(result.map((e) => [e.todoId, e.offsetMinutes])).toEqual([
      ["b", 60],
      ["a", 10],
    ]);
  });

  it("완료·보관·off·마감 없음은 제외한다", () => {
    const result = computeSchedule(
      [
        todo({ id: "done", status: "done" }),
        todo({ id: "archived", archived: true }),
        todo({ id: "off", reminderOffsetMinutes: "off" }),
        todo({ id: "nodue", dueAt: null }),
        todo({ id: "ok" }),
      ],
      undefined,
      NOW,
    );
    expect(result.map((e) => e.todoId)).toEqual(["ok"]);
  });

  // Review Focus 2: 알림 시각이 이미 지난 할 일은 즉시 보내지 않고 건너뛴다.
  it("fireAt이 이미 지났으면 제외한다(마감 20분 전에 만든 할 일 + 30분 알림)", () => {
    expect(computeSchedule([todo({ dueAt: iso(20 * MIN) })], 30, NOW)).toEqual([]);
  });

  it("fireAt이 정확히 지금이어도 제외한다", () => {
    expect(computeSchedule([todo({ dueAt: iso(30 * MIN) })], 30, NOW)).toEqual([]);
  });

  it("fireAt이 7일 창 밖이면 제외한다", () => {
    const inside = todo({ id: "in", dueAt: iso(WINDOW_MS), reminderOffsetMinutes: 60 });
    const outside = todo({ id: "out", dueAt: iso(WINDOW_MS + 2 * HOUR), reminderOffsetMinutes: 60 });
    expect(computeSchedule([inside, outside], undefined, NOW).map((e) => e.todoId)).toEqual(["in"]);
  });

  it("하루 전 알림은 8일 뒤 마감까지 창 안에 들어온다", () => {
    const t = todo({ dueAt: iso(8 * DAY - HOUR), reminderOffsetMinutes: 1440 });
    expect(computeSchedule([t], undefined, NOW)).toHaveLength(1);
  });

  it("파싱할 수 없는 dueAt은 제외한다", () => {
    expect(computeSchedule([todo({ dueAt: "garbage" })], undefined, NOW)).toEqual([]);
  });

  it("사용자 기본값이 off면 아무것도 예약하지 않는다", () => {
    expect(computeSchedule([todo({ reminderOffsetMinutes: 30 })], "off", NOW)).toEqual([]);
  });
});

describe("shouldSend", () => {
  const entry: ScheduleEntry = { todoId: "t1", fireAt: NOW, dueAt: iso(30 * MIN), offsetMinutes: 30 };

  it("그대로면 보낸다", () => {
    expect(shouldSend(entry, todo({ dueAt: entry.dueAt }), NOW)).toEqual({ send: true });
  });

  it.each([
    ["missing", null],
    ["done", todo({ dueAt: entry.dueAt, status: "done" })],
    ["archived", todo({ dueAt: entry.dueAt, archived: true })],
    ["dueAtChanged", todo({ dueAt: iso(3 * HOUR) })],
  ] as const)("%s면 보내지 않는다", (reason, current) => {
    expect(shouldSend(entry, current, NOW)).toEqual({ send: false, reason });
  });

  it("마감 5분 이내 지연은 보낸다", () => {
    const due = { ...entry, dueAt: iso(0) };
    expect(shouldSend(due, todo({ dueAt: due.dueAt }), NOW + 5 * MIN)).toEqual({ send: true });
  });

  it("마감을 5분 넘게 지나 울리면 버린다", () => {
    const due = { ...entry, dueAt: iso(0) };
    expect(shouldSend(due, todo({ dueAt: due.dueAt }), NOW + 5 * MIN + 1)).toEqual({
      send: false,
      reason: "tooLate",
    });
  });
});
