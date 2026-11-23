import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as Notifications from "expo-notifications";
import { signOut as firebaseSignOut } from "firebase/auth";
import type { QueryClient } from "@tanstack/react-query";
import { auth } from "../firebase";
import { disablePushOnThisDevice } from "../reminders/push/pushClient";
import { reportError } from "../shared/lib/sentry";

/**
 * 로그아웃. 실제로 세션을 끊는 건 firebase signOut 하나뿐이라 그것만 실패를 밖으로 던지고,
 * 나머지 정리 단계는 실패해도 로그아웃을 막지 않는다.
 *
 * - 예약 알림 취소: 로컬 알림은 기기 단위라, 지우지 않으면 다음에 로그인한 사람에게 앞 사람의
 *   마감 알림이 울린다.
 * - 푸시 토큰 해제: 서버 삭제에 ID 토큰이 필요해 firebase signOut 전에 한다. 끝나지 않은 단계는
 *   해제 대기로 남아 다음 토큰 동기화가 등록 전에 처리한다. 최대 5초만 기다린다.
 * - 구글 로그아웃: 하지 않으면 다음 로그인에서 계정 선택 없이 같은 구글 계정으로 바로 들어간다.
 * - 캐시 비우기: firebase signOut 이후에 해야 한다. 먼저 비우면 아직 로그인 상태인 화면의
 *   쿼리가 즉시 다시 불러온다. 반대로 signOut이 실패했으면 화면이 그대로이므로 비우지 않는다.
 */
/** 네트워크가 나쁘면 해제가 끝나지 않을 수 있다. 해제 대기는 네트워크 단계 전에 저장되므로 기다리지 않고 넘어가도 다음 동기화가 마무리한다. */
const PUSH_RELEASE_TIMEOUT_MS = 5000;

const releasePushWithTimeout = async (uid: string): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`푸시 토큰 해제 시간 초과 (${PUSH_RELEASE_TIMEOUT_MS}ms)`)), PUSH_RELEASE_TIMEOUT_MS);
  });
  try {
    await Promise.race([disablePushOnThisDevice(uid), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

export const signOut = async (queryClient: QueryClient) => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    reportError(error, "auth");
  }

  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      await releasePushWithTimeout(uid);
    } catch (error) {
      reportError(error, "reminder");
    }
  }

  try {
    await GoogleSignin.signOut();
  } catch (error) {
    // 구글 세션이 이미 없을 때도 나는 무해한 실패라 Sentry로 보내지 않는다.
    console.warn("구글 로그아웃 실패:", error);
  }

  await firebaseSignOut(auth);
  queryClient.clear();
};
