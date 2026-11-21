import type { Todo } from "../types/todo.js";
import { toDateKeyFromISO } from "../insights/date.js";
import type { SyncSnapshot, SyncTodoPayload, SyncTodoResult } from "./types.js";

export const isSyncEligible = (todo: Todo): boolean => !!todo.dueAt && !todo.archived;

export interface CalendarSyncPlan {
  upserts: SyncTodoPayload[];
  deletes: SyncTodoPayload[];
  eligibleById: Map<string, Todo>;
}

export const planCalendarSync = (todos: Todo[], snapshot: SyncSnapshot): CalendarSyncPlan => {
  const eligible = todos.filter(isSyncEligible);
  const eligibleById = new Map(eligible.map((t) => [t.id, t]));

  // Firestore에 googleEventId가 없으면 스냅샷이 뭐라 하든 미동기화 상태다 —
  // 다른 기기에서 연동을 해제했거나 저장소가 어긋난 경우에도 앱 진입 시 스스로
  // 복구되게 한다.
  const upserts: SyncTodoPayload[] = eligible
    .filter((t) => !t.googleEventId || snapshot.get(t.id)?.updatedAt !== t.updatedAt)
    .map((t) => ({
      id: t.id,
      title: t.title,
      // Worker는 UTC로만 동작해 로컬 캘린더 날짜를 모른다 — 반드시 로컬
      // 타임존 기준으로 변환해서 보낸다 (dueAt을 그대로 슬라이싱 금지).
      dueAt: toDateKeyFromISO(t.dueAt as string),
      // Firestore의 id만 믿고 스냅샷 id로는 폴백하지 않는다 — 연동 해제로 지워진
      // 이벤트는 404가 아니라 tombstone(구글이 status:"cancelled"로 돌려줌)이라,
      // 스냅샷의 옛 id로 PATCH하면 성공처럼 보이면서 캘린더엔 영영 안 나타난다.
      // null이면 Worker가 결정론적 id로 POST→409→status:"confirmed"로 되살리기
      // 경로를 타 같은 이벤트로 수렴한다.
      googleEventId: t.googleEventId ?? null,
      action: "upsert" as const,
    }));

  const deletes: SyncTodoPayload[] = Array.from(snapshot.entries())
    .filter(([id, entry]) => !eligibleById.has(id) && !!entry.googleEventId)
    .map(([id, entry]) => ({
      id,
      title: "",
      dueAt: "",
      googleEventId: entry.googleEventId,
      action: "delete" as const,
    }));

  return { upserts, deletes, eligibleById };
};

export interface FirestoreGoogleEventIdUpdate {
  todoId: string;
  googleEventId: string | null;
}

/** 동기화 결과를 스냅샷(제자리 갱신)과 Firestore 업데이트 목록에 반영한다. */
export const applySyncResults = (
  results: SyncTodoResult[],
  eligibleById: Map<string, Todo>,
  existingTodoIds: Set<string>,
  snapshot: SyncSnapshot,
): { firestoreUpdates: FirestoreGoogleEventIdUpdate[] } => {
  const firestoreUpdates: FirestoreGoogleEventIdUpdate[] = [];

  for (const { id, googleEventId, error } of results) {
    if (error) {
      // 스냅샷을 갱신하지 않는다 — 다음 실행에서 updatedAt이 그대로 다르게 남아
      // 이 항목이 다시 동기화 대상에 잡힌다.
      continue;
    }
    const todo = eligibleById.get(id);
    if (todo) {
      snapshot.set(id, { updatedAt: todo.updatedAt, googleEventId });
      if (todo.googleEventId !== googleEventId) firestoreUpdates.push({ todoId: id, googleEventId });
    } else {
      // 삭제 성공. 스냅샷에서는 지우되, Todo 문서 자체가 아직 존재한다면
      // (archived·dueAt 제거로 대상에서만 빠진 경우) googleEventId도 같이 지운다 —
      // 안 지우면 나중에 다시 대상이 됐을 때 이미 삭제된 이벤트 id로 PATCH를
      // 시도해 계속 실패한다.
      snapshot.delete(id);
      if (existingTodoIds.has(id)) firestoreUpdates.push({ todoId: id, googleEventId: null });
    }
  }

  return { firestoreUpdates };
};
