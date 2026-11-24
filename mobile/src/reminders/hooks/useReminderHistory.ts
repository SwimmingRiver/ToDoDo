import { useEffect } from "react";
import { AppState } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthState } from "../../auth/useAuthState";
import { reportError } from "../../shared/lib/sentry";
import { fetchReminderHistory, markReminderHistorySeen, type ReminderHistory } from "../api/reminderProxyApi";

export const REMINDER_HISTORY_KEY = "reminderHistory";
const historyKey = (uid: string | undefined) => [REMINDER_HISTORY_KEY, uid] as const;

export const hasUnreadReminders = (history: ReminderHistory | undefined): boolean =>
  !!history && history.items.some((i) => i.sentAt > history.lastSeenAt);

export const useReminderHistory = () => {
  const { user } = useAuthState();
  const uid = user?.uid;
  return useQuery({
    queryKey: historyKey(uid),
    queryFn: () =>
      fetchReminderHistory().catch((error: unknown) => {
        reportError(error, "reminder");
        throw error;
      }),
    enabled: !!uid,
    // 헤더(벨)가 화면마다 마운트되므로 짧게 신선하게 둔다. 포그라운드 복귀 시 갱신은 TanStack focusManager가
    // 아니라(앱에 AppState 연결이 없다) useRefreshHistoryOnForeground가 무효화로 한다. 포그라운드 수신은 useForegroundReminders가 다시 불러온다.
    staleTime: 30_000,
    retry: 1,
  });
};

export const useMarkHistorySeen = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthState();
  const key = historyKey(user?.uid);
  return useMutation({
    mutationFn: (seenUntil: number) => markReminderHistorySeen(seenUntil),
    // 화면을 여는 즉시 배지가 사라지도록 서버 응답 전에 캐시를 먼저 올린다.
    onMutate: async (seenUntil) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ReminderHistory>(key);
      if (prev) queryClient.setQueryData<ReminderHistory>(key, { ...prev, lastSeenAt: Math.max(prev.lastSeenAt, seenUntil) });
      return { prev };
    },
    onError: (error, _seenUntil, context) => {
      if (context?.prev) queryClient.setQueryData(key, context.prev);
      reportError(error, "reminder");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};

/** 백그라운드에서 푸시를 받고 돌아왔을 때 배지가 바로 뜨도록, 앱이 active가 되면 기록을 무효화한다. */
export const useRefreshHistoryOnForeground = (): void => {
  const queryClient = useQueryClient();
  const { user } = useAuthState();
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void queryClient.invalidateQueries({ queryKey: historyKey(uid) });
    });
    return () => sub.remove();
  }, [queryClient, uid]);
};
