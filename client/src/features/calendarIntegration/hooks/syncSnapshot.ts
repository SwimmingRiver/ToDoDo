/** 마지막으로 구글에 동기화한 상태의 스냅샷. 훅(useSyncTodosToCalendar)이 소유하고
 *  localStorage에 영속화한다 — 연동 해제 버튼이 "스냅샷에만 남은 고아 이벤트"를
 *  읽어야 해서 읽기/쓰기를 여기로 분리했다. */
export interface SyncedSnapshotEntry {
  updatedAt: string;
  googleEventId: string | null;
}

export type SyncSnapshot = Map<string, SyncedSnapshotEntry>;

const snapshotStorageKey = (uid: string): string => `calendarSyncSnapshot:${uid}`;

export const loadSnapshot = (uid: string): SyncSnapshot => {
  try {
    const raw = localStorage.getItem(snapshotStorageKey(uid));
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [string, SyncedSnapshotEntry][]);
  } catch {
    // localStorage 접근 불가(프라이빗 브라우징, 손상된 값 등) — 빈 스냅샷으로
    // 시작한다. 이 세션 안에서는 정상 동작하지만, 페이지를 새로고침하기 전까지는
    // 이번 세션에서 아카이브/삭제된 Todo의 이벤트 정리를 다음 로드까지 놓칠 수 있다.
    return new Map();
  }
};

export const saveSnapshot = (uid: string, snapshot: SyncSnapshot): void => {
  try {
    localStorage.setItem(snapshotStorageKey(uid), JSON.stringify(Array.from(snapshot.entries())));
  } catch {
    // 위와 동일한 이유로 조용히 넘어간다 — 메모리 상의 스냅샷은 이미 최신이므로
    // 이번 세션의 동작 자체는 계속 정상이다.
  }
};

export const clearSnapshot = (uid: string): void => {
  try {
    localStorage.removeItem(snapshotStorageKey(uid));
  } catch {
    // 위와 동일.
  }
};

/** 스냅샷에는 있는데 현재 Todo 목록으로는 더 이상 추적되지 않는 구글 이벤트 id.
 *  Todo가 삭제됐는데 이벤트 삭제가 실패해 재시도 대기 중인 항목이 여기 해당한다 —
 *  연동 해제 시 이걸 같이 보내지 않으면 스냅샷이 비워지면서 영영 고아가 된다. */
export const findOrphanGoogleEventIds = (
  snapshot: SyncSnapshot,
  trackedGoogleEventIds: Iterable<string>,
): string[] => {
  const tracked = new Set(trackedGoogleEventIds);
  const orphans: string[] = [];
  snapshot.forEach((entry) => {
    if (entry.googleEventId && !tracked.has(entry.googleEventId)) orphans.push(entry.googleEventId);
  });
  return orphans;
};
