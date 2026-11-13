import Anthropic from "@anthropic-ai/sdk";
import { verifyFirebaseIdToken } from "@tododo/worker-auth";
import type { Env } from "../env";
import { errorResponse, jsonResponse } from "../http";
import { isNotAGoal, parsePlanRequest } from "../validateInput";
import { getAttempts, getUsage, incrementAttempts, incrementUsage } from "../usage";
import { generatePlan, PlanGenerationError } from "../generatePlan";
import { sanitizePlan } from "../sanitizePlan";

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_DAILY_ATTEMPT_LIMIT = 40;

const parseLimit = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** 바인딩이 없거나 장애면 통과시킨다 — 비용의 최종 방어는 하루 시도 상한이 맡는다. */
const isTooFrequent = async (env: Env, uid: string): Promise<boolean> => {
  if (!env.AI_RATE_LIMIT) return false;
  try {
    const { success } = await env.AI_RATE_LIMIT.limit({ key: uid });
    return !success;
  } catch (error) {
    console.error("연타 제한 확인 실패, 통과시킴:", error);
    return false;
  }
};

/**
 * 인증 → 프리미엄 → 입력 → 글자 없는 입력 거절 → 연타 제한 → 성공 한도 → 시도 상한
 * → 시도 +1 → 생성 → 사후 검증 → 성공 +1.
 * 성공 카운트(usage)는 성공했을 때만 올린다 — 실패로 사용자의 하루 20회가 차감되면 안 된다.
 * 대신 실패(거부/max_tokens/잘못된 출력 502, Anthropic 장애 503)를 반복 유발해 토큰을
 * 무한히 쓰는 것은 Claude 호출 직전에 올리는 시도 카운터(DAILY_ATTEMPT_LIMIT)가 막고,
 * 짧은 시간 몰아치기는 AI_RATE_LIMIT가 막는다. 남은 한계는 KV 비원자성(동시 요청 시
 * 소폭 초과)뿐이다. incrementUsage는 쓰기 직전에 최신값을
 * 다시 읽으므로 여기서 넘기는 used는 게이트 체크용일 뿐 기록값이 아니다.
 * premiumUntil 클레임은 ID 토큰 갱신 전까지 최대 1시간 늦게 반영될 수 있다(캘린더와 동일).
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
  if (isNotAGoal(planRequest.goal)) return errorResponse("NOT_A_GOAL", 400);

  if (await isTooFrequent(env, uid)) return errorResponse("TOO_FREQUENT", 429);

  const now = new Date();
  const limit = parseLimit(env.DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
  const used = await getUsage(env.AI_USAGE, uid, now);
  if (used >= limit) return errorResponse("DAILY_LIMIT", 429, { usage: { used, limit } });

  const attemptLimit = parseLimit(env.DAILY_ATTEMPT_LIMIT, DEFAULT_DAILY_ATTEMPT_LIMIT);
  if ((await getAttempts(env.AI_USAGE, uid, now)) >= attemptLimit) {
    return errorResponse("ATTEMPT_LIMIT", 429);
  }
  // 결과를 보기 전에 센다: 끝난 뒤 세면 동시에 들어온 요청들이 상한을 함께 통과한다.
  await incrementAttempts(env.AI_USAGE, uid, now);

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

  const newUsed = await incrementUsage(env.AI_USAGE, uid, now);
  return jsonResponse({ plan, usage: { used: newUsed, limit } });
};
