import { addDoc, collection } from "firebase/firestore";
import * as Sentry from "@sentry/react";
import { auth } from "@/shared/lib/firebase";
import { db } from "@/shared/lib/firestore";

export const FEEDBACK_CONTENT_MAX_LENGTH = 1000;

const feedbackRef = collection(db, "feedback");

export const submitFeedback = async (content: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const trimmed = content.trim();
  if (!trimmed) throw new Error("피드백 내용을 입력해주세요");

  try {
    await addDoc(feedbackRef, {
      userId: user.uid,
      email: user.email,
      content: trimmed,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { feature: "feedback" } });
    throw error;
  }
};
