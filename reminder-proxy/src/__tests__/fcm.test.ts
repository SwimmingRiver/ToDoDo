import { describe, it, expect, vi } from "vitest";
import { sendPush, TransientFcmError, type PushMessage } from "../fcm";

const message: PushMessage = {
  token: "tok-1",
  title: "보고서",
  body: "30분 후 마감이에요",
  link: "https://app.example.com/todo/t1",
  todoId: "t1",
};
const fcmError = (status: number, errorCode: string, msg = "x") =>
  new Response(
    JSON.stringify({
      error: {
        code: status,
        message: msg,
        details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }],
      },
    }),
    { status },
  );

describe("sendPush", () => {
  it("FCM v1 형식으로 보내고 2xx면 sent", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendPush("p1", "access", message, fetchFn as unknown as typeof fetch)).toBe("sent");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/p1/messages:send");
    expect(init.headers.Authorization).toBe("Bearer access");
    expect(JSON.parse(init.body)).toEqual({
      message: {
        token: "tok-1",
        notification: { title: "보고서", body: "30분 후 마감이에요" },
        data: { todoId: "t1" },
        webpush: { fcm_options: { link: "https://app.example.com/todo/t1" } },
      },
    });
  });

  it.each([
    ["404 UNREGISTERED", fcmError(404, "UNREGISTERED")],
    ["403 SENDER_ID_MISMATCH", fcmError(403, "SENDER_ID_MISMATCH")],
    [
      "400 잘못된 토큰",
      fcmError(400, "INVALID_ARGUMENT", "The registration token is not a valid FCM registration token"),
    ],
  ])("%s면 invalidToken", async (_label, response) => {
    const fetchFn = vi.fn().mockResolvedValue(response);
    expect(await sendPush("p1", "a", message, fetchFn as unknown as typeof fetch)).toBe("invalidToken");
  });

  it.each([429, 500, 503])("%i면 TransientFcmError", async (status) => {
    const fetchFn = vi.fn().mockResolvedValue(fcmError(status, "UNAVAILABLE"));
    await expect(sendPush("p1", "a", message, fetchFn as unknown as typeof fetch)).rejects.toBeInstanceOf(
      TransientFcmError,
    );
  });

  it("토큰 문제가 아닌 400(우리 페이로드 오류)은 토큰을 지우지 않도록 일반 Error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(fcmError(400, "INVALID_ARGUMENT", "Invalid JSON payload"));
    const promise = sendPush("p1", "a", message, fetchFn as unknown as typeof fetch);
    await expect(promise).rejects.toThrow("400");
    await expect(promise).rejects.not.toBeInstanceOf(TransientFcmError);
  });
});
