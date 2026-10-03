import type { HistoryItem, ReminderStore } from "./store";

export const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60_000;
export const HISTORY_LIMIT = 50;

export interface HistoryResponse {
  items: HistoryItem[];
  lastSeenAt: number;
}

const lastSeenAt = (store: ReminderStore): number => Number(store.getMeta("lastSeenAt") ?? 0);

/**
 * 정리는 알람이 돌 때만 일어나는데, 알림 기기가 없으면 알람이 돌지 않는다.
 * 그래서 읽을 때도 같은 기준(7일·50개)으로 걸러 정리 여부와 무관하게 결과를 같게 한다.
 */
export const readHistory = (store: ReminderStore, now: number): HistoryResponse => ({
  items: store.listHistory(now - HISTORY_RETENTION_MS, HISTORY_LIMIT),
  lastSeenAt: lastSeenAt(store),
});

/**
 * seenUntil은 클라가 화면에 실제로 보여준 가장 최신 sentAt이다(서버 시각으로 찍으면
 * 조회 후 ~ seen 전송 전에 도착한 알림이 보지도 않고 읽음 처리된다).
 * max: 늦게 도착한 오래된 탭의 요청이 읽음 위치를 되돌리지 못하게.
 * min(now): 미래 값으로 앞으로 올 알림을 미리 읽음 처리하지 못하게.
 */
export const markSeen = (store: ReminderStore, seenUntil: number, now: number): void => {
  const prev = lastSeenAt(store);
  const next = Math.max(prev, Math.min(seenUntil, now));
  if (next !== prev) store.setMeta("lastSeenAt", String(next));
};
