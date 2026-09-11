import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleGetEvents } from "../handlers/events";
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

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

const makeRequest = () =>
  new Request("https://proxy.example.com/events", {
    headers: { Authorization: "Bearer valid-token" },
  });

describe("handleGetEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("연동되지 않은 사용자면 빈 이벤트 배열을 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue(null);

    const response = await handleGetEvents(makeRequest(), makeEnv());
    const body = (await response.json()) as { events: unknown[] };
    expect(body.events).toEqual([]);
  });

  it("구글 이벤트를 title/start/end 형태로 매핑해 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockResolvedValue({ access_token: "at", expires_in: 3600 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "g-event-1",
              summary: "팀 회의",
              start: { date: "2026-09-05" },
              end: { date: "2026-09-06" },
            },
          ],
        }),
      }),
    );

    const response = await handleGetEvents(makeRequest(), makeEnv());
    const body = (await response.json()) as { events: unknown[] };
    expect(body.events).toEqual([
      { id: "g-event-1", title: "팀 회의", start: "2026-09-05", end: "2026-09-06" },
    ]);
  });
});
