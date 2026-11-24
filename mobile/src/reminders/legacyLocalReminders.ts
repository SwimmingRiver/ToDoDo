import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

const FLAG_KEY = "tododo:legacyLocalRemindersCleared";

/**
 * 서버 푸시로 옮기기 전 앱이 기기에 예약해 둔 로컬 마감 알림을 한 번만 모두 취소한다.
 * 지우지 않으면 푸시와 함께 이중으로 울린다. 실패하면 표시를 남기지 않아 다음 실행에 다시 시도한다.
 */
export const cancelLegacyLocalRemindersOnce = async (): Promise<void> => {
  if (await AsyncStorage.getItem(FLAG_KEY)) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem(FLAG_KEY, "1");
};
