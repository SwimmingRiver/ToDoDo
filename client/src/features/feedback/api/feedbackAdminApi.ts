import { collection, doc, getDocs, limit, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";

export type FeedbackStatus = "new" | "planned" | "done" | "wontfix";
export type FeedbackPlatform = "web" | "ios" | "android";

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "새 의견",
  planned: "반영 예정",
  done: "반영함",
  wontfix: "안 함",
};

export interface FeedbackItem {
  id: string;
  email: string | null;
  content: string;
  createdAt: string;
  platform: FeedbackPlatform;
  status: FeedbackStatus;
}

const FEEDBACK_LIST_LIMIT = 100;

/** 최신순 의견 목록. 예전 문서에 없는 필드는 기본값(web/new/null)으로 읽는다. */
export const listFeedback = async (): Promise<FeedbackItem[]> => {
  const snapshot = await getDocs(
    query(collection(db, "feedback"), orderBy("createdAt", "desc"), limit(FEEDBACK_LIST_LIMIT)),
  );
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      email: data.email ?? null,
      content: data.content,
      createdAt: data.createdAt,
      platform: data.platform ?? "web",
      status: data.status ?? "new",
    };
  });
};

export const updateFeedbackStatus = async (id: string, status: FeedbackStatus): Promise<void> => {
  await updateDoc(doc(db, "feedback", id), { status });
};
