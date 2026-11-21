import type { Todo } from "../types/todo.js";
import type { SyncSnapshot, SyncTodoPayload, SyncTodoResult } from "./types.js";
export declare const isSyncEligible: (todo: Todo) => boolean;
export interface CalendarSyncPlan {
    upserts: SyncTodoPayload[];
    deletes: SyncTodoPayload[];
    eligibleById: Map<string, Todo>;
}
export declare const planCalendarSync: (todos: Todo[], snapshot: SyncSnapshot) => CalendarSyncPlan;
export interface FirestoreGoogleEventIdUpdate {
    todoId: string;
    googleEventId: string | null;
}
/** 동기화 결과를 스냅샷(제자리 갱신)과 Firestore 업데이트 목록에 반영한다. */
export declare const applySyncResults: (results: SyncTodoResult[], eligibleById: Map<string, Todo>, existingTodoIds: Set<string>, snapshot: SyncSnapshot) => {
    firestoreUpdates: FirestoreGoogleEventIdUpdate[];
};
