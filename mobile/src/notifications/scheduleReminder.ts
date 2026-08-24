import * as Notifications from "expo-notifications";
import { getReminderTrigger } from "./reminderTime";

type ReminderTodo = { id: string; title: string; dueAt: string | null };

const ensurePermissionGranted = async (): Promise<boolean> => {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const { status: requestedStatus } = await Notifications.requestPermissionsAsync();
  return requestedStatus === "granted";
};

export const scheduleReminder = async (todo: ReminderTodo): Promise<string | null> => {
  const trigger = getReminderTrigger(todo.dueAt, new Date());
  if (!trigger) return null;

  const granted = await ensurePermissionGranted();
  if (!granted) return null;

  return Notifications.scheduleNotificationAsync({
    content: { title: todo.title, body: "마감 시간입니다" },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
};

export const cancelReminder = (notificationId: string): Promise<void> =>
  Notifications.cancelScheduledNotificationAsync(notificationId);
