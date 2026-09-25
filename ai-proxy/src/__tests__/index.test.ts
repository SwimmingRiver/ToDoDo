import { describe, it, expect, vi } from "vitest";
import worker from "../index";
import type { Env } from "../env";

vi.mock("../handlers/plan", () => ({
  handlePlan: vi.fn(),
}));

const makeEnv = (): Env => ({
  AI_USAGE: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  CLIENT_APP_URL: "https://app.example.com",
  AI_MODEL: "claude-haiku-4-5",
  DAILY_LIMIT: "20",
  ANTHROPIC_API_KEY: "test-key",
});

const req = (path: string, init: RequestInit & { origin?: string } = {}) =>
  new Request(`https://ai.example.com${path}`, {
    ...init,
    headers: { Origin: init.origin ?? "https://app.example.com", ...(init.headers ?? {}) },
  });

describe("ai-proxy fetch", () => {
  it("OPTIONS 프리플라이트에 204와 CORS 헤더를 준다", async () => {
    const res = await worker.fetch(req("/plan", { method: "OPTIONS" }), makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("POST /plan을 handlePlan으로 보내고 CORS를 붙인다", async () => {
    const { handlePlan } = await import("../handlers/plan");
    vi.mocked(handlePlan).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const res = await worker.fetch(req("/plan", { method: "POST" }), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
  });

  it("핸들러 예외는 CORS가 붙은 500으로 바꾼다", async () => {
    const { handlePlan } = await import("../handlers/plan");
    vi.mocked(handlePlan).mockRejectedValueOnce(new Error("KV binding missing"));
    const res = await worker.fetch(req("/plan", { method: "POST" }), makeEnv());
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
  });

  it("모르는 경로는 404", async () => {
    const res = await worker.fetch(req("/nope", { method: "GET" }), makeEnv());
    expect(res.status).toBe(404);
  });

  it("허용되지 않은 origin에는 Allow-Origin을 붙이지 않는다", async () => {
    const res = await worker.fetch(
      req("/plan", { method: "OPTIONS", origin: "https://evil.example.com" }),
      makeEnv(),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
