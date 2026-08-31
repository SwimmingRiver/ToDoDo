import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleOAuthCallback } from "../handlers/oauthCallback";
import type { Env } from "../env";

vi.mock("../googleOAuth", () => ({
  exchangeCodeForTokens: vi.fn(),
}));
vi.mock("../tokenStore", () => ({
  setTokenRecord: vi.fn(),
}));

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

describe("handleOAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("code나 state가 없으면 에러 페이지로 리다이렉트한다", async () => {
    const request = new Request("https://proxy.example.com/oauth/callback");
    const response = await handleOAuthCallback(request, makeEnv());
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("calendarError=1");
  });

  it("토큰 교환에 성공하면 저장하고 성공 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    const { setTokenRecord } = await import("../tokenStore");
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
    });

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=user-123",
    );
    const response = await handleOAuthCallback(request, makeEnv());

    expect(vi.mocked(setTokenRecord)).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      { refreshToken: "rt" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("calendarConnected=1");
  });

  it("refresh_token이 없으면 에러 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: "at",
      expires_in: 3600,
    });

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=user-123",
    );
    const response = await handleOAuthCallback(request, makeEnv());
    expect(response.headers.get("Location")).toContain("calendarError=1");
  });

  it("토큰 교환이 실패하면 에러 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error("토큰 교환 실패: 400"));

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=user-123",
    );
    const response = await handleOAuthCallback(request, makeEnv());
    expect(response.headers.get("Location")).toContain("calendarError=1");
  });
});
