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
    // 벨 메뉴는 실패를 빈 상태로 보여줘 사용자에게 드러나지 않으므로 여기서 Sentry로 보낸다
    // (전역 QueryClient엔 쿼리 실패 보고가 없다). 재시도 1회까지 시도마다 한 번씩 보고된다.
    queryFn: () =>
      fetchReminderHistory().catch((error: unknown) => {
        Sentry.captureException(error);
        throw error;
      }),
    enabled: !!uid,
    // 전역 staleTime(1분)을 따르면 탭 포커스 재조회가 건너뛰어진다. 백그라운드에서 OS 알림을
    // 받고 돌아왔을 때 배지가 바로 떠야 하므로 이 쿼리는 항상 stale로 둔다.
    staleTime: 0,
    // 기본 재시도(3회, 약 7초 백오프)면 벨을 연 뒤 재조회가 끝나기까지 너무 오래 걸린다.
    retry: 1,
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
    // 낙관적 값을 서버 값과 맞춘다. 메뉴의 attemptedSeenRef 덕에 재시도 루프는 생기지 않는다.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};
