import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  DEFAULT_REMINDER_SETTING,
  isReminderSetting,
  type ReminderSetting,
} from "@tododo/core/dist/reminders/index.js";
import { db } from "../../firebase";

export const getReminderDefault = async (uid: string): Promise<ReminderSetting> => {
  const snap = await getDoc(doc(db, "userSettings", uid));
  const value = snap.exists() ? snap.data().reminderDefaultOffsetMinutes : undefined;
  return isReminderSetting(value) ? value : DEFAULT_REMINDER_SETTING;
};

/** merge: userSettings의 다른 필드(테마 등)를 지우지 않는다. */
export const setReminderDefault = (uid: string, value: ReminderSetting): Promise<void> =>
  setDoc(doc(db, "userSettings", uid), { reminderDefaultOffsetMinutes: value }, { merge: true });
