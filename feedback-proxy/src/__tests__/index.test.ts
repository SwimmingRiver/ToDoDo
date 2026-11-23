import { describe, it, expect, vi } from "vitest";
import worker from "../index";
import type { Env } from "../env";

vi.mock("../handlers/feedback", () => ({
  handleFeedback: vi.fn(),
}));

const makeEnv = (): Env => ({
  FIREBASE_PROJECT_ID: "tododo-test",
  CLIENT_APP_URL: "https://app.example.com",
  GOOGLE_SERVICE_ACCOUNT: "{}",
  DISCORD_WEBHOOK_URL: "https://discord.example.com/hook",
});

const req = (path: string, init: RequestInit & { origin?: string } = {}) =>
  new Request(`https://feedback.example.com${path}`, {
    ...init,
    headers: { Origin: init.origin ?? "https://app.example.com", ...(init.headers ?? {}) },
  });

describe("feedback-proxy fetch", () => {
  it("OPTIONS 프리플라이트에 204와 CORS 헤더를 준다", async () => {
    const res = await worker.fetch(req("/feedback", { method: "OPTIONS" }), makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("POST /feedback을 핸들러로 보내고 CORS를 붙인다", async () => {
    const { handleFeedback } = await import("../handlers/feedback");
    vi.mocked(handleFeedback).mockResolvedValueOnce(new Response("ok", { status: 201 }));
    const res = await worker.fetch(req("/feedback", { method: "POST" }), makeEnv());
    expect(res.status).toBe(201);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
  });

  it("핸들러 예외는 CORS가 붙은 500", async () => {
    const { handleFeedback } = await import("../handlers/feedback");
    vi.mocked(handleFeedback).mockRejectedValueOnce(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await worker.fetch(req("/feedback", { method: "POST" }), makeEnv());
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    spy.mockRestore();
  });

  it("모르는 경로는 404", async () => {
    const res = await worker.fetch(req("/nope", { method: "GET" }), makeEnv());
    expect(res.status).toBe(404);
  });

  it("허용되지 않은 origin에는 Allow-Origin을 붙이지 않는다", async () => {
    const res = await worker.fetch(
      req("/feedback", { method: "OPTIONS", origin: "https://evil.example.com" }),
      makeEnv(),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
