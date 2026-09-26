import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Env } from "./env";
import { PlanSchema, type RawPlan } from "./planSchema";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import type { PlanRequest } from "./validateInput";

/** AI가 쓸 수 있는 계획을 내놓지 못한 경우. 핸들러가 502 PLAN_INVALID로 바꾼다. */
export class PlanGenerationError extends Error {
  constructor(reason: string) {
    super(`plan generation failed: ${reason}`);
    this.name = "PlanGenerationError";
  }
}

/** 테스트에서 가짜 클라이언트를 주입하기 위한 최소 타입. */
export type PlanClient = Pick<Anthropic, "messages">;

const createClient = (env: Env): PlanClient =>
  // Haiku는 보통 수 초 안에 끝난다. 30초 × (재시도 1회 + 1)이 사용자가 기다릴 상한.
  new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 });

export const generatePlan = async (
  env: Env,
  req: PlanRequest,
  client: PlanClient = createClient(env),
): Promise<RawPlan> => {
  let response;
  try {
    response = await client.messages.parse({
      model: env.AI_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(req) }],
      output_config: { format: zodOutputFormat(PlanSchema) },
    });
  } catch (error) {
    // API 에러(과부하·타임아웃·네트워크)는 핸들러가 503으로 처리하도록 그대로 던진다.
    if (error instanceof Anthropic.APIError) throw error;
    // 그 밖의 SDK 에러는 응답을 스키마로 파싱하지 못한 경우다.
    if (error instanceof Anthropic.AnthropicError) throw new PlanGenerationError("parse_failed");
    throw error;
  }

  if (response.stop_reason === "refusal") throw new PlanGenerationError("refusal");
  if (response.stop_reason === "max_tokens") throw new PlanGenerationError("max_tokens");
  if (!response.parsed_output) throw new PlanGenerationError("empty_output");
  return response.parsed_output;
};
