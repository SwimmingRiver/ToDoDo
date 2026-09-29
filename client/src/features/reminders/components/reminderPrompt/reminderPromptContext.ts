import { createContext, useContext } from "react";

/**
 * reminderPrompt.tsx(컴포넌트 파일)에 상수·훅을 같이 export하면
 * react-refresh/only-export-components에 걸리므로 별도 파일로 분리한다.
 */
export const PROMPT_SNOOZE_KEY = "tododo:reminderPromptSnoozedUntil";
export const PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export const ReminderPromptContext = createContext<{ offerReminders: () => void }>({
  offerReminders: () => {},
});

export const useReminderPrompt = () => useContext(ReminderPromptContext);

export const isPromptSnoozed = (now: number): boolean => {
  try {
    const until = localStorage.getItem(PROMPT_SNOOZE_KEY);
    return until !== null && Number(until) > now;
  } catch {
    return false;
  }
};
