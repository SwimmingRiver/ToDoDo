import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";
import { useGetTodos } from "@/features/todo";
import type { Todo } from "@/features/todo";
import { toDateKeyFromISO } from "@/shared/utils/date";
import { syncTodosToCalendar, CalendarRevokedError, type SyncTodoPayload } from "../api";
import { useCalendarIntegrationStatus } from "./useCalendarIntegration";

interface SyncedSnapshotEntry {
  updatedAt: string;
  googleEventId: string | null;
}

const isSyncEligible = (todo: Todo): boolean => !!todo.dueAt && !todo.archived;

const snapshotStorageKey = (uid: string): string => `calendarSyncSnapshot:${uid}`;

const loadSnapshot = (uid: string): Map<string, SyncedSnapshotEntry> => {
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

const saveSnapshot = (uid: string, snapshot: Map<string, SyncedSnapshotEntry>): void => {
  try {
    localStorage.setItem(snapshotStorageKey(uid), JSON.stringify(Array.from(snapshot.entries())));
  } catch {
    // 위와 동일한 이유로 조용히 넘어간다 — 메모리 상의 스냅샷은 이미 최신이므로
    // 이번 세션의 동작 자체는 계속 정상이다.
  }
};

export const useSyncTodosToCalendar = (): void => {
  const { data: todos } = useGetTodos();
  const { data: integration } = useCalendarIntegrationStatus();
  const queryClient = useQueryClient();
  const snapshotRef = useRef<Map<string, SyncedSnapshotEntry>>(new Map());
  const loadedUidRef = useRef<string | null>(null);
  const isRunningRef = useRef(false);
  const pendingRerunRef = useRef(false);
  // 진행 중인 동기화가 끝난 뒤 최신 todos로 다시 돌기 위한 트리거.
  // deps에 이 값을 넣어 이펙트를 강제로 재실행시킨다(값 자체는 쓰지 않는다).
  const [runToken, setRunToken] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid && loadedUidRef.current !== uid) {
      snapshotRef.current = loadSnapshot(uid);
      loadedUidRef.current = uid;
    }

    if (!integration?.connected || integration.status === "revoked") return;
    if (!todos) return;
    if (isRunningRef.current) {
      pendingRerunRef.current = true;
      return;
    }

    const snapshot = snapshotRef.current;
    const eligible = todos.filter(isSyncEligible);
    const eligibleById = new Map(eligible.map((t) => [t.id, t]));
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

    (async () => {
      try {
        const results = await syncTodosToCalendar(batch);

        // 여기서부터는 이펙트가 재실행/언마운트됐어도 절대 건너뛰지 않는다 —
        // 구글에는 이미 이벤트가 만들어졌으므로, 그 결과를 스냅샷/Firestore에
        // 반영하지 않으면 다음 실행이 googleEventId를 몰라 중복 이벤트를
        // 만든다.
        const firestoreBatch = writeBatch(db);
        let hasWrites = false;

        results.forEach(({ id, googleEventId, error }) => {
          if (error) {
            // 스냅샷을 갱신하지 않는다 — 다음 실행(todos 변경 또는 다음 앱 진입)에서
            // updatedAt이 그대로 다르게 남아 이 항목이 다시 동기화 대상에 잡힌다.
            console.error(`캘린더 동기화 실패 (todo ${id}):`, error);
            return;
          }
          const todo = eligibleById.get(id);
          if (todo) {
            snapshot.set(id, { updatedAt: todo.updatedAt, googleEventId });
            if (todo.googleEventId !== googleEventId) {
              firestoreBatch.update(doc(db, "todos", id), { googleEventId });
              hasWrites = true;
            }
          } else {
            // 삭제 성공. 스냅샷에서는 지우되, Todo 문서 자체가 아직 존재한다면
            // (archived·dueAt 제거로 대상에서만 빠진 경우) googleEventId도
            // 같이 지운다 — 안 지우면 나중에 다시 대상이 됐을 때 이미 삭제된
            // 이벤트 id로 PATCH를 시도해 404로 계속 실패하고, 실패한 항목은
            // 스냅샷이 갱신되지 않으니 영원히 같은 오류가 반복된다.
            snapshot.delete(id);
            if (todos.some((t) => t.id === id)) {
              firestoreBatch.update(doc(db, "todos", id), { googleEventId: null });
              hasWrites = true;
            }
          }
        });

        if (uid) saveSnapshot(uid, snapshot);

        if (hasWrites) {
          await firestoreBatch.commit();
          queryClient.invalidateQueries({ queryKey: ["todos"] });
        }
      } catch (error) {
        if (error instanceof CalendarRevokedError) {
          const uid = auth.currentUser?.uid;
          if (uid) {
            await setDoc(doc(db, "calendarIntegrations", uid), { status: "revoked" }, { merge: true });
            queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
          }
        } else {
          console.error("캘린더 동기화 실패:", error);
          Sentry.captureException(error);
        }
      } finally {
        isRunningRef.current = false;
        if (pendingRerunRef.current) {
          pendingRerunRef.current = false;
          setRunToken((n) => n + 1);
        }
      }
    })();
  }, [todos, integration, queryClient, runToken]);
};
