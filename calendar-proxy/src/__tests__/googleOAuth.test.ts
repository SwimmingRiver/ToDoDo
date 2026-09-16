import { describe, it, expect, vi, afterEach } from "vitest";
import { exchangeCodeForTokens, refreshAccessToken } from "../googleOAuth";

describe("exchangeCodeForTokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("올바른 파라미터로 토큰 엔드포인트를 호출하고 응답을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeCodeForTokens(
      "auth-code",
      "https://proxy.example.com/oauth/callback",
      "client-id",
      "client-secret",
    );

    expect(result).toEqual({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "" }));

    await expect(
      exchangeCodeForTokens("bad-code", "https://x", "id", "secret"),
    ).rejects.toThrow("토큰 교환 실패");
  });
});

describe("refreshAccessToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("정상 갱신되면 access_token을 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "new-at", expires_in: 3600 }),
      }),
    );

    const result = await refreshAccessToken("refresh-token", "id", "secret");
    expect(result.access_token).toBe("new-at");
  });

  it("invalid_grant면 'invalid_grant' 메시지로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: "invalid_grant" }),
      }),
    );

    await expect(refreshAccessToken("revoked-token", "id", "secret")).rejects.toThrow(
      "invalid_grant",
    );
  });

  it("그 외 실패는 일반 에러로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "" }),
    );

    await expect(refreshAccessToken("token", "id", "secret")).rejects.toThrow("토큰 갱신 실패");
  });
});
