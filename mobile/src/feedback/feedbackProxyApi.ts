import { Platform } from "react-native";
import { auth } from "../firebase";

/** Expo는 process.env.EXPO_PUBLIC_*를 빌드 시 인라인한다. 함수 안에서 읽어 테스트가 값을 바꿀 수 있게 한다. */
const feedbackProxyUrl = (): string => process.env.EXPO_PUBLIC_FEEDBACK_PROXY_URL ?? "";

export type FeedbackErrorCode = "TOO_FREQUENT" | "UNKNOWN";

export class FeedbackError extends Error {
  code: FeedbackErrorCode;
  constructor(code: FeedbackErrorCode) {
    super(code);
    this.name = "FeedbackError";
    this.code = code;
  }
}

/**
 * 의견을 전송한다. 429만 TOO_FREQUENT로 구분하고, 설정·로그인·네트워크·그 외 응답은
 * 모두 UNKNOWN으로 바꾼다(원인은 console.warn에 남긴다).
 */
export const submitFeedback = async (content: string): Promise<void> => {
  const trimmed = content.trim();
  if (!trimmed) throw new FeedbackError("UNKNOWN");
  let res: Response;
  try {
    const baseUrl = feedbackProxyUrl();
    if (!baseUrl) throw new Error("EXPO_PUBLIC_FEEDBACK_PROXY_URL 미설정");
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    const idToken = await user.getIdToken();
    res = await fetch(`${baseUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ content: trimmed, platform: Platform.OS === "android" ? "android" : "ios" }),
    });
  } catch (error) {
    console.warn("[feedback] 요청 실패", error);
    throw new FeedbackError("UNKNOWN");
  }
  if (res.ok) return;
  console.warn("[feedback] 응답 실패", res.status);
  throw new FeedbackError(res.status === 429 ? "TOO_FREQUENT" : "UNKNOWN");
};
