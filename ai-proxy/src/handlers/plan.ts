import Anthropic from "@anthropic-ai/sdk";
import { verifyFirebaseIdToken } from "@tododo/worker-auth";
import type { Env } from "../env";
import { errorResponse, jsonResponse } from "../http";
import { parsePlanRequest } from "../validateInput";
import { getUsage, incrementUsage } from "../usage";
import { generatePlan, PlanGenerationError } from "../generatePlan";
import { sanitizePlan } from "../sanitizePlan";

const DEFAULT_DAILY_LIMIT = 20;

const readLimit = (env: Env): number => {
  const parsed = Number.parseInt(env.DAILY_LIMIT, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
};

/**
 * 인증 → 프리미엄 → 입력 → 한도 → 생성 → 사후 검증 → 카운트 증가.
 * 카운트는 마지막에 성공했을 때만 올린다. 실패한 호출로 횟수가 차감되면 안 된다.
 * premium 클레임은 ID 토큰 갱신 전까지 최대 1시간 늦게 반영될 수 있다(캘린더와 동일).
 */
export const handlePlan = async (request: Request, env: Env): Promise<Response> => {
  const idToken = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");

  let uid: string;
  let premium: boolean;
  try {
    ({ uid, premium } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return errorResponse("UNAUTHORIZED", 401);
  }
  if (!premium) return errorResponse("PREMIUM_REQUIRED", 403);

  const body = await request.json().catch(() => null);
  const planRequest = parsePlanRequest(body);
  if (!planRequest) return errorResponse("INVALID_INPUT", 400);

  const now = new Date();
  const limit = readLimit(env);
  const used = await getUsage(env.AI_USAGE, uid, now);
  if (used >= limit) return errorResponse("DAILY_LIMIT", 429, { usage: { used, limit } });

  let rawPlan;
  try {
    rawPlan = await generatePlan(env, planRequest);
  } catch (error) {
    if (error instanceof PlanGenerationError) return errorResponse("PLAN_INVALID", 502);
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API 호출 실패:", error);
      return errorResponse("AI_UNAVAILABLE", 503);
    }
    throw error;
  }

  const plan = sanitizePlan(rawPlan, planRequest);
  if (!plan) return errorResponse("PLAN_INVALID", 502);

  const newUsed = await incrementUsage(env.AI_USAGE, uid, now, used);
  return jsonResponse({ plan, usage: { used: newUsed, limit } });
};
