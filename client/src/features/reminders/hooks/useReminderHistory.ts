import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { auth } from "@/shared/lib/firebase";
import { fetchReminderHistory, markReminderHistorySeen, type ReminderHistory } from "../api/reminderProxyApi";

export const REMINDER_HISTORY_KEY = "reminderHistory";
const historyKey = (uid: string | undefined) => [REMINDER_HISTORY_KEY, uid] as const;

export const useReminderHistory = () => {
  const uid = auth.currentUser?.uid;
  const query = useQuery({
    queryKey: historyKey(uid),
    queryFn: fetchReminderHistory,
    enabled: !!uid,
    // 전역 staleTime(1분)을 따르면 탭 포커스 재조회가 건너뛰어진다. 백그라운드에서 OS 알림을
    // 받고 돌아왔을 때 배지가 바로 떠야 하므로 이 쿼리는 항상 stale로 둔다.
    staleTime: 0,
  });
  const { data } = query;
  const unreadCount = data ? data.items.filter((i) => i.sentAt > data.lastSeenAt).length : 0;
  return { data, isPending: query.isPending, isError: query.isError, refetch: query.refetch, unreadCount };
};

export const useMarkHistorySeen = () => {
  const queryClient = useQueryClient();
  const key = historyKey(auth.currentUser?.uid);
  return useMutation({
    mutationFn: (seenUntil: number) => markReminderHistorySeen(seenUntil),
    // 벨을 여는 즉시 배지가 사라져야 하므로 서버 응답을 기다리지 않고 캐시를 먼저 올린다.
    onMutate: async (seenUntil) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ReminderHistory>(key);
      if (prev) queryClient.setQueryData<ReminderHistory>(key, { ...prev, lastSeenAt: Math.max(prev.lastSeenAt, seenUntil) });
      return { prev };
    },
    // 다음에 열 때 다시 시도되는 사소한 실패라 사용자 토스트는 띄우지 않는다.
    onError: (error, _seenUntil, context) => {
      if (context?.prev) queryClient.setQueryData(key, context.prev);
      Sentry.captureException(error);
    },
  });
};
