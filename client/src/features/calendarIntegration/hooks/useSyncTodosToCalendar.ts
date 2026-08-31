import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { doc, writeBatch } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { useGetTodos } from "@/features/todo";
import type { Todo } from "@/features/todo";
import { toDateKeyFromISO } from "@/shared/utils/date";
import { syncTodosToCalendar, type SyncTodoPayload } from "../api";
import { useCalendarIntegrationStatus } from "./useCalendarIntegration";

interface SyncedSnapshotEntry {
  updatedAt: string;
  googleEventId: string | null;
}

const isSyncEligible = (todo: Todo): boolean => !!todo.dueAt && !todo.archived;

export const useSyncTodosToCalendar = (): void => {
  const { data: todos } = useGetTodos();
  const { data: integration } = useCalendarIntegrationStatus();
  const queryClient = useQueryClient();
  const snapshotRef = useRef<Map<string, SyncedSnapshotEntry>>(new Map());
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (!integration?.connected || integration.status === "revoked") return;
    if (!todos) return;
    if (isRunningRef.current) return;

    const snapshot = snapshotRef.current;
    const eligible = todos.filter(isSyncEligible);
    const eligibleIds = new Set(eligible.map((t) => t.id));

    const upserts: SyncTodoPayload[] = eligible
      .filter((t) => snapshot.get(t.id)?.updatedAt !== t.updatedAt)
      .map((t) => ({
        id: t.id,
        title: t.title,
        // Worker는 UTC로만 동작해 로컬 캘린더 날짜를 모른다 — 여기서 반드시
        // 로컬 타임존 기준으로 변환해서 보낸다 (dueAt을 그대로 슬라이싱 금지).
        dueAt: toDateKeyFromISO(t.dueAt as string),
        googleEventId: t.googleEventId ?? snapshot.get(t.id)?.googleEventId ?? null,
        action: "upsert" as const,
      }));

    const deletes: SyncTodoPayload[] = Array.from(snapshot.entries())
      .filter(([id, entry]) => !eligibleIds.has(id) && !!entry.googleEventId)
      .map(([id, entry]) => ({
        id,
        title: "",
        dueAt: "",
        googleEventId: entry.googleEventId,
        action: "delete" as const,
      }));

    const batch = [...upserts, ...deletes];
    if (batch.length === 0) return;

    isRunningRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const results = await syncTodosToCalendar(batch);
        if (cancelled) return;

        const firestoreBatch = writeBatch(db);
        let hasWrites = false;

        results.forEach(({ id, googleEventId, error }) => {
          if (error) {
            // 스냅샷을 갱신하지 않는다 — 다음 실행(todos 변경 또는 다음 앱 진입)에서
            // updatedAt이 그대로 다르게 남아 이 항목이 다시 동기화 대상에 잡힌다.
            console.error(`캘린더 동기화 실패 (todo ${id}):`, error);
            return;
          }
          const todo = eligible.find((t) => t.id === id);
          if (todo) {
            snapshot.set(id, { updatedAt: todo.updatedAt, googleEventId });
            if (todo.googleEventId !== googleEventId) {
              firestoreBatch.update(doc(db, "todos", id), { googleEventId });
              hasWrites = true;
            }
          } else {
            snapshot.delete(id);
          }
        });

        if (hasWrites) {
          await firestoreBatch.commit();
          queryClient.invalidateQueries({ queryKey: ["todos"] });
        }
      } catch (error) {
        console.error("캘린더 동기화 실패:", error);
      } finally {
        isRunningRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [todos, integration, queryClient]);
};
