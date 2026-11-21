import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleOAuthCallback } from "../handlers/oauthCallback";
import type { Env } from "../env";

vi.mock("../googleOAuth", () => ({
  exchangeCodeForTokens: vi.fn(),
}));
vi.mock("../tokenStore", () => ({
  setTokenRecord: vi.fn(),
  consumeOAuthState: vi.fn(),
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

  it("state가 유효하지 않으면(위조·만료·재사용) 에러 페이지로 리다이렉트하고 토큰 교환을 시도하지 않는다", async () => {
    const { consumeOAuthState } = await import("../tokenStore");
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    vi.mocked(consumeOAuthState).mockResolvedValue(null);

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=forged-or-expired",
    );
    const response = await handleOAuthCallback(request, makeEnv());

    expect(response.headers.get("Location")).toContain("calendarError=1");
    expect(vi.mocked(exchangeCodeForTokens)).not.toHaveBeenCalled();
  });

  it("토큰 교환에 성공하면 state가 가리키던 uid로 저장하고, state가 가리키던 returnOrigin(연동을 시작한 환경)으로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    const { setTokenRecord, consumeOAuthState } = await import("../tokenStore");
    vi.mocked(consumeOAuthState).mockResolvedValue({
      uid: "user-123",
      returnOrigin: "http://localhost:5173",
    });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
    });

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=random-state-token",
    );
    const response = await handleOAuthCallback(request, makeEnv());

    expect(vi.mocked(consumeOAuthState)).toHaveBeenCalledWith(expect.anything(), "random-state-token");
    expect(vi.mocked(setTokenRecord)).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      { refreshToken: "rt" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("http://localhost:5173/calendar?calendarConnected=1");
  });

  it("refresh_token이 없으면 returnOrigin의 에러 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    const { consumeOAuthState } = await import("../tokenStore");
    vi.mocked(consumeOAuthState).mockResolvedValue({
      uid: "user-123",
      returnOrigin: "http://localhost:5173",
    });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: "at",
      expires_in: 3600,
    });

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=random-state-token",
    );
    const response = await handleOAuthCallback(request, makeEnv());
    expect(response.headers.get("Location")).toBe("http://localhost:5173/calendar?calendarError=1");
  });

  it("토큰 교환이 실패하면 returnOrigin의 에러 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    const { consumeOAuthState } = await import("../tokenStore");
    vi.mocked(consumeOAuthState).mockResolvedValue({
      uid: "user-123",
      returnOrigin: "http://localhost:5173",
    });
    vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error("토큰 교환 실패: 400"));

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=random-state-token",
    );
    const response = await handleOAuthCallback(request, makeEnv());
    expect(response.headers.get("Location")).toBe("http://localhost:5173/calendar?calendarError=1");
  });

  describe("앱(tododo://calendar) 복귀", () => {
    const APP = "tododo://calendar";

    it("target:app 레코드 + 교환 성공 → calendarConnected 딥링크", async () => {
      const { exchangeCodeForTokens } = await import("../googleOAuth");
      const { consumeOAuthState } = await import("../tokenStore");
      vi.mocked(consumeOAuthState).mockResolvedValue({ uid: "user-123", target: "app" });
      vi.mocked(exchangeCodeForTokens).mockResolvedValue({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
      const response = await handleOAuthCallback(
        new Request("https://proxy.example.com/oauth/callback?code=c&state=app.xxx"),
        makeEnv(),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(`${APP}?calendarConnected=1`);
    });

    it("target:app 레코드 + 교환 실패 → calendarError 딥링크", async () => {
      const { exchangeCodeForTokens } = await import("../googleOAuth");
      const { consumeOAuthState } = await import("../tokenStore");
      vi.mocked(consumeOAuthState).mockResolvedValue({ uid: "user-123", target: "app" });
      vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error("fail"));
      const response = await handleOAuthCallback(
        new Request("https://proxy.example.com/oauth/callback?code=c&state=app.xxx"),
        makeEnv(),
      );
      expect(response.headers.get("Location")).toBe(`${APP}?calendarError=1`);
    });

    it("error=access_denied(code 없음) → calendarCancelled 딥링크, 교환 안 함, state는 소비 시도", async () => {
      const { exchangeCodeForTokens } = await import("../googleOAuth");
      const { consumeOAuthState } = await import("../tokenStore");
      vi.mocked(consumeOAuthState).mockResolvedValue(null);
      const response = await handleOAuthCallback(
        new Request("https://proxy.example.com/oauth/callback?error=access_denied&state=app.xxx"),
        makeEnv(),
      );
      expect(response.headers.get("Location")).toBe(`${APP}?calendarCancelled=1`);
      expect(vi.mocked(exchangeCodeForTokens)).not.toHaveBeenCalled();
      expect(vi.mocked(consumeOAuthState)).toHaveBeenCalledWith(expect.anything(), "app.xxx");
    });

    it("state 만료(consume null) → calendarError 딥링크", async () => {
      const { consumeOAuthState } = await import("../tokenStore");
      vi.mocked(consumeOAuthState).mockResolvedValue(null);
      const response = await handleOAuthCallback(
        new Request("https://proxy.example.com/oauth/callback?code=c&state=app.xxx"),
        makeEnv(),
      );
      expect(response.headers.get("Location")).toBe(`${APP}?calendarError=1`);
    });

    it("접두사 없는 state + error → 기존처럼 웹 에러 페이지", async () => {
      const { consumeOAuthState } = await import("../tokenStore");
      vi.mocked(consumeOAuthState).mockResolvedValue(null);
      const response = await handleOAuthCallback(
        new Request("https://proxy.example.com/oauth/callback?error=access_denied&state=0000-uuid"),
        makeEnv(),
      );
      expect(response.headers.get("Location")).toBe("https://app.example.com/calendar?calendarError=1");
    });

    it("access_denied가 아닌 error(server_error) → calendarError 딥링크", async () => {
      const { consumeOAuthState } = await import("../tokenStore");
      vi.mocked(consumeOAuthState).mockResolvedValue(null);
      const response = await handleOAuthCallback(
        new Request("https://proxy.example.com/oauth/callback?error=server_error&state=app.xxx"),
        makeEnv(),
      );
      expect(response.headers.get("Location")).toBe(`${APP}?calendarError=1`);
    });

    it("consumeOAuthState(KV)가 throw해도 앱이면 calendarError 딥링크", async () => {
      const { consumeOAuthState } = await import("../tokenStore");
      vi.mocked(consumeOAuthState).mockRejectedValue(new Error("KV down"));
      const response = await handleOAuthCallback(
        new Request("https://proxy.example.com/oauth/callback?code=c&state=app.xxx"),
        makeEnv(),
      );
      expect(response.headers.get("Location")).toBe(`${APP}?calendarError=1`);
    });
  });
});
