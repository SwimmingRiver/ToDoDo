import { test } from "node:test";
import assert from "node:assert/strict";
import { auditDoneAt, toAuditTodo } from "./doneAtAudit";

const base = {
  userId: "u1",
  status: "done",
  doneAt: "2026-05-01T00:00:00.000Z",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  parentId: null,
  recurrenceId: null,
  archived: false,
};

const make = (id: string, overrides: Record<string, unknown> = {}) => toAuditTodo(id, { ...base, ...overrides });

test("doneAt 상태를 없음·null·빈 문자열·문자열 아님·깨진 날짜·정상으로 구분한다", () => {
  const { doneAt: _omit, ...withoutDoneAt } = base;
  assert.equal(toAuditTodo("a", withoutDoneAt).doneAtState, "missing");
  assert.equal(make("b", { doneAt: null }).doneAtState, "null");
  assert.equal(make("c", { doneAt: "" }).doneAtState, "empty");
  assert.equal(make("d", { doneAt: { seconds: 1 } }).doneAtState, "nonString");
  assert.equal(make("e", { doneAt: "not-a-date" }).doneAtState, "invalid");
  assert.equal(make("f").doneAtState, "ok");
});

test("done이 아닌 할 일은 doneAt이 없어도 세지 않는다", () => {
  const report = auditDoneAt([make("a", { status: "todo", doneAt: null }), make("b", { status: "doing", doneAt: null })]);
  assert.equal(report.doneTodos, 0);
  assert.equal(report.broken.total, 0);
});

test("done인데 doneAt이 정상이 아니면 세고, 상위/하위·반복·보관·updatedAt 유무를 나눠 센다", () => {
  const report = auditDoneAt([
    make("ok"),
    make("r1", { doneAt: null }),
    make("c1", { doneAt: null, parentId: "p", archived: true }),
    make("rec", { doneAt: null, recurrenceId: "S", updatedAt: "" }),
  ]);
  assert.equal(report.doneTodos, 4);
  assert.equal(report.broken.total, 3);
  assert.equal(report.broken.roots, 2);
  assert.equal(report.broken.children, 1);
  assert.equal(report.broken.recurring, 1);
  assert.equal(report.broken.archived, 1);
  assert.equal(report.broken.withValidUpdatedAt, 2);
  assert.deepEqual(report.broken.byState, [["null", 3]]);
  assert.deepEqual(report.broken.ids, ["r1", "c1", "rec"]);
});

test("만들어진 달·마지막 수정 달 분포를 낸다(날짜 없으면 unknown)", () => {
  const report = auditDoneAt([
    make("a", { doneAt: null, createdAt: "2026-03-10T00:00:00.000Z", updatedAt: "2026-03-11T00:00:00.000Z" }),
    make("b", { doneAt: null, createdAt: "2026-03-20T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" }),
    make("c", { doneAt: null, createdAt: null }),
  ]);
  assert.deepEqual(report.broken.byCreatedMonth, [["2026-03", 2], ["unknown", 1]]);
  assert.deepEqual(report.broken.byUpdatedMonth, [["2026-03", 1], ["2026-05", 1], ["2026-07", 1]]);
});

test("영향받은 사용자 수와, done 전부/절반 이상이 깨진 사용자 수를 센다", () => {
  const report = auditDoneAt([
    // u1: 1/1 깨짐 → 전부
    make("a", { userId: "u1", doneAt: null }),
    // u2: 2/3 깨짐 → 절반 이상
    make("b", { userId: "u2", doneAt: null }),
    make("c", { userId: "u2", doneAt: null }),
    make("d", { userId: "u2" }),
    // u3: 1/3 깨짐 → 일부
    make("e", { userId: "u3", doneAt: null }),
    make("f", { userId: "u3" }),
    make("g", { userId: "u3" }),
    // u4: 정상
    make("h", { userId: "u4" }),
  ]);
  assert.equal(report.users.withDone, 4);
  assert.equal(report.users.affected, 3);
  assert.equal(report.users.allDoneBroken, 1);
  assert.equal(report.users.halfOrMoreBroken, 1);
});
