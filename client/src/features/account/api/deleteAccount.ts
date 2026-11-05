import { collection, getDocs, query, where } from "firebase/firestore";
import { auth } from "@/shared/lib/firebase";
import { db } from "@/shared/lib/firestore";
import { disconnectCalendar } from "@/features/calendarIntegration/api";
import { findOrphanGoogleEventIds, loadSnapshot } from "@/features/calendarIntegration/hooks/syncSnapshot";
import { deleteReminderAccount } from "@/features/reminders/api/reminderProxyApi";
import { deleteAccountOnServer } from "@/features/billing/api/billingApi";

/** 보관된 할 일까지 포함해 구글에 만든 이벤트 id를 모은다. 스냅샷에만 남은 고아 이벤트도 같이 지운다. */
const collectGoogleEventIds = async (uid: string): Promise<string[]> => {
  const snapshot = await getDocs(query(collection(db, "todos"), where("userId", "==", uid)));
  const tracked = snapshot.docs
    .map((d) => d.data().googleEventId as unknown)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...tracked, ...findOrphanGoogleEventIds(loadSnapshot(uid), tracked)];
};

/** 탈퇴 진행 단계. 화면이 "지금 무엇을 하는 중인지" 보여주는 데 쓴다. */
export type AccountDeletionStep = "calendar" | "reminders" | "account";

/**
 * 탈퇴. 각 단계는 멱등이라 실패하면 처음부터 다시 부르면 된다.
 * 서버 계정 삭제(마지막)가 끝나기 전까지는 ID 토큰이 유효하므로 앞 단계 재시도가 항상 가능하다.
 * 캘린더 연동이 없어도 /disconnect는 성공한다 — 연동 여부(프리미엄 전용 문서)를 미리 읽지 않는 이유.
 * onStep은 각 단계를 시작하기 직전에 불린다.
 */
export const deleteAccount = async (onStep?: (step: AccountDeletionStep) => void): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  onStep?.("calendar");
  await disconnectCalendar(await collectGoogleEventIds(uid));
  onStep?.("reminders");
  await deleteReminderAccount();
  onStep?.("account");
  await deleteAccountOnServer();
};
