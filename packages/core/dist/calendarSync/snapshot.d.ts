import type { SyncSnapshot } from "./types.js";
export declare const snapshotStorageKey: (uid: string) => string;
export declare const serializeSnapshot: (snapshot: SyncSnapshot) => string;
/** 손상된 값·null은 빈 스냅샷으로 시작한다(throw 안 함). 이 세션 안에서는 정상
 *  동작하지만, 이번 세션에서 아카이브/삭제된 Todo의 이벤트 정리를 다음 로드까지
 *  놓칠 수 있다. */
export declare const deserializeSnapshot: (raw: string | null) => SyncSnapshot;
/** 스냅샷에는 있는데 현재 Todo 목록으로는 더 이상 추적되지 않는 구글 이벤트 id.
 *  Todo가 삭제됐는데 이벤트 삭제가 실패해 재시도 대기 중인 항목이 여기 해당한다 —
 *  연동 해제 시 이걸 같이 보내지 않으면 스냅샷이 비워지면서 영영 고아가 된다. */
export declare const findOrphanGoogleEventIds: (snapshot: SyncSnapshot, trackedGoogleEventIds: Iterable<string>) => string[];
