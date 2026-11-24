import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../firebase";
import { needsAppleRevoke, revokeAppleSignIn } from "../auth/appleSignIn";
import { clearSnapshot, findOrphanGoogleEventIds, loadSnapshot } from "../calendarIntegration/snapshotStorage";
import { disconnectInChunks } from "@tododo/core/dist/calendarSync/index.js";
import { isUserCancelledSignIn } from "@tododo/core/dist/auth/index.js";
import { reportError } from "../shared/lib/sentry";
import {
  releaseDeviceTokenForDeletedAccount,
  resetPushReleaseLatch,
  syncPushToken,
} from "../reminders/push/pushClient";

/** Apple 토큰 해지 단계에서 실패했다 — 아직 아무것도 지우지 않았다는 뜻이라 화면이 다른 문구를 띄운다. */
export class AppleRevokeError extends Error {
  constructor(readonly cause: unknown) {
    super(`Apple 토큰 해지 실패: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "AppleRevokeError";
  }
}

// 창을 닫은 취소 오류는 그대로 던진다(화면이 code로 조용히 넘긴다).
const revokeAppleOrThrow = async (user: Parameters<typeof revokeAppleSignIn>[0]) => {
  try {
    await revokeAppleSignIn(user);
  } catch (error) {
    if (isUserCancelledSignIn((error as { code?: unknown } | null)?.code)) throw error;
    throw new AppleRevokeError(error);
  }
};

/** Expo는 process.env.EXPO_PUBLIC_*를 빌드 시 인라인한다. 함수 안에서 읽어 테스트가 값을 바꿀 수 있게 한다. */
const readProxyUrls = () => {
  const urls = {
    EXPO_PUBLIC_CALENDAR_PROXY_URL: process.env.EXPO_PUBLIC_CALENDAR_PROXY_URL ?? "",
    EXPO_PUBLIC_REMINDER_PROXY_URL: process.env.EXPO_PUBLIC_REMINDER_PROXY_URL ?? "",
    EXPO_PUBLIC_BILLING_PROXY_URL: process.env.EXPO_PUBLIC_BILLING_PROXY_URL ?? "",
  };
  const missing = Object.entries(urls).filter(([, value]) => !value).map(([key]) => key);
  // 하나라도 없으면 시작하지 않는다 — 일부만 지운 채 "성공"으로 끝나면 안 된다.
  if (missing.length > 0) throw new Error(`탈퇴 서버 주소 미설정: ${missing.join(", ")}`);
  return {
    calendar: urls.EXPO_PUBLIC_CALENDAR_PROXY_URL,
    reminder: urls.EXPO_PUBLIC_REMINDER_PROXY_URL,
    billing: urls.EXPO_PUBLIC_BILLING_PROXY_URL,
  };
};

const callWorker = async (name: string, baseUrl: string, path: string, init: RequestInit, idToken: string) => {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error(`${name} ${path} 실패 (${res.status})`);
};

/** 보관된 할 일까지 포함해 구글 캘린더에 만든 이벤트 id를 모은다. 웹과 같이 이 기기 동기화
 *  스냅샷에만 남은 고아 id(할 일은 지웠는데 구글 삭제가 일시 실패한 경우)도 합친다 — 빠뜨리면
 *  탈퇴 뒤엔 추적할 길이 없어 구글 캘린더에 영원히 남는다. loadSnapshot은 throw하지 않는다. */
const collectGoogleEventIds = async (uid: string): Promise<string[]> => {
  const todosSnapshot = await getDocs(query(collection(db, "todos"), where("userId", "==", uid)));
  const tracked = todosSnapshot.docs
    .map((d) => d.data().googleEventId as unknown)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const orphans = findOrphanGoogleEventIds(await loadSnapshot(uid), tracked);
  return [...new Set([...tracked, ...orphans])];
};

/**
 * 탈퇴. 웹과 같은 순서: (Apple 사용자면 토큰 해지) → 캘린더 연동 해제 → (기기 FCM 토큰 삭제) 알림 저장소 삭제 → 결제 서버(구독 해지·데이터·계정 삭제).
 * 각 단계는 멱등이라 실패하면 처음부터 다시 부르면 된다.
 */
export const deleteAccount = async (): Promise<void> => {
  const urls = readProxyUrls();
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  // Apple 토큰부터 해지한다 — 실패하거나 창을 닫으면 아무것도 지우지 않고 멈춘다.
  if (needsAppleRevoke(user)) await revokeAppleOrThrow(user);
  const idToken = await user.getIdToken();

  const googleEventIds = await collectGoogleEventIds(user.uid);
  // Worker(무료 플랜)는 요청당 서브리퀘스트가 50개라 10개씩 나눠 지운다. 마지막 요청 전까지는
  // keepToken:true로 토큰을 남기고 마지막 요청에서 토큰까지 지운다 — 중간에 실패하면 여기서
  // throw해 다음 단계로 가지 않는다(토큰이 남아 있어 처음부터 다시 시도할 수 있다).
  await disconnectInChunks(googleEventIds, async (chunk, keepToken) => {
    await callWorker(
      "calendar-proxy",
      urls.calendar,
      "/disconnect",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keepToken ? { googleEventIds: chunk, keepToken: true } : { googleEventIds: chunk }),
      },
      idToken,
    );
    // 탈퇴는 삭제 확인 id로 Firestore를 정리하지 않는다(계정 데이터가 통째로 지워진다).
    return { deletedGoogleEventIds: [] };
  });
  // 기기 FCM 토큰은 알림 저장소를 지우기 전에, 동기화와 같은 pushClient 큐에서 지운다. 래치가 걸려
  // 이후 이 uid의 동기화(onTokenRefresh·권한 이벤트)는 등록하지 않으므로, 도는 동기화가 DELETE /account
  // 뒤에 끝나 삭제된 계정의 DO에 토큰을 다시 넣을 틈이 없다. 다음 계정이 같은 토큰을 받지도 않는다.
  // 실패해도 탈퇴는 진행한다(서버 쪽 토큰은 DELETE /account가 계정째 지운다).
  try {
    await releaseDeviceTokenForDeletedAccount(user.uid);
  } catch (error) {
    reportError(error, "reminder");
  }
  try {
    await callWorker("reminder-proxy", urls.reminder, "/account", { method: "DELETE" }, idToken);
    await callWorker("billing-proxy", urls.billing, "/account/delete", { method: "POST" }, idToken);
  } catch (error) {
    // 계정이 남아 사용자는 계속 로그인 상태다. 래치를 풀고 지운 토큰을 다시 등록한다(재시도하면 다시 건다).
    resetPushReleaseLatch();
    syncPushToken(user.uid).catch((syncError) => reportError(syncError, "reminder"));
    throw error;
  }
  await clearSnapshot(user.uid);
};
