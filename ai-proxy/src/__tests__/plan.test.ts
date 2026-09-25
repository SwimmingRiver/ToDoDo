import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { handlePlan } from "../handlers/plan";
import type { Env } from "../env";

vi.mock("@tododo/worker-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tododo/worker-auth")>()),
  verifyFirebaseIdToken: vi.fn(),
}));
vi.mock("../generatePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../generatePlan")>()),
  generatePlan: vi.fn(),
}));

import { verifyFirebaseIdToken } from "@tododo/worker-auth";
import { generatePlan, PlanGenerationError } from "../generatePlan";

const makeEnv = (store = new Map<string, string>()): Env => ({
  AI_USAGE: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  } as unknown as KVNamespace,
  FIREBASE_PROJECT_ID: "tododo-test",
  CLIENT_APP_URL: "https://app.example.com",
  AI_MODEL: "claude-haiku-4-5",
  DAILY_LIMIT: "3",
  ANTHROPIC_API_KEY: "k",
});

const body = { goal: "이사 준비", dueDate: "2026-10-31", today: "2026-09-25" };
const request = (payload: unknown = body, token = "valid") =>
  new Request("https://ai.example.com/plan", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
const rawPlan = {
  title: "이사 준비",
  dueDate: "2026-10-31",
  items: [{ title: "견적 받기", dueDate: "2026-10-03", priority: "high" as const }],
};
const KEY = "usage:user-1:2026-09-25";

describe("handlePlan", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T03:00:00Z")); // 서울 2026-09-25 12:00
    vi.mocked(verifyFirebaseIdToken).mockReset().mockResolvedValue({ uid: "user-1", premium: true });
    vi.mocked(generatePlan).mockReset().mockResolvedValue(rawPlan);
  });
  afterEach(() => vi.useRealTimers());

  it("토큰이 무효면 401 UNAUTHORIZED, AI 미호출", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    const res = await handlePlan(request(), makeEnv());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(generatePlan).not.toHaveBeenCalled();
  });

  it("무료 사용자는 403 PREMIUM_REQUIRED", async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValueOnce({ uid: "user-1", premium: false });
    const res = await handlePlan(request(), makeEnv());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "PREMIUM_REQUIRED" });
  });

  it("본문이 JSON이 아니거나 검증 실패면 400 INVALID_INPUT", async () => {
    expect((await handlePlan(request("not json"), makeEnv())).status).toBe(400);
    const res = await handlePlan(request({ ...body, goal: "  " }), makeEnv());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_INPUT" });
  });

  it("성공하면 정제된 plan과 증가된 usage를 돌려주고 카운트를 +1 한다", async () => {
    const store = new Map([[KEY, "1"]]);
    const res = await handlePlan(request(), makeEnv(store));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: rawPlan, usage: { used: 2, limit: 3 } });
    expect(store.get(KEY)).toBe("2");
  });

  it("한도에 도달하면 429 DAILY_LIMIT, AI 미호출, 카운트 불변", async () => {
    const store = new Map([[KEY, "3"]]);
    const res = await handlePlan(request(), makeEnv(store));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "DAILY_LIMIT", usage: { used: 3, limit: 3 } });
    expect(generatePlan).not.toHaveBeenCalled();
    expect(store.get(KEY)).toBe("3");
  });

  it("PlanGenerationError면 502 PLAN_INVALID, 카운트 불변", async () => {
    vi.mocked(generatePlan).mockRejectedValueOnce(new PlanGenerationError("refusal"));
    const store = new Map<string, string>();
    const res = await handlePlan(request(), makeEnv(store));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "PLAN_INVALID" });
    expect(store.has(KEY)).toBe(false);
  });

  it("사후 검증에서 쓸 게 없으면 502 PLAN_INVALID, 카운트 불변", async () => {
    vi.mocked(generatePlan).mockResolvedValueOnce({ ...rawPlan, items: [{ title: " ", dueDate: null, priority: "low" }] });
    const store = new Map<string, string>();
    const res = await handlePlan(request(), makeEnv(store));
    expect(res.status).toBe(502);
    expect(store.has(KEY)).toBe(false);
  });

  it("Anthropic API 에러면 503 AI_UNAVAILABLE, 카운트 불변", async () => {
    vi.mocked(generatePlan).mockRejectedValueOnce(new Anthropic.APIConnectionTimeoutError());
    const store = new Map<string, string>();
    const res = await handlePlan(request(), makeEnv(store));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI_UNAVAILABLE" });
    expect(store.has(KEY)).toBe(false);
  });

  it("그 밖의 예외는 던져서 라우터가 500으로 바꾸게 한다", async () => {
    vi.mocked(generatePlan).mockRejectedValueOnce(new TypeError("boom"));
    await expect(handlePlan(request(), makeEnv())).rejects.toBeInstanceOf(TypeError);
  });

  it("DAILY_LIMIT가 숫자가 아니면 기본 20을 쓴다", async () => {
    const env = { ...makeEnv(new Map([[KEY, "19"]])), DAILY_LIMIT: "abc" };
    const res = await handlePlan(request(), env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { usage: { limit: number } }).usage.limit).toBe(20);
  });
});
