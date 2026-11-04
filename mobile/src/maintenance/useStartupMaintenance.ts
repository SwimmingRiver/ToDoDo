import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { runStartupMaintenance } from "@tododo/core";
import { db } from "../firebase";
import { readLastSuccess, shouldRunOnForeground, writeLastSuccess } from "./maintenanceSchedule";

// 앱이 며칠씩 백그라운드에 머물 수 있어 웹처럼 "페이지 수명당 1회"로는 부족하다.
// 콜드 스타트/로그인 때 uid당 1회 + 포그라운드 복귀 시 마지막 성공 후 24시간 경과하면 재실행한다.
const claimedUids = new Set<string>();
const inFlight = new Set<string>();

export function resetStartupMaintenanceState(): void {
  claimedUids.clear();
  inFlight.clear();
}

async function run(uid: string, queryClient: QueryClient): Promise<void> {
  if (inFlight.has(uid)) return;
  inFlight.add(uid);
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

  useEffect(() => {
    if (!uid || claimedUids.has(uid)) return;
    claimedUids.add(uid);
    void run(uid, queryClient);
  }, [uid, queryClient]);

  useEffect(() => {
    if (!uid) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        const last = await readLastSuccess(uid);
        if (shouldRunOnForeground(last, Date.now())) await run(uid, queryClient);
      })();
    });
    return () => sub.remove();
  }, [uid, queryClient]);
}
