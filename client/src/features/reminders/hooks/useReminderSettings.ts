import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import type { ReminderSetting } from "@tododo/core/dist/reminders/index.js";
import { auth } from "@/shared/lib/firebase";
import { getReminderDefault, setReminderDefault } from "../api/reminderSettingsApi";
import { requestReminderRefresh } from "../api/reminderProxyApi";

const settingsKey = (uid: string | undefined) => ["reminderSettings", uid] as const;

export const useReminderDefault = () => {
  const uid = auth.currentUser?.uid;
  return useQuery({
    queryKey: settingsKey(uid),
    queryFn: () => getReminderDefault(uid as string),
    enabled: !!uid,
  });
};

export const useSetReminderDefault = () => {
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid;
  return useMutation({
    mutationFn: (setting: ReminderSetting) => {
      if (!uid) throw new Error("Not authenticated");
      return setReminderDefault(uid, setting);
    },
    onSuccess: (_data, setting) => {
      queryClient.setQueryData(settingsKey(uid), setting);
      // 기본값이 바뀌면 예약 전체가 바뀐다. 실패해도 다음 할 일 변경 때 다시 신호가 간다.
      requestReminderRefresh().catch((error) => Sentry.captureException(error));
    },
  });
};
