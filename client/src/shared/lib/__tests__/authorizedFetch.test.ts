import { describe, it, expect, vi, beforeEach } from "vitest";

const { getIdTokenMock, authState } = vi.hoisted(() => ({
  getIdTokenMock: vi.fn(),
  authState: { currentUser: null as null | { getIdToken: () => Promise<string> } },
}));
vi.mock("@/shared/lib/firebase", () => ({ auth: authState, googleProvider: {} }));

import { authorizedFetch } from "../authorizedFetch";

describe("authorizedFetch", () => {
  beforeEach(() => {
    getIdTokenMock.mockResolvedValue("id-token");
    authState.currentUser = { getIdToken: getIdTokenMock };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  });

  it("baseUrl+path로 Bearer 토큰과 기존 헤더를 함께 보낸다", async () => {
    await authorizedFetch("https://w.example.com", "/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(fetch).toHaveBeenCalledWith("https://w.example.com/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer id-token" },
    });
  });

  it("로그인 안 됐으면 요청하지 않고 던진다", async () => {
    authState.currentUser = null;
    await expect(authorizedFetch("https://w.example.com", "/plan")).rejects.toThrow("Not authenticated");
    expect(fetch).not.toHaveBeenCalled();
  });
});
