import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../firebase";

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

/** 보관된 할 일까지 포함해 구글 캘린더에 만든 이벤트 id를 모은다. */
const collectGoogleEventIds = async (uid: string): Promise<string[]> => {
  const snapshot = await getDocs(query(collection(db, "todos"), where("userId", "==", uid)));
  return snapshot.docs
    .map((d) => d.data().googleEventId as unknown)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
};

/**
 * 탈퇴. 웹과 같은 순서: 캘린더 연동 해제 → 알림 저장소 삭제 → 결제 서버(구독 해지·데이터·계정 삭제).
 * 각 단계는 멱등이라 실패하면 처음부터 다시 부르면 된다.
 */
export const deleteAccount = async (): Promise<void> => {
  const urls = readProxyUrls();
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();

  const googleEventIds = await collectGoogleEventIds(user.uid);
  await callWorker(
    "calendar-proxy",
    urls.calendar,
    "/disconnect",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ googleEventIds }) },
    idToken,
  );
  await callWorker("reminder-proxy", urls.reminder, "/account", { method: "DELETE" }, idToken);
  await callWorker("billing-proxy", urls.billing, "/account/delete", { method: "POST" }, idToken);
};
