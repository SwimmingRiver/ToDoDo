import { describe, it, expect, vi } from "vitest";
import worker from "../index";
import type { Env } from "../env";

vi.mock("../handlers/disconnect", () => ({
  handleDisconnect: vi.fn().mockRejectedValue(new Error("KV binding missing")),
}));

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

describe("fetch", () => {
  it("핸들러가 예외를 던져도 CORS 헤더가 붙은 500 응답으로 변환한다", async () => {
    const request = new Request("https://proxy.example.com/disconnect", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", Origin: "https://app.example.com" },
    });
    const response = await worker.fetch(request, makeEnv());
    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
  });

  it("localhost 개발 서버 origin은 어떤 포트든 그대로 반사한다", async () => {
    const request = new Request("https://proxy.example.com/disconnect", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5174" },
    });
    const response = await worker.fetch(request, makeEnv());
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5174");
  });

  it("FIREBASE_PROJECT_ID로부터 유도된 firebaseapp.com 기본 도메인 origin도 허용한다", async () => {
    const request = new Request("https://proxy.example.com/disconnect", {
      method: "OPTIONS",
      headers: { Origin: "https://tododo-test.firebaseapp.com" },
    });
    const response = await worker.fetch(request, makeEnv());
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://tododo-test.firebaseapp.com",
    );
  });

  it("허용 목록에 없는 origin은 Access-Control-Allow-Origin을 붙이지 않는다", async () => {
    const request = new Request("https://proxy.example.com/disconnect", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
    });
    const response = await worker.fetch(request, makeEnv());
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
