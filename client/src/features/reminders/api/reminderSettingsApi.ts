import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import {
  DEFAULT_REMINDER_SETTING,
  isReminderSetting,
  type ReminderSetting,
} from "@tododo/core/dist/reminders/index.js";

export const getReminderDefault = async (uid: string): Promise<ReminderSetting> => {
  const snap = await getDoc(doc(db, "userSettings", uid));
  const value = snap.exists() ? snap.data().reminderDefaultOffsetMinutes : undefined;
  return isReminderSetting(value) ? value : DEFAULT_REMINDER_SETTING;
};

export const setReminderDefault = (uid: string, setting: ReminderSetting): Promise<void> =>
  setDoc(doc(db, "userSettings", uid), { reminderDefaultOffsetMinutes: setting });
