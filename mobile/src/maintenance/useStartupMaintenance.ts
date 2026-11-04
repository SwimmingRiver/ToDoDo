import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { runStartupMaintenance } from "@tododo/core";
import { db } from "../firebase";
import {
  MAINTENANCE_RETRY_MIN_MS,
  readLastSuccess,
  shouldRunOnForeground,
  writeLastSuccess,
} from "./maintenanceSchedule";

// 앱이 며칠씩 백그라운드에 머물 수 있어 웹처럼 "페이지 수명당 1회"로는 부족하다.
// 콜드 스타트/로그인 때 uid당 1회 + 포그라운드 복귀 시 마지막 성공 후 24시간 경과하면 재실행한다.
const claimedUids = new Set<string>();
const inFlight = new Set<string>();
// 성공 여부와 무관한 마지막 시도 시각(메모리). 포그라운드 재시도 최소 간격 판단용이다.
const lastAttempt = new Map<string, number>();

export function resetStartupMaintenanceState(): void {
  claimedUids.clear();
  inFlight.clear();
  lastAttempt.clear();
}

async function run(uid: string, queryClient: QueryClient): Promise<void> {
  if (inFlight.has(uid)) return;
  inFlight.add(uid);
  lastAttempt.set(uid, Date.now());
  try {
    const { written, failedSweeps } = await runStartupMaintenance(db, uid, {
      onSweepError: (e, s) => console.error(`앱 진입 유지보수 실패 (${s}):`, e),
    });
    if (failedSweeps.length === 0) {
      try {
        await writeLastSuccess(uid, Date.now());
      } catch (e) {
        console.error("앱 진입 유지보수 시각 기록 실패:", e);
      }
    }
    if (written > 0) {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    }
  } catch (e) {
    console.error("앱 진입 유지보수 실패:", e);
  } finally {
    inFlight.delete(uid);
  }
}

export function useStartupMaintenance(uid: string | null): void {
  const queryClient = useQueryClient();
  const prevUid = useRef<string | null>(null);

  // 로그아웃(uid -> null) 때만 claim을 풀어 같은 계정 재로그인 시 다시 실행한다.
  // 로그인 상태 그대로의 언마운트/재마운트나 a -> b 전환에서는 풀지 않는다.
  useEffect(() => {
    if (uid === null && prevUid.current !== null) claimedUids.delete(prevUid.current);
    prevUid.current = uid;
  }, [uid]);

  useEffect(() => {
    if (!uid || claimedUids.has(uid)) return;
    claimedUids.add(uid);
    void run(uid, queryClient);
  }, [uid, queryClient]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        const attempted = lastAttempt.get(uid);
        if (attempted !== undefined && Date.now() - attempted < MAINTENANCE_RETRY_MIN_MS) return;
        const last = await readLastSuccess(uid);
        if (cancelled) return;
        if (shouldRunOnForeground(last, Date.now())) await run(uid, queryClient);
      })();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [uid, queryClient]);
}
