import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as Notifications from "expo-notifications";
import { signOut as firebaseSignOut } from "firebase/auth";
import type { QueryClient } from "@tanstack/react-query";
import { auth } from "../firebase";

/**
 * 로그아웃. 실제로 세션을 끊는 건 firebase signOut 하나뿐이라 그것만 실패를 밖으로 던지고,
 * 나머지 정리 단계는 실패해도 로그아웃을 막지 않는다.
 *
 * - 예약 알림 취소: 로컬 알림은 기기 단위라, 지우지 않으면 다음에 로그인한 사람에게 앞 사람의
 *   마감 알림이 울린다.
 * - 구글 로그아웃: 하지 않으면 다음 로그인에서 계정 선택 없이 같은 구글 계정으로 바로 들어간다.
 * - 캐시 비우기: firebase signOut 이후에 해야 한다. 먼저 비우면 아직 로그인 상태인 화면의
 *   쿼리가 즉시 다시 불러온다. 반대로 signOut이 실패했으면 화면이 그대로이므로 비우지 않는다.
 */
export const signOut = async (queryClient: QueryClient) => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.warn("예약 알림 취소 실패:", error);
  }

  try {
    await GoogleSignin.signOut();
  } catch (error) {
    console.warn("구글 로그아웃 실패:", error);
  }

  await firebaseSignOut(auth);
  queryClient.clear();
};
