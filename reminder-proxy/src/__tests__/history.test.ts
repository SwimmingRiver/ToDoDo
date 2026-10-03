import { describe, it, expect, beforeEach } from "vitest";
import { HISTORY_LIMIT, HISTORY_RETENTION_MS, markSeen, readHistory } from "../history";
import type { HistoryItem } from "../store";
import { MemoryReminderStore } from "./memoryStore";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");
const MIN = 60_000;
const item = (todoId: string, sentAt: number): HistoryItem => ({
  todoId,
  title: `할 일 ${todoId}`,
  offsetMinutes: 30,
  dueAt: new Date(sentAt + 30 * MIN).toISOString(),
  sentAt,
});

let store: MemoryReminderStore;
beforeEach(() => {
  store = new MemoryReminderStore();
});

describe("readHistory", () => {
  it("최신순으로 주고, 읽음 기록이 없으면 lastSeenAt은 0", () => {
    store.addHistory(item("a", NOW - 10 * MIN), 1);
    store.addHistory(item("b", NOW - 1 * MIN), 2);
    const res = readHistory(store, NOW);
    expect(res.items.map((i) => i.todoId)).toEqual(["b", "a"]);
    expect(res.lastSeenAt).toBe(0);
  });

  // Review Focus 4: 알림 기기가 없어 알람(정리)이 안 돈 동안 쌓인 오래된 기록
  it("서버 정리가 안 됐어도 7일 지난 기록은 보이지 않는다", () => {
    store.addHistory(item("old", NOW - HISTORY_RETENTION_MS - 1), 1);
    store.addHistory(item("edge", NOW - HISTORY_RETENTION_MS), 2);
    expect(readHistory(store, NOW).items.map((i) => i.todoId)).toEqual(["edge"]);
  });

  it(`최대 ${HISTORY_LIMIT}개까지만 준다`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) store.addHistory(item(`t${i}`, NOW - i * MIN), i);
    const res = readHistory(store, NOW);
    expect(res.items).toHaveLength(HISTORY_LIMIT);
    expect(res.items[0].todoId).toBe("t0");
  });
});

describe("markSeen", () => {
  it("보여준 최신 sentAt으로 읽음 위치를 올린다", () => {
    markSeen(store, NOW - 5 * MIN, NOW);
    expect(readHistory(store, NOW).lastSeenAt).toBe(NOW - 5 * MIN);
  });

  // Review Focus 3
  it("늦게 도착한 오래된 탭의 요청은 읽음 위치를 되돌리지 못한다", () => {
    markSeen(store, NOW - 1 * MIN, NOW);
    markSeen(store, NOW - 30 * MIN, NOW);
    expect(readHistory(store, NOW).lastSeenAt).toBe(NOW - 1 * MIN);
  });

  it("미래 값은 서버 현재 시각으로 자른다(앞으로 올 알림을 미리 읽음 처리하지 않음)", () => {
    markSeen(store, NOW + 60 * MIN, NOW);
    expect(readHistory(store, NOW).lastSeenAt).toBe(NOW);
  });
});
