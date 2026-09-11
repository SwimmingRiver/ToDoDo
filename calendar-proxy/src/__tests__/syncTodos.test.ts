import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSyncTodos } from "../handlers/syncTodos";
import type { Env } from "../env";

vi.mock("../auth", () => ({
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

const makeRequest = (body: unknown, authorized = true) =>
  new Request("https://proxy.example.com/sync-todos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorized ? { Authorization: "Bearer valid-token" } : {}),
    },
    body: JSON.stringify(body),
  });

describe("handleSyncTodos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await handleSyncTodos(makeRequest({ todos: [] }, false), makeEnv());
    expect(response.status).toBe(401);
  });

  it("연동되지 않은 사용자면 409를 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue(null);

    const response = await handleSyncTodos(makeRequest({ todos: [] }), makeEnv());
    expect(response.status).toBe(409);
  });

  it("정상 흐름이면 결과 배열을 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");
    const { syncTodosToGoogleCalendar } = await import("../googleCalendar");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockResolvedValue({ access_token: "at", expires_in: 3600 });
    vi.mocked(syncTodosToGoogleCalendar).mockResolvedValue([
      { id: "todo-1", googleEventId: "event-1" },
    ]);

    const todos = [
      { id: "todo-1", title: "제목", dueAt: "2026-09-01", googleEventId: null, action: "upsert" as const },
    ];
    const response = await handleSyncTodos(makeRequest({ todos }), makeEnv());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: unknown[] };
    expect(body.results).toEqual([{ id: "todo-1", googleEventId: "event-1" }]);
  });

  it("리프레시 토큰이 철회됐으면(invalid_grant) 토큰을 지우고 401을 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord, deleteTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error("invalid_grant"));

    const response = await handleSyncTodos(makeRequest({ todos: [] }), makeEnv());

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("revoked");
    expect(vi.mocked(deleteTokenRecord)).toHaveBeenCalledWith(expect.anything(), "user-1");
  });
});
