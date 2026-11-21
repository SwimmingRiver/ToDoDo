import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  deserializeSnapshot,
  serializeSnapshot,
  snapshotStorageKey,
  findOrphanGoogleEventIds,
  type SyncedSnapshotEntry,
  type SyncSnapshot,
} from "@tododo/core/dist/calendarSync/index.js";

/** 마지막으로 구글에 동기화한 상태의 스냅샷. 직렬화·키·고아 탐지는 core, 여기는 저장소 접근만.
 *  웹(localStorage)과 달리 AsyncStorage는 비동기다. 전부 throw하지 않는다 — 저장소 실패가
 *  동기화 자체를 막으면 안 된다. */
export type { SyncedSnapshotEntry, SyncSnapshot };
export { findOrphanGoogleEventIds };

export const loadSnapshot = async (uid: string): Promise<SyncSnapshot> => {
  try {
    return deserializeSnapshot(await AsyncStorage.getItem(snapshotStorageKey(uid)));
  } catch {
    // 저장소 접근 불가 — 빈 스냅샷으로 시작한다.
    return new Map();
  }
};

export const saveSnapshot = async (uid: string, snapshot: SyncSnapshot): Promise<void> => {
  try {
    await AsyncStorage.setItem(snapshotStorageKey(uid), serializeSnapshot(snapshot));
  } catch {
    // 메모리 상의 스냅샷은 이미 최신이므로 이번 세션 동작은 정상이다.
  }
};

export const clearSnapshot = async (uid: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(snapshotStorageKey(uid));
  } catch {
    // 위와 동일.
  }
};
