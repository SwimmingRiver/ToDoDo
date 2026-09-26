import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDisconnect } from "../handlers/disconnect";
import type { Env } from "../env";

vi.mock("@tododo/worker-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tododo/worker-auth")>()),
  verifyFirebaseIdToken: vi.fn(),
}));
vi.mock("../tokenStore", () => ({
  getTokenRecord: vi.fn(),
  deleteTokenRecord: vi.fn(),
}));
vi.mock("../googleOAuth", () => ({
  refreshAccessToken: vi.fn(),
}));
vi.mock("../googleCalendar", () => ({
  syncTodosToGoogleCalendar: vi.fn(),
}));

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

const makeRequest = (googleEventIds: string[]) =>
  new Request("https://proxy.example.com/disconnect", {
    method: "POST",
    headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
    body: JSON.stringify({ googleEventIds }),
  });

describe("handleDisconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("매핑된 이벤트를 모두 삭제 요청한 뒤 토큰을 지우고, 실제로 삭제 확인된 id만 응답에 담는다", async () => {
    const { verifyFirebaseIdToken } = await import("@tododo/worker-auth");
    const { getTokenRecord, deleteTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");
    const { syncTodosToGoogleCalendar } = await import("../googleCalendar");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1", premium: false });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockResolvedValue({ access_token: "at", expires_in: 3600 });
    vi.mocked(syncTodosToGoogleCalendar).mockResolvedValue([
      { id: "event-1", googleEventId: null },
      { id: "event-2", googleEventId: null },
    ]);

    const response = await handleDisconnect(makeRequest(["event-1", "event-2"]), makeEnv());

    expect(vi.mocked(syncTodosToGoogleCalendar)).toHaveBeenCalledWith(
      [
        { id: "event-1", title: "", dueAt: "", googleEventId: "event-1", action: "delete" },
        { id: "event-2", title: "", dueAt: "", googleEventId: "event-2", action: "delete" },
      ],
      "at",
    );
    expect(vi.mocked(deleteTokenRecord)).toHaveBeenCalledWith(expect.anything(), "user-1");
    const body = (await response.json()) as { ok: boolean; deletedGoogleEventIds: string[] };
    expect(body.ok).toBe(true);
    expect(body.deletedGoogleEventIds).toEqual(["event-1", "event-2"]);
  });

  it("일부 이벤트 삭제가 실패하면 그 id는 deletedGoogleEventIds에서 제외한다(호출부가 Firestore에서 stale id를 지우지 않도록)", async () => {
    const { verifyFirebaseIdToken } = await import("@tododo/worker-auth");
    const { getTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");
    const { syncTodosToGoogleCalendar } = await import("../googleCalendar");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1", premium: false });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockResolvedValue({ access_token: "at", expires_in: 3600 });
    vi.mocked(syncTodosToGoogleCalendar).mockResolvedValue([
      { id: "event-ok", googleEventId: null },
      { id: "event-fail", googleEventId: "event-fail", error: "이벤트 삭제 실패: 500" },
    ]);

    const response = await handleDisconnect(makeRequest(["event-ok", "event-fail"]), makeEnv());
    const body = (await response.json()) as { ok: boolean; deletedGoogleEventIds: string[] };
    expect(body.ok).toBe(true);
    expect(body.deletedGoogleEventIds).toEqual(["event-ok"]);
  });

  it("이벤트 삭제 중 에러가 나도 토큰은 반드시 지우고, 삭제 확인된 id는 없다고 응답한다", async () => {
    const { verifyFirebaseIdToken } = await import("@tododo/worker-auth");
    const { getTokenRecord, deleteTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1", premium: false });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error("google down"));

    const response = await handleDisconnect(makeRequest(["event-1"]), makeEnv());

    expect(vi.mocked(deleteTokenRecord)).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { deletedGoogleEventIds: string[] };
    expect(body.deletedGoogleEventIds).toEqual([]);
  });

  it("요청 바디가 비어 있거나 잘못된 JSON이어도 토큰은 반드시 지운다", async () => {
    const { verifyFirebaseIdToken } = await import("@tododo/worker-auth");
    const { getTokenRecord, deleteTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");
    const { syncTodosToGoogleCalendar } = await import("../googleCalendar");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1", premium: false });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockResolvedValue({ access_token: "at", expires_in: 3600 });
    vi.mocked(syncTodosToGoogleCalendar).mockResolvedValue([]);

    const emptyBodyRequest = new Request("https://proxy.example.com/disconnect", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });
    const response = await handleDisconnect(emptyBodyRequest, makeEnv());

    expect(vi.mocked(deleteTokenRecord)).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(vi.mocked(syncTodosToGoogleCalendar)).toHaveBeenCalledWith([], "at");
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("Authorization 헤더가 없으면 401을 반환하고 아무 것도 호출하지 않는다", async () => {
    const { verifyFirebaseIdToken } = await import("@tododo/worker-auth");
    const { getTokenRecord } = await import("../tokenStore");

    vi.mocked(verifyFirebaseIdToken).mockRejectedValue(new Error("Invalid token"));

    const request = new Request("https://proxy.example.com/disconnect", { method: "POST" });
    const response = await handleDisconnect(request, makeEnv());

    expect(response.status).toBe(401);
    expect(vi.mocked(getTokenRecord)).not.toHaveBeenCalled();
  });

  it("이미 연동 안 된 사용자면 바로 성공을 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("@tododo/worker-auth");
    const { getTokenRecord } = await import("../tokenStore");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1", premium: false });
    vi.mocked(getTokenRecord).mockResolvedValue(null);

    const response = await handleDisconnect(makeRequest([]), makeEnv());
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("premium이 아니어도(엔타이틀먼트 무관) 연동 해제는 항상 허용된다", async () => {
    const { verifyFirebaseIdToken } = await import("@tododo/worker-auth");
    const { getTokenRecord } = await import("../tokenStore");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1", premium: false });
    vi.mocked(getTokenRecord).mockResolvedValue(null);

    const response = await handleDisconnect(makeRequest([]), makeEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
