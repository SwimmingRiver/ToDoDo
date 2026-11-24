import * as Sentry from "@sentry/react";
import { authorizedFetch } from "@/shared/lib/authorizedFetch";

export type FeedbackErrorCode = "TOO_FREQUENT" | "UNKNOWN";

export class FeedbackError extends Error {
  readonly code: FeedbackErrorCode;

  constructor(code: FeedbackErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "FeedbackError";
  }
}

/** 의견을 feedback-proxy Worker로 보낸다. 저장·알림은 Worker가 맡는다. */
export const submitFeedback = async (content: string): Promise<void> => {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("피드백 내용을 입력해주세요");

  const proxyUrl = (import.meta.env.VITE_FEEDBACK_PROXY_URL as string | undefined) ?? "";
  // 주소가 없으면 "undefined/feedback"으로 보내지 않고 설정 누락을 바로 알린다.
  if (!proxyUrl) {
    const error = new FeedbackError("UNKNOWN", "feedback-proxy 주소 미설정(VITE_FEEDBACK_PROXY_URL)");
    Sentry.captureException(error, { tags: { feature: "feedback" } });
    throw error;
  }

  let res: Response;
  try {
    res = await authorizedFetch(
      proxyUrl,
      "/feedback",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, platform: "web" }),
      },
    );
  } catch (error) {
    // 미인증·네트워크 실패
    Sentry.captureException(error, { tags: { feature: "feedback" } });
    throw new FeedbackError("UNKNOWN", error instanceof Error ? error.message : undefined);
  }

  // 429는 예상된 오류라 캡처하지 않는다
  if (res.status === 429) throw new FeedbackError("TOO_FREQUENT");
  if (!res.ok) {
    const error = new FeedbackError("UNKNOWN", `feedback-proxy ${res.status}`);
    Sentry.captureException(error, { tags: { feature: "feedback" } });
    throw error;
  }
};
