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

const makeRateLimit = (success = true) => ({ limit: vi.fn(async () => ({ success })) });

const makeEnv = (store = new Map<string, string>(), overrides: Partial<Env> = {}): Env => ({
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
  AI_RATE_LIMIT: makeRateLimit() as unknown as RateLimit,
  DAILY_ATTEMPT_LIMIT: "5",
  ...overrides,
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
const ATTEMPT_KEY = "attempts:user-1:2026-09-25";

describe("handlePlan", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T03:00:00Z")); // 서울 2026-09-25 12:00
    vi.mocked(verifyFirebaseIdToken).mockReset().mockResolvedValue({ uid: "user-1", premium: true, premiumUntil: null });
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
    vi.mocked(verifyFirebaseIdToken).mockResolvedValueOnce({ uid: "user-1", premium: false, premiumUntil: null });
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

  it("생성 중 다른 요청이 먼저 카운트를 올려도 재조회한 최신값+1을 쓴다(경쟁 상태)", async () => {
    const store = new Map([[KEY, "1"]]);
    vi.mocked(generatePlan).mockImplementationOnce(async () => {
      // 게이트 체크(used=1) 이후, AI 호출이 끝나기 전에 다른 병렬 요청이 먼저
      // 성공해 카운트를 5로 올려놓은 상황을 흉내낸다.
      store.set(KEY, "5");
      return rawPlan;
    });
    const res = await handlePlan(request(), makeEnv(store));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: rawPlan, usage: { used: 6, limit: 3 } });
    expect(store.get(KEY)).toBe("6");
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

  describe("비용 가드", () => {
    it("글자가 없는 goal은 400 NOT_A_GOAL — 연타 제한·KV·AI 모두 건드리지 않는다", async () => {
      const env = makeEnv();
      const res = await handlePlan(request({ ...body, goal: "🎉 123" }), env);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "NOT_A_GOAL" });
      expect(generatePlan).not.toHaveBeenCalled();
      expect(vi.mocked(env.AI_RATE_LIMIT!.limit)).not.toHaveBeenCalled();
      expect(vi.mocked(env.AI_USAGE.put)).not.toHaveBeenCalled();
    });

    it("자모만 있는 goal(ㅋㅋ)도 400 NOT_A_GOAL — 연타 제한·KV·AI 모두 건드리지 않는다", async () => {
      const env = makeEnv();
      const res = await handlePlan(request({ ...body, goal: "ㅋㅋ" }), env);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "NOT_A_GOAL" });
      expect(generatePlan).not.toHaveBeenCalled();
      expect(vi.mocked(env.AI_RATE_LIMIT!.limit)).not.toHaveBeenCalled();
      expect(vi.mocked(env.AI_USAGE.put)).not.toHaveBeenCalled();
    });

    it("연타 제한에 걸리면 429 TOO_FREQUENT, uid를 키로 묻고 AI 미호출", async () => {
      const env = makeEnv(new Map(), { AI_RATE_LIMIT: makeRateLimit(false) as unknown as RateLimit });
      const res = await handlePlan(request(), env);
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "TOO_FREQUENT" });
      expect(vi.mocked(env.AI_RATE_LIMIT!.limit)).toHaveBeenCalledWith({ key: "user-1" });
      expect(generatePlan).not.toHaveBeenCalled();
    });

    it("연타 제한 바인딩이 예외를 던지면 통과시킨다(fail-open)", async () => {
      const broken = { limit: vi.fn(async () => Promise.reject(new Error("rl down"))) };
      const res = await handlePlan(request(), makeEnv(new Map(), { AI_RATE_LIMIT: broken as unknown as RateLimit }));
      expect(res.status).toBe(200);
    });

    it("연타 제한 바인딩이 없으면 통과시킨다", async () => {
      const res = await handlePlan(request(), makeEnv(new Map(), { AI_RATE_LIMIT: undefined }));
      expect(res.status).toBe(200);
    });

    it("시도 상한에 도달하면 429 ATTEMPT_LIMIT, AI 미호출", async () => {
      const store = new Map([[ATTEMPT_KEY, "5"]]);
      const res = await handlePlan(request(), makeEnv(store));
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "ATTEMPT_LIMIT" });
      expect(generatePlan).not.toHaveBeenCalled();
      expect(store.get(ATTEMPT_KEY)).toBe("5");
    });

    it("성공하면 시도 +1, 응답 usage는 성공 카운트 그대로", async () => {
      const store = new Map([[KEY, "1"]]);
      const res = await handlePlan(request(), makeEnv(store));
      expect(await res.json()).toEqual({ plan: rawPlan, usage: { used: 2, limit: 3 } });
      expect(store.get(ATTEMPT_KEY)).toBe("1");
    });

    it("502 PLAN_INVALID여도 시도는 +1, 성공 카운트는 불변", async () => {
      vi.mocked(generatePlan).mockRejectedValueOnce(new PlanGenerationError("refusal"));
      const store = new Map<string, string>();
      const res = await handlePlan(request(), makeEnv(store));
      expect(res.status).toBe(502);
      expect(store.get(ATTEMPT_KEY)).toBe("1");
      expect(store.has(KEY)).toBe(false);
    });

    it("503 AI_UNAVAILABLE여도 시도는 +1", async () => {
      vi.mocked(generatePlan).mockRejectedValueOnce(new Anthropic.APIConnectionTimeoutError());
      const store = new Map<string, string>();
      const res = await handlePlan(request(), makeEnv(store));
      expect(res.status).toBe(503);
      expect(store.get(ATTEMPT_KEY)).toBe("1");
    });

    it("성공 한도(DAILY_LIMIT)에 걸린 요청은 시도를 올리지 않는다", async () => {
      const store = new Map([[KEY, "3"]]);
      const res = await handlePlan(request(), makeEnv(store));
      expect(res.status).toBe(429);
      expect(store.has(ATTEMPT_KEY)).toBe(false);
    });

    it.each([["abc"], ["0"], [undefined]])("DAILY_ATTEMPT_LIMIT가 %j면 기본 40을 쓴다", async (value) => {
      const ok = await handlePlan(request(), makeEnv(new Map([[ATTEMPT_KEY, "39"]]), { DAILY_ATTEMPT_LIMIT: value }));
      expect(ok.status).toBe(200);
      const blocked = await handlePlan(request(), makeEnv(new Map([[ATTEMPT_KEY, "40"]]), { DAILY_ATTEMPT_LIMIT: value }));
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({ error: "ATTEMPT_LIMIT" });
    });

    it("시도 카운터 쓰기가 실패하면(같은 키 초당 1회 제한) AI를 부르지 않고 429 TOO_FREQUENT", async () => {
      const env = makeEnv();
      vi.mocked(env.AI_USAGE.put).mockRejectedValueOnce(new Error("KV PUT failed: 429 Too Many Requests"));
      const res = await handlePlan(request(), env);
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "TOO_FREQUENT" });
      expect(generatePlan).not.toHaveBeenCalled();
    });

    it("성공 한도에 걸린 요청은 연타 제한 슬롯을 쓰지 않는다", async () => {
      const env = makeEnv(new Map([[KEY, "3"]]));
      const res = await handlePlan(request(), env);
      expect(await res.json()).toMatchObject({ error: "DAILY_LIMIT" });
      expect(vi.mocked(env.AI_RATE_LIMIT!.limit)).not.toHaveBeenCalled();
    });

    it("시도 상한에 걸린 요청은 연타 제한 슬롯을 쓰지 않는다", async () => {
      const env = makeEnv(new Map([[ATTEMPT_KEY, "5"]]));
      const res = await handlePlan(request(), env);
      expect(await res.json()).toEqual({ error: "ATTEMPT_LIMIT" });
      expect(vi.mocked(env.AI_RATE_LIMIT!.limit)).not.toHaveBeenCalled();
    });

    it("연타 제한에 걸리면 시도를 올리지 않는다", async () => {
      const store = new Map<string, string>();
      await handlePlan(request(), makeEnv(store, { AI_RATE_LIMIT: makeRateLimit(false) as unknown as RateLimit }));
      expect(store.has(ATTEMPT_KEY)).toBe(false);
    });
  });
});
