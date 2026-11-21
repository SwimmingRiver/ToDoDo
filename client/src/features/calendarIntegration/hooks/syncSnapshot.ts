import {
  deserializeSnapshot,
  serializeSnapshot,
  snapshotStorageKey,
  findOrphanGoogleEventIds,
  type SyncedSnapshotEntry,
  type SyncSnapshot,
} from "@tododo/core/dist/calendarSync/index.js";

/** 마지막으로 구글에 동기화한 상태의 스냅샷. 훅(useSyncTodosToCalendar)이 소유하고
 *  localStorage에 영속화한다 — 직렬화·키·고아 탐지는 core, 여기는 저장소 접근만. */
export type { SyncedSnapshotEntry, SyncSnapshot };
export { findOrphanGoogleEventIds };

export const loadSnapshot = (uid: string): SyncSnapshot => {
  try {
    return deserializeSnapshot(localStorage.getItem(snapshotStorageKey(uid)));
  } catch {
    // localStorage 접근 불가(프라이빗 브라우징 등) — 빈 스냅샷으로 시작한다.
    return new Map();
  }
};

export const saveSnapshot = (uid: string, snapshot: SyncSnapshot): void => {
  try {
    localStorage.setItem(snapshotStorageKey(uid), serializeSnapshot(snapshot));
  } catch {
    // 메모리 상의 스냅샷은 이미 최신이므로 이번 세션 동작은 정상이다.
  }
};

export const clearSnapshot = (uid: string): void => {
  try {
    localStorage.removeItem(snapshotStorageKey(uid));
  } catch {
    // 위와 동일.
  }
};
