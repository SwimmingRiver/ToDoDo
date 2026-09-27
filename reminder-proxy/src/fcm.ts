export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** 알림 클릭 시 열 절대 URL. 웹 푸시는 같은 origin의 HTTPS여야 한다. */
  link: string;
  todoId: string;
}

export type SendResult = "sent" | "invalidToken";

/** 재시도하면 성공할 수 있는 실패(429, 5xx). */
export class TransientFcmError extends Error {
  constructor(readonly status: number) {
    super(`FCM 일시 실패: ${status}`);
    this.name = "TransientFcmError";
  }
}

interface FcmErrorBody {
  error?: { message?: string; details?: { errorCode?: string }[] };
}

const INVALID_TOKEN_CODES = new Set(["UNREGISTERED", "SENDER_ID_MISMATCH"]);

export const sendPush = async (
  projectId: string,
  accessToken: string,
  message: PushMessage,
  fetchFn: typeof fetch = fetch,
): Promise<SendResult> => {
  const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: { todoId: message.todoId },
        webpush: { fcm_options: { link: message.link } },
      },
    }),
  });
  if (res.ok) return "sent";
  if (res.status === 429 || res.status >= 500) throw new TransientFcmError(res.status);

  const body = (await res.json().catch(() => ({}))) as FcmErrorBody;
  const errorCode = body.error?.details?.find((d) => d.errorCode)?.errorCode;
  if (res.status === 404 || (errorCode && INVALID_TOKEN_CODES.has(errorCode))) return "invalidToken";
  // INVALID_ARGUMENT는 우리 페이로드 오류일 때도 온다. 그때 토큰을 지우면 모든 기기의
  // 알림이 조용히 끊기므로, 토큰 문제라고 명시된 경우만 무효 토큰으로 본다.
  if (errorCode === "INVALID_ARGUMENT" && /registration token/i.test(body.error?.message ?? "")) {
    return "invalidToken";
  }
  throw new Error(`FCM 발송 실패 (${res.status} ${errorCode ?? ""}): ${body.error?.message ?? ""}`);
};
