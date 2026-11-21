import { describe, it, expect, vi } from "vitest";
import { handleOAuthStart } from "../handlers/oauthStart";
import type { Env } from "../env";

vi.mock("@tododo/worker-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tododo/worker-auth")>()),
  verifyFirebaseIdToken: vi.fn().mockResolvedValue({ uid: "user-123", premium: true, premiumUntil: null }),
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
    expect(vi.mocked(createOAuthState)).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      { kind: "web", returnOrigin: "https://app.example.com" },
    );
    expect(body.authUrl).toContain("state=random-state-token");
    expect(body.authUrl).not.toContain("state=user-123");
    expect(body.authUrl).toContain("scope=");
    expect(body.authUrl).toContain(encodeURIComponent("calendar.events"));
  });

  it("Origin이 허용 목록(localhost 개발 서버)에 있으면 그 origin으로 되돌아가도록 저장한다", async () => {
    const { createOAuthState } = await import("../tokenStore");
    const request = new Request("https://proxy.example.com/oauth/start", {
      headers: { Authorization: "Bearer valid-token", Origin: "http://localhost:5173" },
    });
    await handleOAuthStart(request, makeEnv());
    expect(vi.mocked(createOAuthState)).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      { kind: "web", returnOrigin: "http://localhost:5173" },
    );
  });

  it("Origin이 허용 목록에 없으면 CLIENT_APP_URL로 되돌아가도록 저장한다(오픈 리다이렉트 방지)", async () => {
    const { createOAuthState } = await import("../tokenStore");
    const request = new Request("https://proxy.example.com/oauth/start", {
      headers: { Authorization: "Bearer valid-token", Origin: "https://evil.example.com" },
    });
    await handleOAuthStart(request, makeEnv());
    expect(vi.mocked(createOAuthState)).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      { kind: "web", returnOrigin: "https://app.example.com" },
    );
  });

  it("?client=app이면 Origin 없이도 app 대상 state를 발급하고 authUrl의 state가 app.으로 시작한다", async () => {
    const { createOAuthState } = await import("../tokenStore");
    vi.mocked(createOAuthState).mockResolvedValueOnce("app.random-uuid");
    const request = new Request("https://proxy.example.com/oauth/start?client=app", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const response = await handleOAuthStart(request, makeEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { authUrl: string };
    expect(vi.mocked(createOAuthState)).toHaveBeenCalledWith(expect.anything(), "user-123", { kind: "app" });
    expect(new URL(body.authUrl).searchParams.get("state")).toMatch(/^app\./);
  });

  it("client=app이어도 프리미엄이 아니면 403", async () => {
    const { verifyFirebaseIdToken } = await import("@tododo/worker-auth");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValueOnce({ uid: "user-123", premium: false, premiumUntil: null });
    const request = new Request("https://proxy.example.com/oauth/start?client=app", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const response = await handleOAuthStart(request, makeEnv());
    expect(response.status).toBe(403);
  });

  it("premium이 아니면 403 PREMIUM_REQUIRED를 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("@tododo/worker-auth");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValueOnce({ uid: "user-123", premium: false, premiumUntil: null });

    const request = new Request("https://proxy.example.com/oauth/start", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const response = await handleOAuthStart(request, makeEnv());

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("PREMIUM_REQUIRED");
  });
});
