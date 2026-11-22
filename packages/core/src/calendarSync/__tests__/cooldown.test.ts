import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo";
import {
  SYNC_CHUNK_SIZE,
  chunkSyncBatch,
  excludeCoolingDown,
  recordSyncFailures,
  type SyncFailureLog,
} from "../cooldown";
import type { SyncTodoPayload, SyncTodoResult } from "../types";

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

const upsert = (id: string): SyncTodoPayload => ({
  id,
  title: "할 일",
  dueAt: "2026-03-01",
  googleEventId: null,
  action: "upsert",
});
const del = (id: string): SyncTodoPayload => ({ id, title: "", dueAt: "", googleEventId: `g-${id}`, action: "delete" });

const NOW = 1_000_000;

describe("recordSyncFailures", () => {
  it("실패 항목은 updatedAt과 재시도 가능 시각을 기록하고, 성공 항목은 기록을 지운다", () => {
    const eligibleById = new Map([
      ["a", todo({ id: "a", updatedAt: "u-a" })],
      ["b", todo({ id: "b", updatedAt: "u-b" })],
    ]);
    const failures: SyncFailureLog = new Map([["b", { updatedAt: "old", retryAfter: NOW + 1 }]]);
    const results: SyncTodoResult[] = [
      { id: "a", googleEventId: null, error: "403 rateLimitExceeded" },
      { id: "b", googleEventId: "gb" },
    ];

    recordSyncFailures([upsert("a"), upsert("b")], results, eligibleById, failures, NOW);

    expect(failures.get("a")).toEqual({ updatedAt: "u-a", retryAfter: NOW + 5 * 60_000 });
    expect(failures.has("b")).toBe(false);
  });

  it("삭제 항목(대상 목록에 없음)의 실패는 updatedAt을 빈 문자열로 기록한다", () => {
    const failures: SyncFailureLog = new Map();
    recordSyncFailures([del("x")], [{ id: "x", googleEventId: "g-x", error: "boom" }], new Map(), failures, NOW, 1000);
    expect(failures.get("x")).toEqual({ updatedAt: "", retryAfter: NOW + 1000 });
  });
});

describe("excludeCoolingDown", () => {
  const eligibleById = new Map([
    ["a", todo({ id: "a", updatedAt: "u-a" })],
    ["b", todo({ id: "b", updatedAt: "u-b" })],
  ]);

  it("최근 실패했고 그 뒤로 수정되지 않은 항목은 쿨다운 동안 뺀다", () => {
    const failures: SyncFailureLog = new Map([["a", { updatedAt: "u-a", retryAfter: NOW + 1 }]]);
    expect(excludeCoolingDown([upsert("a"), upsert("b")], eligibleById, failures, NOW).map((p) => p.id)).toEqual([
      "b",
    ]);
  });

  it("쿨다운이 끝나면(now >= retryAfter) 다시 보낸다", () => {
    const failures: SyncFailureLog = new Map([["a", { updatedAt: "u-a", retryAfter: NOW }]]);
    expect(excludeCoolingDown([upsert("a")], eligibleById, failures, NOW).map((p) => p.id)).toEqual(["a"]);
  });

  it("실패 뒤 사용자가 수정했으면(updatedAt 변경) 쿨다운 중이어도 즉시 보낸다", () => {
    const failures: SyncFailureLog = new Map([["a", { updatedAt: "older", retryAfter: NOW + 60_000 }]]);
    expect(excludeCoolingDown([upsert("a")], eligibleById, failures, NOW).map((p) => p.id)).toEqual(["a"]);
  });

  it("삭제 항목도 쿨다운 중이면 뺀다", () => {
    const failures: SyncFailureLog = new Map([["x", { updatedAt: "", retryAfter: NOW + 1 }]]);
    expect(excludeCoolingDown([del("x"), del("y")], eligibleById, failures, NOW).map((p) => p.id)).toEqual(["y"]);
  });

  it("삭제로 실패했던 항목이 다시 대상이 되면(updatedAt 생김) 즉시 보낸다", () => {
    const failures: SyncFailureLog = new Map([["a", { updatedAt: "", retryAfter: NOW + 1 }]]);
    expect(excludeCoolingDown([upsert("a")], eligibleById, failures, NOW).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("chunkSyncBatch", () => {
  // Worker 무료 플랜 서브리퀘스트 50 한도: 항목당 최악 9회(POST·409·GET·PATCH × 재시도) ×
  // 5 + JWKS·토큰 갱신 ≈ 47.
  it("기본 5개씩 나눈다", () => {
    expect(SYNC_CHUNK_SIZE).toBe(5);
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(chunkSyncBatch(items).map((c) => c.length)).toEqual([5, 5, 2]);
  });
  it("크기 지정, 빈 배열은 빈 결과", () => {
    expect(chunkSyncBatch([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunkSyncBatch([])).toEqual([]);
  });
});
