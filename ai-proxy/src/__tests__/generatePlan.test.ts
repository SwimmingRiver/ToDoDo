import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { generatePlan, PlanGenerationError, type PlanClient } from "../generatePlan";
import { SYSTEM_PROMPT } from "../prompt";
import type { Env } from "../env";

const env = {
  AI_MODEL: "claude-haiku-4-5",
  ANTHROPIC_API_KEY: "test-key",
} as Env;
const req = { goal: "이사 준비", dueDate: "2026-10-31", today: "2026-09-25" };
const parsed = { title: "이사 준비", dueDate: "2026-10-31", items: [] };

const makeClient = (impl: () => Promise<unknown>) => {
  const parse = vi.fn(impl);
  return { client: { messages: { parse } } as unknown as PlanClient, parse };
};

describe("generatePlan", () => {
  it("설정된 모델·시스템 프롬프트·user 메시지로 호출하고 parsed_output을 돌려준다", async () => {
    const { client, parse } = makeClient(async () => ({ stop_reason: "end_turn", parsed_output: parsed }));
    await expect(generatePlan(env, req, client)).resolves.toEqual(parsed);
    // vi.fn(impl)은 무인자 impl에서 Mock<() => ...>을 추론해 .mock.calls를 빈 튜플 배열로 만든다.
    // 실제 런타임엔 parse가 인자 1개로 호출되므로 타입만 넓혀서 읽는다.
    const calls = parse.mock.calls as unknown as unknown[][];
    const args = calls[0][0] as Record<string, unknown>;
    expect(args.model).toBe("claude-haiku-4-5");
    expect(args.system).toBe(SYSTEM_PROMPT);
    expect(args.messages).toEqual([
      { role: "user", content: "오늘: 2026-09-25\n마감일: 2026-10-31\n목표: 이사 준비" },
    ]);
    expect(args.output_config).toBeDefined();
  });

  it("거절·출력 잘림·파싱 실패는 PlanGenerationError", async () => {
    for (const response of [
      { stop_reason: "refusal", parsed_output: null },
      { stop_reason: "max_tokens", parsed_output: parsed },
      { stop_reason: "end_turn", parsed_output: null },
    ]) {
      const { client } = makeClient(async () => response);
      await expect(generatePlan(env, req, client)).rejects.toBeInstanceOf(PlanGenerationError);
    }
  });

  it("API 에러(타임아웃 등)는 그대로 던진다(핸들러가 503으로 바꿈)", async () => {
    const apiError = new Anthropic.APIConnectionTimeoutError();
    const { client } = makeClient(async () => {
      throw apiError;
    });
    await expect(generatePlan(env, req, client)).rejects.toBe(apiError);
  });

  it("SDK의 비-API 에러(응답 JSON 파싱 실패 등)는 PlanGenerationError", async () => {
    const { client } = makeClient(async () => {
      throw new Anthropic.AnthropicError("Failed to parse structured output");
    });
    await expect(generatePlan(env, req, client)).rejects.toBeInstanceOf(PlanGenerationError);
  });
});
