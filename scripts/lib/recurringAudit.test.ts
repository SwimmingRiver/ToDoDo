import { test } from "node:test";
import assert from "node:assert/strict";
import { auditTodos, toAuditTodo, type AuditTodo } from "./recurringAudit";

const todo = (overrides: Partial<AuditTodo> & { id: string }): AuditTodo => ({
  userId: "u1",
  parentId: null,
  recurrenceId: null,
  dueAt: null,
  archived: false,
  googleEventId: null,
  ...overrides,
});

test("부모가 있는 하위 할 일은 고아가 아니다", () => {
  const report = auditTodos([todo({ id: "p" }), todo({ id: "c", parentId: "p" })]);
  assert.equal(report.orphans.total, 0);
});

test("부모 문서가 없는 하위 할 일을 고아로 세고, 캘린더 대상·구글 연결 여부를 나눠 센다", () => {
  const report = auditTodos([
    todo({ id: "c1", parentId: "gone", dueAt: "2026-11-21T00:00:00.000Z" }),
    todo({ id: "c2", parentId: "gone", dueAt: "2026-11-21T00:00:00.000Z", archived: true }),
    todo({ id: "c3", parentId: "gone", googleEventId: "ev" }),
  ]);
  assert.equal(report.orphans.total, 3);
  assert.equal(report.orphans.calendarEligible, 1); // 마감 있음 + 보관 안 됨은 c1뿐
  assert.equal(report.orphans.withGoogleEventId, 1);
  assert.deepEqual(report.orphans.orphanIds, ["c1", "c2", "c3"]);
});

test("부모가 다른 사용자 소유면 고아가 아니라 별도로 센다", () => {
  const report = auditTodos([
    todo({ id: "p", userId: "u2" }),
    todo({ id: "c", parentId: "p", userId: "u1" }),
  ]);
  assert.equal(report.orphans.total, 0);
  assert.equal(report.orphans.parentOwnedByOtherUser, 1);
});

test("한 사용자의 여러 문서가 같은 googleEventId를 가지면 공유 그룹으로 묶고, 같은 시리즈인지 표시한다", () => {
  const report = auditTodos([
    todo({ id: "s_1", recurrenceId: "S", googleEventId: "ev1" }),
    todo({ id: "s_2", recurrenceId: "S", googleEventId: "ev1" }),
    todo({ id: "a", googleEventId: "ev2" }),
    todo({ id: "b", recurrenceId: "T", googleEventId: "ev2" }),
    todo({ id: "solo", googleEventId: "ev3" }),
  ]);
  assert.equal(report.sharedEvents.groups, 2);
  assert.equal(report.sharedEvents.todos, 4);
  assert.equal(report.sharedEvents.sameSeriesGroups, 1);
  assert.equal(report.sharedEvents.otherGroups, 1);
});

test("다른 사용자끼리 같은 googleEventId 값이어도 공유로 보지 않는다", () => {
  const report = auditTodos([
    todo({ id: "x", userId: "u1", googleEventId: "ev" }),
    todo({ id: "y", userId: "u2", googleEventId: "ev" }),
  ]);
  assert.equal(report.sharedEvents.groups, 0);
});

test("toAuditTodo는 필드가 없거나 빈 값인 옛 문서를 null/false로 읽는다", () => {
  assert.deepEqual(toAuditTodo("d", { userId: "u1", parentId: "", googleEventId: null }), {
    id: "d",
    userId: "u1",
    parentId: null,
    recurrenceId: null,
    dueAt: null,
    archived: false,
    googleEventId: null,
  });
});
