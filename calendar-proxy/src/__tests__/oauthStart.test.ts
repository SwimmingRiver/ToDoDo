import { describe, it, expect, vi } from "vitest";
import { handleOAuthStart } from "../handlers/oauthStart";
import type { Env } from "../env";

vi.mock("../auth", () => ({
  verifyFirebaseIdToken: vi.fn().mockResolvedValue({ uid: "user-123" }),
}));
vi.mock("../tokenStore", () => ({
  createOAuthState: vi.fn().mockResolvedValue("random-state-token"),
}));

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

describe("handleOAuthStart", () => {
  it("ID Token이 없으면 401을 반환한다", async () => {
    const request = new Request("https://proxy.example.com/oauth/start");
    const response = await handleOAuthStart(request, makeEnv());
    expect(response.status).toBe(401);
  });

  it("유효한 요청이면 발급받은 state 토큰이 담긴 authUrl을 반환한다 (uid를 직접 담지 않는다)", async () => {
    const { createOAuthState } = await import("../tokenStore");
    const request = new Request("https://proxy.example.com/oauth/start", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const response = await handleOAuthStart(request, makeEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { authUrl: string };
    expect(vi.mocked(createOAuthState)).toHaveBeenCalledWith(expect.anything(), "user-123");
    expect(body.authUrl).toContain("state=random-state-token");
    expect(body.authUrl).not.toContain("state=user-123");
    expect(body.authUrl).toContain("scope=");
    expect(body.authUrl).toContain(encodeURIComponent("calendar.events"));
  });
});
