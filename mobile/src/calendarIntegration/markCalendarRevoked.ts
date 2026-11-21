import type { QueryClient } from "@tanstack/react-query";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

/** Worker가 리프레시 토큰 철회(401 revoked)를 알려왔을 때 연동 상태를 revoked로 기록한다.
 *  이 값이 바뀌어야 동기화/이벤트 조회 훅이 멈추고(`enabled` 조건), 연결 버튼이
 *  "다시 연결" 안내로 전환된다. sync·events 양쪽 경로가 같은 전이를 일으켜야 해서 한곳에 둔다.
 *
 *  절대 throw하지 않는다 — Worker는 철회를 감지하면 토큰을 지우고 401을 "딱 한 번"만 주므로
 *  (다음 호출부턴 토큰이 없어 200 빈 응답), 여기서 던진 FirestoreError가 원래의
 *  CalendarRevokedError를 대체하면 호출부가 재시도로 흘러 성공해버리고 revoked 신호는
 *  영구히 유실된다. 앱에는 Sentry가 없어 console.warn으로만 남긴다. */
export const markCalendarRevoked = async (queryClient: QueryClient): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await setDoc(doc(db, "calendarIntegrations", uid), { status: "revoked" }, { merge: true });
    queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
  } catch (error) {
    console.warn("[calendar] revoked 상태 기록 실패", error);
  }
};
