import { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";
import { useGetTodos } from "@/features/todo";
import {
  planCalendarSync,
  applySyncResults,
  excludeCoolingDown,
  recordSyncFailures,
  chunkSyncBatch,
  type SyncFailureLog,
} from "@tododo/core/dist/calendarSync/index.js";
import {
  syncTodosToCalendar,
  CalendarRevokedError,
  CalendarNotConnectedError,
} from "../api";
import { useCalendarIntegrationStatus } from "./useCalendarIntegration";
import { markCalendarRevoked } from "./markCalendarRevoked";
import { loadSnapshot, saveSnapshot, clearSnapshot, type SyncSnapshot } from "./syncSnapshot";

/** Worker가 409 not_connected를 줬을 때 연동 상태를 다시 읽고, 그래도 Firestore가
 *  connected:true라면(해제가 Worker 단계 뒤 Firestore 단계에서 실패한 경우) Worker를
 *  진실로 보고 Firestore를 맞춘다 — 안 맞추면 재조회 값이 같아 이펙트가 안 돌고
 *  동기화만 조용히 영원히 멈춘다. 절대 throw하지 않는다. */
const reconcileNotConnected = async (queryClient: QueryClient): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const key = ["calendarIntegration", uid];
  try {
    await queryClient.invalidateQueries({ queryKey: key });
    const latest = queryClient.getQueryData<{ connected: boolean }>(key);
    if (!latest?.connected) return;
    console.warn("Worker에 토큰이 없는데 Firestore는 connected:true — 연동 해제로 맞춥니다");
    await setDoc(doc(db, "calendarIntegrations", uid), { connected: false, status: "active" }, { merge: true });
    queryClient.invalidateQueries({ queryKey: key });
  } catch (error) {
    console.error("연동 상태 재조정 실패:", error);
    Sentry.captureException(error);
  }
};

export const useSyncTodosToCalendar = (): void => {
  const { data: todos } = useGetTodos();
  const { data: integration } = useCalendarIntegrationStatus();
  const queryClient = useQueryClient();
  const snapshotRef = useRef<SyncSnapshot>(new Map());
  // 최근 실패 항목의 쿨다운 기록(메모리 전용, 저장 안 함). 11-21 레이트 리밋 폭주 —
  // 실패 항목은 스냅샷에 안 들어가 todos 재조회마다 즉시 재전송돼 구글 403이 88건까지
  // 쌓였다. excludeCoolingDown/recordSyncFailures 참고.
  const failuresRef = useRef<SyncFailureLog>(new Map());
  // 실패 기록이 유효한 범위(사용자·연동 상태). 바뀌면 기록을 비운다 — 다른 사용자거나
  // revoked→재연결로 토큰이 바뀌었으면 예전 실패는 더 이상 근거가 없다.
  const failureScopeRef = useRef<string | null>(null);
  const loadedUidRef = useRef<string | null>(null);
  const isRunningRef = useRef(false);
  const pendingRerunRef = useRef(false);
  // 진행 중인 동기화가 끝난 뒤 최신 todos로 다시 돌기 위한 트리거.
  // deps에 이 값을 넣어 이펙트를 강제로 재실행시킨다(값 자체는 쓰지 않는다).
  const [runToken, setRunToken] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const failureScope = `${uid ?? ""}|${integration?.connected ?? ""}|${integration?.status ?? ""}`;
    if (failureScopeRef.current !== failureScope) {
      failuresRef.current = new Map();
      failureScopeRef.current = failureScope;
    }

    if (uid && loadedUidRef.current !== uid) {
      snapshotRef.current = loadSnapshot(uid);
      loadedUidRef.current = uid;
    }

    // 연동 해제는 구글 이벤트를 지우고 Firestore googleEventId만 null로 만들 뿐
    // updatedAt은 안 바꾼다. 스냅샷을 그대로 두면 재연결 후 기존 Todo가 "변경
    // 없음"으로 걸러져 영원히 다시 올라가지 않으므로, 해제 상태를 보는 즉시
    // 메모리·localStorage 양쪽을 비운다. (revoked는 connected가 여전히 true고
    // 구글 이벤트도 남아 있으므로 해당 없음.)
    if (integration && !integration.connected) {
      snapshotRef.current = new Map();
      failuresRef.current = new Map();
      if (uid) clearSnapshot(uid);
      // 어떤 경로로 해제됐든(버튼, 타탭, 409) 이미 삭제된 구글 이벤트가 화면에
      // 유령처럼 남지 않게 이벤트 캐시도 지운다. 조회 훅은 enabled:false가
      // 될 뿐 캐시를 스스로 버리지 않는다.
      queryClient.removeQueries({ queryKey: ["googleCalendarEvents"] });
      return;
    }
    if (!integration?.connected || integration.status === "revoked") return;
    if (!todos) return;
    if (isRunningRef.current) {
      pendingRerunRef.current = true;
      return;
    }

    const snapshot = snapshotRef.current;
    // Firestore에 googleEventId가 없으면 스냅샷이 뭐라 하든 미동기화 상태다 —
    // 다른 기기에서 연동을 해제했거나 localStorage가 어긋난 경우에도 앱 진입
    // 시 스스로 복구되게 한다. 스냅샷의 옛 id로는 폴백하지 않고 Firestore의 id만
    // 쓴다: 연동 해제로 지워진 이벤트는 404가 아니라 tombstone(구글이
    // status:"cancelled"로 돌려줌)이라 옛 id로 PATCH하면 성공처럼 보이면서 캘린더엔
    // 안 나타난다. id가 null이면 Worker가 결정론적 id로 POST→409→status:"confirmed"로
    // 되살려 같은 이벤트로 수렴한다.
    const { upserts, deletes, eligibleById } = planCalendarSync(todos, snapshot);

    // 최근 실패했고 그 뒤로 수정되지 않은 항목은 쿨다운 동안 뺀다(수정되면 즉시 재시도).
    const failures = failuresRef.current;
    const batch = excludeCoolingDown([...upserts, ...deletes], eligibleById, failures, Date.now());
    if (batch.length === 0) return;

    isRunningRef.current = true;
    // existingTodoIds는 비대상(archived·dueAt 없음) 포함 전체 id여야 한다 —
    // 삭제 성공 시 아직 존재하는 Todo의 googleEventId를 null로 정리하기 위함.
    const existingTodoIds = new Set(todos.map((t) => t.id));

    (async () => {
      let wroteAny = false;
      try {
        // 한 요청에 수십 건을 몰아 보내면 Worker가 구글에 한꺼번에 쏘다 레이트 리밋에
        // 걸린다(11-21). 10건씩 나눠 앞 요청이 끝난 뒤에 다음 요청을 보낸다.
        const chunks = chunkSyncBatch(batch);
        for (const [index, chunk] of chunks.entries()) {
          // 동기화 도중 연동이 해제돼 snapshotRef가 교체됐다면 남은 묶음은 보내지 않는다.
          if (snapshotRef.current !== snapshot) break;

          let results;
          try {
            results = await syncTodosToCalendar(chunk);
          } catch (error) {
            // 요청 자체가 실패(네트워크·Worker 5xx)하면 이 묶음과 아직 안 보낸 남은 묶음을
            // 모두 쿨다운에 건다 — 안 그러면 todos 재조회마다 같은(또는 다음) 묶음을 즉시
            // 다시 보낸다. revoked/not_connected는 상태 변화 신호라 쿨다운 대상이 아니다
            // (해제 시 기록도 비워진다).
            if (!(error instanceof CalendarRevokedError) && !(error instanceof CalendarNotConnectedError)) {
              const message = error instanceof Error ? error.message : String(error);
              const unsent = chunks.slice(index).flat();
              recordSyncFailures(
                unsent,
                unsent.map((p) => ({ id: p.id, googleEventId: p.googleEventId, error: message })),
                eligibleById,
                failures,
                Date.now(),
              );
            }
            // 남은 묶음은 보내지 않는다 — 앞 묶음 결과는 이미 반영됐다.
            throw error;
          }

          // 여기서부터는 이펙트가 재실행/언마운트됐어도 절대 건너뛰지 않는다 —
          // 구글에는 이미 이벤트가 만들어졌으므로, 그 결과를 스냅샷/Firestore에
          // 반영하지 않으면 다음 실행이 googleEventId를 몰라 중복 이벤트를
          // 만든다.
          const firestoreBatch = writeBatch(db);

          results.forEach(({ id, error }) => {
            // 실패 항목은 스냅샷을 갱신하지 않아 쿨다운이 끝난 뒤(또는 수정 시) 다시 시도된다.
            if (error) console.error(`캘린더 동기화 실패 (todo ${id}):`, error);
          });
          recordSyncFailures(chunk, results, eligibleById, failures, Date.now());
          const { firestoreUpdates } = applySyncResults(results, eligibleById, existingTodoIds, snapshot);
          firestoreUpdates.forEach(({ todoId, googleEventId }) => {
            firestoreBatch.update(doc(db, "todos", todoId), { googleEventId });
          });
          const hasWrites = firestoreUpdates.length > 0;

          // 동기화 도중 연동이 해제돼 snapshotRef가 교체됐다면, 이 클로저의 옛
          // 스냅샷을 되돌려 쓰지 않는다 — 되돌려 쓰면 해제 시점의 clear가 무효가
          // 되고 재연결 후 stale id가 그대로 복원된다.
          if (uid && snapshotRef.current === snapshot) saveSnapshot(uid, snapshot);

          if (hasWrites) {
            await firestoreBatch.commit();
            wroteAny = true;
          }
        }
      } catch (error) {
        if (error instanceof CalendarRevokedError) {
          await markCalendarRevoked(queryClient);
        } else if (error instanceof CalendarNotConnectedError) {
          // 다른 탭/기기에서 이미 해제됐는데 이 탭의 연동 캐시가 stale한 경우 —
          // 오류가 아니라 상태 변화 신호다. 다시 읽으면 connected:false가 되어
          // 이 훅이 스냅샷을 비우고 멈춘다.
          await reconcileNotConnected(queryClient);
        } else {
          console.error("캘린더 동기화 실패:", error);
          Sentry.captureException(error);
        }
      } finally {
        // todos 무효화는 묶음마다가 아니라 루프가 끝난 뒤 한 번만, isRunning을 풀기 전에
        // 기다린다. 묶음마다 하면 루프 도중 재조회된 todos(뒤 묶음은 아직 googleEventId
        // null)로 끝난 뒤 재실행이 돌아 뒤 묶음을 다시 upsert했다(리뷰 I-1). 기다린 뒤에는
        // 재조회 결과가 pendingRerun으로 이어져 최신 todos로 한 번만 다시 돈다.
        if (wroteAny) {
          try {
            await queryClient.invalidateQueries({ queryKey: ["todos"] });
          } catch (error) {
            console.error("todos 재조회 실패:", error);
          }
        }
        isRunningRef.current = false;
        if (pendingRerunRef.current) {
          pendingRerunRef.current = false;
          setRunToken((n) => n + 1);
        }
      }
    })();
  }, [todos, integration, queryClient, runToken]);
};
