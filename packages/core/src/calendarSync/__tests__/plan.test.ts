import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo";
import { toDateKey } from "../../insights/date";
import { applySyncResults, isSyncEligible, planCalendarSync } from "../plan";
import type { SyncSnapshot } from "../types";

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: "t1",
  userId: "u",
  title: "할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: "2026-03-01T15:30:00.000Z",
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("isSyncEligible", () => {
  it("dueAt 없거나 archived면 대상이 아니다", () => {
    expect(isSyncEligible(todo())).toBe(true);
    expect(isSyncEligible(todo({ dueAt: null }))).toBe(false);
    expect(isSyncEligible(todo({ archived: true }))).toBe(false);
  });
});

describe("planCalendarSync", () => {
  it("googleEventId 없음 → upsert(null)", () => {
    const { upserts } = planCalendarSync([todo()], new Map());
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ id: "t1", googleEventId: null, action: "upsert", title: "할 일" });
  });

  it("스냅샷 updatedAt 같고 id 있음 → 제외", () => {
    const t = todo({ googleEventId: "g1" });
    const snap: SyncSnapshot = new Map([["t1", { updatedAt: t.updatedAt, googleEventId: "g1" }]]);
    const plan = planCalendarSync([t], snap);
    expect(plan.upserts).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it("updatedAt 다름 → Firestore id로 upsert (스냅샷 id 아님)", () => {
    const t = todo({ googleEventId: "fs-id", updatedAt: "2026-02-01T00:00:00.000Z" });
    const snap: SyncSnapshot = new Map([["t1", { updatedAt: "2026-01-01T00:00:00.000Z", googleEventId: "old" }]]);
    expect(planCalendarSync([t], snap).upserts[0].googleEventId).toBe("fs-id");
  });

  it("Firestore id 없고 스냅샷에만 id가 있어도 null로 보낸다", () => {
    const snap: SyncSnapshot = new Map([["t1", { updatedAt: "x", googleEventId: "stale" }]]);
    expect(planCalendarSync([todo()], snap).upserts[0].googleEventId).toBeNull();
  });

  it("archived·dueAt 없음은 upsert 대상이 아니고 eligibleById에도 없다", () => {
    const plan = planCalendarSync([todo({ archived: true }), todo({ id: "t2", dueAt: null })], new Map());
    expect(plan.upserts).toEqual([]);
    expect(plan.eligibleById.size).toBe(0);
  });

  it("스냅샷에만 있고 id 있음 → delete", () => {
    const snap: SyncSnapshot = new Map([["gone", { updatedAt: "x", googleEventId: "g9" }]]);
    expect(planCalendarSync([], snap).deletes).toEqual([
      { id: "gone", title: "", dueAt: "", googleEventId: "g9", action: "delete" },
    ]);
  });

  it("스냅샷 항목에 id가 없으면 delete 안 함", () => {
    const snap: SyncSnapshot = new Map([["gone", { updatedAt: "x", googleEventId: null }]]);
    expect(planCalendarSync([], snap).deletes).toEqual([]);
  });

  it("dueAt은 실행 TZ의 로컬 날짜 키로 변환된다", () => {
    const iso = "2026-03-01T15:30:00.000Z";
    const { upserts } = planCalendarSync([todo({ dueAt: iso })], new Map());
    expect(upserts[0].dueAt).toBe(toDateKey(new Date(iso)));
    expect(upserts[0].dueAt).toMatch(/^2026-03-0[12]$/);
  });
});

describe("applySyncResults", () => {
  it("upsert 성공 → 스냅샷 set, id 바뀌면 firestoreUpdates", () => {
    const t = todo();
    const snap: SyncSnapshot = new Map();
    const { firestoreUpdates } = applySyncResults(
      [{ id: "t1", googleEventId: "g1" }],
      new Map([["t1", t]]),
      new Set(["t1"]),
      snap,
    );
    expect(snap.get("t1")).toEqual({ updatedAt: t.updatedAt, googleEventId: "g1" });
    expect(firestoreUpdates).toEqual([{ todoId: "t1", googleEventId: "g1" }]);
  });

  it("id가 그대로면 Firestore 업데이트 없음", () => {
    const t = todo({ googleEventId: "g1" });
    const snap: SyncSnapshot = new Map();
    const { firestoreUpdates } = applySyncResults(
      [{ id: "t1", googleEventId: "g1" }],
      new Map([["t1", t]]),
      new Set(["t1"]),
      snap,
    );
    expect(firestoreUpdates).toEqual([]);
    expect(snap.has("t1")).toBe(true);
  });

  it("오류 항목 → 스냅샷·업데이트 없음", () => {
    const snap: SyncSnapshot = new Map([["t1", { updatedAt: "old", googleEventId: "g0" }]]);
    const { firestoreUpdates } = applySyncResults(
      [{ id: "t1", googleEventId: null, error: "boom" }],
      new Map([["t1", todo()]]),
      new Set(["t1"]),
      snap,
    );
    expect(firestoreUpdates).toEqual([]);
    expect(snap.get("t1")).toEqual({ updatedAt: "old", googleEventId: "g0" });
  });

  it("delete 성공 + 문서 존재 → googleEventId null 업데이트, 스냅샷 삭제", () => {
    const snap: SyncSnapshot = new Map([["t1", { updatedAt: "x", googleEventId: "g1" }]]);
    const { firestoreUpdates } = applySyncResults(
      [{ id: "t1", googleEventId: null }],
      new Map(),
      new Set(["t1"]),
      snap,
    );
    expect(firestoreUpdates).toEqual([{ todoId: "t1", googleEventId: null }]);
    expect(snap.has("t1")).toBe(false);
  });

  it("delete 성공 + 문서 없음 → 스냅샷만 삭제", () => {
    const snap: SyncSnapshot = new Map([["t1", { updatedAt: "x", googleEventId: "g1" }]]);
    const { firestoreUpdates } = applySyncResults([{ id: "t1", googleEventId: null }], new Map(), new Set(), snap);
    expect(firestoreUpdates).toEqual([]);
    expect(snap.has("t1")).toBe(false);
  });
});
