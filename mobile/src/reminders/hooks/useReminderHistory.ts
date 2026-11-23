import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";
import { useAuthState } from "../../auth/useAuthState";
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
        Sentry.captureException(error);
        throw error;
      }),
    enabled: !!uid,
    // 백그라운드에서 푸시를 받고 돌아왔을 때 배지가 바로 떠야 하므로 항상 stale로 둔다.
    staleTime: 0,
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
      Sentry.captureException(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};
