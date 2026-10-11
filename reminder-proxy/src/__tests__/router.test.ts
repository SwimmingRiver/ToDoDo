import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRequest } from "../router";
import type { Env } from "../env";

vi.mock("@tododo/worker-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tododo/worker-auth")>()),
  verifyFirebaseIdToken: vi.fn(),
}));
import { verifyFirebaseIdToken } from "@tododo/worker-auth";

const stub = {
  registerToken: vi.fn(async () => {}),
  unregisterToken: vi.fn(async () => {}),
  requestRefresh: vi.fn(async () => {}),
  getHistory: vi.fn(async () => ({
    items: [{ todoId: "t1", title: "보고서", offsetMinutes: 30, dueAt: "2026-10-01T01:00:00.000Z", sentAt: 1 }],
    lastSeenAt: 0,
  })),
  markHistorySeen: vi.fn(async () => {}),
  deleteAccount: vi.fn(async () => {}),
};
const env = {
  REMINDER_SCHEDULER: {
    idFromName: vi.fn((name: string) => `id:${name}`),
    get: vi.fn(() => stub),
  },
  FIREBASE_PROJECT_ID: "tododo-test",
  CLIENT_APP_URL: "https://app.example.com",
  GOOGLE_SERVICE_ACCOUNT: "{}",
} as unknown as Env;

const req = (method: string, path: string, body?: unknown, origin = "https://app.example.com") =>
  new Request(`https://reminder.example.com${path}`, {
    method,
    headers: { Authorization: "Bearer valid", "Content-Type": "application/json", Origin: origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "u1", premium: false, premiumUntil: null });
});

describe("handleRequest", () => {
  it("POST /push-tokens → uid의 DO에 등록, 204 + CORS", async () => {
    const res = await handleRequest(req("POST", "/push-tokens", { token: "tok", platform: "web" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(env.REMINDER_SCHEDULER.idFromName).toHaveBeenCalledWith("u1");
    expect(stub.registerToken).toHaveBeenCalledWith("u1", "tok", "web");
  });

  it("DELETE /push-tokens → 해제 204", async () => {
    const res = await handleRequest(req("DELETE", "/push-tokens", { token: "tok" }), env);
    expect(res.status).toBe(204);
    expect(stub.unregisterToken).toHaveBeenCalledWith("u1", "tok");
  });

  it("POST /reminders/refresh → 202", async () => {
    const res = await handleRequest(req("POST", "/reminders/refresh"), env);
    expect(res.status).toBe(202);
    expect(stub.requestRefresh).toHaveBeenCalledWith("u1");
  });

  it("프리미엄이 아니어도 된다(무료 기능)", async () => {
    const res = await handleRequest(req("POST", "/reminders/refresh"), env);
    expect(res.status).toBe(202);
  });

  it("토큰이 무효면 401, DO를 건드리지 않는다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    const res = await handleRequest(req("POST", "/reminders/refresh"), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(stub.requestRefresh).not.toHaveBeenCalled();
  });

  it.each([
    [{ platform: "web" }],
    [{ token: "", platform: "web" }],
    [{ token: "x".repeat(4097), platform: "web" }],
    [{ token: "tok", platform: "ios" }],
    ["not json"],
  ])("잘못된 등록 본문 %j → 400", async (body) => {
    const res = await handleRequest(req("POST", "/push-tokens", body), env);
    expect(res.status).toBe(400);
    expect(stub.registerToken).not.toHaveBeenCalled();
  });

  it("GET /reminders/history → uid의 기록을 JSON으로, CORS 포함", async () => {
    const res = await handleRequest(req("GET", "/reminders/history"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(stub.getHistory).toHaveBeenCalledWith("u1");
    expect(await res.json()).toEqual({
      items: [{ todoId: "t1", title: "보고서", offsetMinutes: 30, dueAt: "2026-10-01T01:00:00.000Z", sentAt: 1 }],
      lastSeenAt: 0,
    });
  });

  it("POST /reminders/history/seen → 204", async () => {
    const res = await handleRequest(req("POST", "/reminders/history/seen", { seenUntil: 123 }), env);
    expect(res.status).toBe(204);
    expect(stub.markHistorySeen).toHaveBeenCalledWith("u1", 123);
  });

  it.each([[{}], [{ seenUntil: "123" }], [{ seenUntil: -1 }], [{ seenUntil: null }], ["not json"]])(
    "잘못된 seen 본문 %j → 400",
    async (body) => {
      const res = await handleRequest(req("POST", "/reminders/history/seen", body), env);
      expect(res.status).toBe(400);
      expect(stub.markHistorySeen).not.toHaveBeenCalled();
    },
  );

  it("기록 조회도 토큰이 무효면 401", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    const res = await handleRequest(req("GET", "/reminders/history"), env);
    expect(res.status).toBe(401);
    expect(stub.getHistory).not.toHaveBeenCalled();
  });

  it("DELETE /account → uid의 DO 저장소를 비우고 204 + CORS", async () => {
    const res = await handleRequest(req("DELETE", "/account"), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(env.REMINDER_SCHEDULER.idFromName).toHaveBeenCalledWith("u1");
    expect(stub.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it("DELETE /account도 토큰이 무효면 401이고 DO를 건드리지 않는다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    const res = await handleRequest(req("DELETE", "/account"), env);
    expect(res.status).toBe(401);
    expect(stub.deleteAccount).not.toHaveBeenCalled();
  });

  it("POST /account는 404", async () => {
    const res = await handleRequest(req("POST", "/account"), env);
    expect(res.status).toBe(404);
  });

  it("GET /reminders/refresh처럼 메서드가 맞지 않으면 404", async () => {
    const res = await handleRequest(req("GET", "/reminders/refresh"), env);
    expect(res.status).toBe(404);
  });

  it("OPTIONS preflight는 인증 없이 204, DELETE 허용", async () => {
    const res = await handleRequest(
      new Request("https://reminder.example.com/push-tokens", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("DELETE");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it("모르는 경로는 404, 허용 안 된 origin엔 CORS 헤더 없음", async () => {
    const res = await handleRequest(req("GET", "/nope", undefined, "https://evil.example.com"), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("DO 호출이 터지면 CORS가 붙은 500", async () => {
    stub.requestRefresh.mockRejectedValueOnce(new Error("boom"));
    const res = await handleRequest(req("POST", "/reminders/refresh"), env);
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
  });
});
