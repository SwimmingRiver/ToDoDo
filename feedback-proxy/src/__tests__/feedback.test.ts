import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleFeedback } from "../handlers/feedback";
import type { Env } from "../env";

vi.mock("@tododo/worker-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tododo/worker-auth")>()),
  verifyFirebaseIdToken: vi.fn(),
}));

import { verifyFirebaseIdToken } from "@tododo/worker-auth";

const makeRateLimit = (success = true) => ({ limit: vi.fn(async () => ({ success })) });

const makeEnv = (overrides: Partial<Env> = {}): Env => ({
  FIREBASE_PROJECT_ID: "tododo-test",
  CLIENT_APP_URL: "https://app.example.com",
  GOOGLE_SERVICE_ACCOUNT: "{}",
  DISCORD_WEBHOOK_URL: "https://discord.example.com/hook",
  FEEDBACK_SUBMIT_LIMIT: makeRateLimit() as unknown as RateLimit,
  FEEDBACK_NOTIFY_LIMIT: makeRateLimit() as unknown as RateLimit,
  ...overrides,
});

const NOW = new Date("2026-11-23T01:02:03.000Z");

const makeDeps = () => ({
  store: { create: vi.fn(async () => {}) },
  notify: vi.fn(async () => {}),
  now: () => NOW,
});

const request = (payload: unknown = { content: "좋아요", platform: "web" }, raw?: string) =>
  new Request("https://feedback.example.com/feedback", {
    method: "POST",
    headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(payload),
  });

const verified = (email?: string) => ({
  uid: "user-1",
  identities: {},
  premium: false,
  premiumUntil: null,
  ...(email ? { email } : {}),
});

describe("handleFeedback", () => {
  beforeEach(() => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(verified("a@b.com") as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(verifyFirebaseIdToken).mockReset();
  });

  it("토큰 검증 실패 → 401, 저장 안 함", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    const deps = makeDeps();
    const res = await handleFeedback(request(), makeEnv(), deps);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it.each([
    ["공백만", { content: "   ", platform: "web" }],
    ["1001자", { content: "a".repeat(1001), platform: "web" }],
    ["숫자 content", { content: 123, platform: "web" }],
    ["잘못된 platform", { content: "hi", platform: "mac" }],
    ["platform 없음", { content: "hi" }],
  ])("잘못된 입력(%s) → 400", async (_n, payload) => {
    const deps = makeDeps();
    const res = await handleFeedback(request(payload), makeEnv(), deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_INPUT" });
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it("JSON이 아니면 400", async () => {
    const deps = makeDeps();
    const res = await handleFeedback(request(null, "not json"), makeEnv(), deps);
    expect(res.status).toBe(400);
  });

  it("1000자는 통과한다", async () => {
    const deps = makeDeps();
    const res = await handleFeedback(
      request({ content: "a".repeat(1000), platform: "ios" }),
      makeEnv(),
      deps,
    );
    expect(res.status).toBe(201);
  });

  it("제출 리밋 초과 → 429, 저장 안 함", async () => {
    const deps = makeDeps();
    const env = makeEnv({ FEEDBACK_SUBMIT_LIMIT: makeRateLimit(false) as unknown as RateLimit });
    const res = await handleFeedback(request(), env, deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "TOO_FREQUENT" });
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it("정상 제출 → 201, trim된 내용 저장, Discord 알림", async () => {
    const deps = makeDeps();
    const env = makeEnv();
    const res = await handleFeedback(
      request({ content: "  좋아요  ", platform: "web" }),
      env,
      deps,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(deps.store.create).toHaveBeenCalledWith({
      userId: "user-1",
      email: "a@b.com",
      content: "좋아요",
      platform: "web",
      createdAt: NOW.toISOString(),
    });
    expect(deps.notify).toHaveBeenCalledWith(
      "https://discord.example.com/hook",
      "web",
      "https://app.example.com",
    );
  });

  it("email 없는 토큰 → email null", async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValueOnce(verified() as never);
    const deps = makeDeps();
    const res = await handleFeedback(request(), makeEnv(), deps);
    expect(res.status).toBe(201);
    expect(deps.store.create).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it("Discord 실패여도 201", async () => {
    const deps = makeDeps();
    deps.notify.mockRejectedValueOnce(new Error("discord down"));
    const res = await handleFeedback(request(), makeEnv(), deps);
    expect(res.status).toBe(201);
    expect(console.error).toHaveBeenCalledWith(
      "Discord 알림 실패, 의견은 저장됨:",
      expect.any(Error),
    );
  });

  it("알림 리밋 초과 → 201, 알림 생략, 저장은 됨", async () => {
    const deps = makeDeps();
    const env = makeEnv({ FEEDBACK_NOTIFY_LIMIT: makeRateLimit(false) as unknown as RateLimit });
    const res = await handleFeedback(request(), env, deps);
    expect(res.status).toBe(201);
    expect(deps.store.create).toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("리밋 바인딩이 throw하면 통과한다", async () => {
    const broken = { limit: vi.fn(async () => { throw new Error("down"); }) } as unknown as RateLimit;
    const deps = makeDeps();
    const res = await handleFeedback(
      request(),
      makeEnv({ FEEDBACK_SUBMIT_LIMIT: broken, FEEDBACK_NOTIFY_LIMIT: broken }),
      deps,
    );
    expect(res.status).toBe(201);
    expect(deps.notify).toHaveBeenCalled();
  });

  it("저장 실패는 throw된다(index가 500 처리)", async () => {
    const deps = makeDeps();
    deps.store.create.mockRejectedValueOnce(new Error("firestore"));
    await expect(handleFeedback(request(), makeEnv(), deps)).rejects.toThrow("firestore");
    expect(deps.notify).not.toHaveBeenCalled();
  });
});
