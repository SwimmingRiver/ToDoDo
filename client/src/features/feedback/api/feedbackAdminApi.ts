import { collection, doc, getDocs, limit, orderBy, query, startAfter, updateDoc, type QueryConstraint } from "firebase/firestore";
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

export interface FeedbackPage {
  items: FeedbackItem[];
  /** 다음 페이지 조회용 커서(마지막 항목의 createdAt). 더 없으면 null. */
  nextCursor: string | null;
}

/**
 * 최신순 의견 목록 한 페이지. 예전 문서에 없는 필드는 기본값(web/new/null)으로 읽는다.
 * status로 서버 필터하면 status 없는 옛 문서가 빠지므로 createdAt 커서로만 페이지를 넘긴다.
 */
export const listFeedback = async (cursor?: string): Promise<FeedbackPage> => {
  const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
  if (cursor) constraints.push(startAfter(cursor));
  const snapshot = await getDocs(query(collection(db, "feedback"), ...constraints, limit(FEEDBACK_LIST_LIMIT)));
  const items = snapshot.docs.map((d) => {
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
  const isFull = items.length >= FEEDBACK_LIST_LIMIT;
  return { items, nextCursor: isFull ? items[items.length - 1].createdAt : null };
};

export const updateFeedbackStatus = async (id: string, status: FeedbackStatus): Promise<void> => {
  await updateDoc(doc(db, "feedback", id), { status });
};
