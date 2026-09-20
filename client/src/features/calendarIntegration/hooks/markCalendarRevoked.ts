import type { QueryClient } from "@tanstack/react-query";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";

/** Worker가 리프레시 토큰 철회(401 revoked)를 알려왔을 때 연동 상태를
 *  revoked로 기록한다. 이 값이 바뀌어야 동기화/이벤트 조회 훅이 멈추고
 *  (`enabled` 조건), 연결 버튼이 "다시 연결" 안내로 전환된다. sync 경로와
 *  events 경로 양쪽에서 같은 전이를 일으켜야 하므로 한곳에 둔다. */
export const markCalendarRevoked = async (queryClient: QueryClient): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(doc(db, "calendarIntegrations", uid), { status: "revoked" }, { merge: true });
  queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
};
