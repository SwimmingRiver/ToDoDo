import { test } from "node:test";
import assert from "node:assert/strict";
import { calcParentStatus } from "../../packages/core/dist/api/todoApi.js";
import { buildDemoTodos, kstDateKey, kstToISO } from "./demoTodos";

// 테스트 기준 시각: KST 2026-11-23 08:30 (UTC 11-22 23:30) — UTC와 KST 날짜가 다른 시각으로 골라
// 날짜를 UTC로 잘못 뽑으면 실패하게 한다.
const NOW = new Date("2026-11-22T23:30:00.000Z");
const D = "2026-11-23";

const build = (now = NOW) => {
  let n = 0;
  return buildDemoTodos({ uid: "demo-uid", now, newId: () => `id${n++}` });
};

const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DAY_MS = 24 * 60 * 60 * 1000;

test("실행일(D)은 KST 날짜다", () => {
  assert.equal(kstDateKey(NOW), D);
  assert.equal(kstToISO(D, "10:00"), "2026-11-23T01:00:00.000Z");
});

test("모든 문서가 앱 작성 경로와 같은 필드·형식을 가진다", () => {
  const todos = build();
  const ids = new Set(todos.map((t) => t.id));
  assert.equal(ids.size, todos.length, "id 중복 없음");
  for (const { data } of todos) {
    assert.equal(data.userId, "demo-uid");
    assert.equal(data.archived, false);
    assert.equal(data.recurrence, null);
    assert.equal(data.recurrenceId, null);
    assert.equal(data.startAt, null);
    assert.match(data.dueAt ?? "", ISO_Z);
    assert.match(data.createdAt, ISO_Z);
    assert.match(data.updatedAt, ISO_Z);
    assert.ok(["todo", "doing", "done"].includes(data.status));
    assert.ok(["low", "medium", "high"].includes(data.priority));
    assert.equal(typeof data.order, "number");
    if (data.status === "done") assert.match(data.doneAt ?? "", ISO_Z, `${data.title}: done이면 doneAt 필수`);
    else assert.equal(data.doneAt, null, `${data.title}: done이 아니면 doneAt null`);
    assert.ok(data.createdAt <= data.updatedAt, `${data.title}: createdAt ≤ updatedAt`);
    // Firestore는 undefined를 거부한다
    assert.ok(Object.values(data).every((v) => v !== undefined));
  }
});

test("오늘 화면: D에 마감인 루트 할 일 4개, 그중 1개 완료(반복 2개는 앱에서 수동)", () => {
  const today = build().filter((t) => t.data.parentId === null && kstDateKey(new Date(t.data.dueAt!)) === D);
  assert.equal(today.length, 4);
  assert.equal(today.filter((t) => t.data.status === "done").length, 1);
  assert.equal(today.filter((t) => t.data.status === "doing").length, 1);
});

test("하위 할 일이 있는 상위 3개: parentId가 실제 상위를 가리키고 상위 상태는 core calcParentStatus와 같다", () => {
  const todos = build();
  const byId = new Map(todos.map((t) => [t.id, t]));
  const parents = todos.filter((t) => todos.some((c) => c.data.parentId === t.id));
  assert.deepEqual(
    parents.map((p) => p.data.title),
    ["포트폴리오 사이트 완성", "이사 준비", "제주도 여행 계획"],
  );
  for (const parent of parents) {
    assert.equal(parent.data.parentId, null, "상위는 루트");
    const children = todos.filter((c) => c.data.parentId === parent.id);
    children.forEach((c, i) => assert.equal(c.data.order, i, "하위 order는 0부터"));
    const expected = calcParentStatus(children.map((c) => ({ ...c.data, id: c.id })));
    assert.equal(parent.data.status, expected.status, parent.data.title);
  }
  // 하위의 parentId가 모두 존재하는 상위를 가리킨다(고아 없음)
  for (const t of todos) if (t.data.parentId) assert.ok(byId.has(t.data.parentId));
});

test("루트 order는 0부터 겹치지 않는다", () => {
  const roots = build().filter((t) => t.data.parentId === null);
  assert.deepEqual(
    roots.map((t) => t.data.order),
    roots.map((_, i) => i),
  );
});

test("통계 기록: D-28~D-1에 30~40개, 최근 7일은 매일 1개 이상, 30일 아카이빙 대상이 아니다", () => {
  const todos = build();
  const history = todos.filter((t) => t.data.parentId === null && t.data.status === "done" && t.data.doneAt! < kstToISO(D, "00:00"));
  assert.ok(history.length >= 30 && history.length <= 40, `개수 ${history.length}`);

  const doneDays = new Set(history.map((t) => kstDateKey(new Date(t.data.doneAt!))));
  for (let i = 1; i <= 7; i += 1) {
    const key = kstDateKey(new Date(NOW.getTime() - i * DAY_MS));
    assert.ok(doneDays.has(key), `D-${i}(${key}) 완료 기록 없음`);
  }

  // startupMaintenance의 아카이빙 기준(doneAt < now-30일)에 걸리는 done이 하나도 없어야 한다.
  const cutoff = new Date(NOW.getTime() - 30 * DAY_MS).toISOString();
  const oldest = todos.filter((t) => t.data.doneAt).map((t) => t.data.doneAt!).sort()[0];
  assert.ok(oldest >= kstToISO("2026-10-26", "00:00"), `가장 오래된 doneAt ${oldest}는 D-28 이내`);
  assert.ok(oldest > cutoff);

  // 하루 최대 3개
  const perDay = new Map<string, number>();
  for (const t of history) {
    const key = kstDateKey(new Date(t.data.doneAt!));
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  assert.ok([...perDay.values()].every((n) => n <= 3));

  // 우선순위 3:5:2 근사 — 각 등급이 최소한 보이게
  const count = (p: string) => history.filter((t) => t.data.priority === p).length;
  assert.ok(count("high") > 0 && count("medium") > count("low") && count("low") > 0);
});

test("완료 시각이 실행 시각보다 미래가 아니다", () => {
  const now = NOW.toISOString();
  for (const t of build()) if (t.data.doneAt) assert.ok(t.data.doneAt <= now, `${t.data.title} ${t.data.doneAt}`);
});

test("같은 now면 항상 같은 문서(결정적 — 시간대 독립성은 TZ를 바꿔 실행해 확인)", () => {
  assert.deepEqual(build(), build());
});
