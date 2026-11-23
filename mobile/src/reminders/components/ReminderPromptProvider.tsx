import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_REMINDER_SETTING, reminderSettingLabel } from "@tododo/core/dist/reminders/index.js";
import { useAuthState } from "../../auth/useAuthState";
import { reportError } from "../../shared/lib/sentry";
import { useReminderDefault } from "../hooks/useReminderSettings";
import { enablePushOnThisDevice, getPushPermission } from "../push/pushClient";

/** "나중에"를 누른 시각(ms). 이 시각부터 PROMPT_SNOOZE_MS 동안 다시 묻지 않는다. */
export const PROMPT_SNOOZE_KEY = "tododo:reminderPromptSnoozedAt";
/** 웹 reminderPromptContext.ts의 PROMPT_SNOOZE_MS와 같은 값(7일). */
export const PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type ReminderPromptValue = { maybePrompt: () => void };

const ReminderPromptContext = createContext<ReminderPromptValue>({ maybePrompt: () => {} });

/** 마감 있는 할 일을 저장한 직후 호출한다. 띄울지 말지는 Provider가 판단한다. */
export const useReminderPrompt = (): ReminderPromptValue => useContext(ReminderPromptContext);

const isSnoozed = async (now: number): Promise<boolean> => {
  try {
    const snoozedAt = await AsyncStorage.getItem(PROMPT_SNOOZE_KEY);
    return snoozedAt !== null && now - Number(snoozedAt) < PROMPT_SNOOZE_MS;
  } catch {
    // 저장소를 못 읽으면 물어본다. 최악의 경우 한 번 더 묻는 것뿐이다.
    return false;
  }
};

/**
 * 시스템 권한 요청은 iOS에서 한 번 거절하면 앱 안에서 다시 띄울 수 없다. 그래서 맥락이 분명한
 * 순간(마감 있는 할 일 저장 직후)에 앱 안의 안내를 먼저 거친다(웹 reminderPrompt와 같은 흐름·문구).
 * 폼 화면은 저장 직후 goBack으로 닫히므로, 화면의 자식이 아니라 RootNavigator 로그인 분기에 둔다.
 */
export const ReminderPromptProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuthState();
  const uid = user?.uid;
  const { data: reminderDefault = DEFAULT_REMINDER_SETTING } = useReminderDefault();
  // 권한 확인·스누즈 확인이 비동기라, 연달아 호출돼도 안내가 겹쳐 뜨지 않게 막는다.
  // 안내가 떠 있는 동안에도 유지하고, 버튼을 누르면 푼다.
  const activeRef = useRef(false);

  const snooze = useCallback(() => {
    AsyncStorage.setItem(PROMPT_SNOOZE_KEY, String(Date.now())).catch(() => {
      // 저장하지 못하면 다음 저장 때 다시 물을 뿐이다.
    });
  }, []);

  const enable = useCallback(async () => {
    if (!uid) return;
    try {
      await enablePushOnThisDevice(uid);
    } catch (error) {
      reportError(error, "reminder");
    }
  }, [uid]);

  const maybePrompt = useCallback(() => {
    if (activeRef.current) return;
    if (reminderDefault === "off") return;
    activeRef.current = true;
    const label = reminderSettingLabel(reminderDefault);
    void (async () => {
      let shown = false;
      try {
        if ((await getPushPermission()) !== "undetermined") return;
        if (await isSnoozed(Date.now())) return;
        shown = true;
        Alert.alert(
          "마감 알림",
          `마감 ${label}에 알려드릴까요?`,
          [
            {
              text: "나중에",
              style: "cancel",
              onPress: () => {
                activeRef.current = false;
                snooze();
              },
            },
            {
              text: "켜기",
              onPress: async () => {
                activeRef.current = false;
                await enable();
              },
            },
          ],
        );
      } catch (error) {
        reportError(error, "reminder");
      } finally {
        if (!shown) activeRef.current = false;
      }
    })();
  }, [reminderDefault, snooze, enable]);

  const value = useMemo(() => ({ maybePrompt }), [maybePrompt]);

  return <ReminderPromptContext.Provider value={value}>{children}</ReminderPromptContext.Provider>;
};
