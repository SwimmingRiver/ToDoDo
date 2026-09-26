import { authorizedFetch } from "@/shared/lib/authorizedFetch";

const AI_PROXY_URL = import.meta.env.VITE_AI_PROXY_URL as string;

export type PlanPriority = "low" | "medium" | "high";

export interface GeneratedPlanItem {
  title: string;
  /** "YYYY-MM-DD" 로컬 날짜 키 또는 null. ISO 타임스탬프가 아니다. */
  dueDate: string | null;
  priority: PlanPriority;
}

export interface GeneratedPlan {
  title: string;
  dueDate: string | null;
  items: GeneratedPlanItem[];
}

export interface PlanUsage {
  used: number;
  limit: number;
}

export interface GeneratePlanInput {
  goal: string;
  dueDate: string | null;
  today: string;
}

export interface GeneratePlanResult {
  plan: GeneratedPlan;
  usage: PlanUsage;
}

export type AiPlanErrorCode =
  | "UNAUTHORIZED"
  | "PREMIUM_REQUIRED"
  | "INVALID_INPUT"
  | "DAILY_LIMIT"
  | "PLAN_INVALID"
  | "AI_UNAVAILABLE"
  | "UNKNOWN";

const KNOWN_CODES = new Set<AiPlanErrorCode>([
  "UNAUTHORIZED",
  "PREMIUM_REQUIRED",
  "INVALID_INPUT",
  "DAILY_LIMIT",
  "PLAN_INVALID",
  "AI_UNAVAILABLE",
]);

export class AiPlanError extends Error {
  readonly code: AiPlanErrorCode;
  readonly status: number;

  constructor(code: AiPlanErrorCode, status: number) {
    super(`AI 플랜 요청 실패: ${code} (${status})`);
    this.name = "AiPlanError";
    this.code = code;
    this.status = status;
  }
}

/** 정상 흐름에서 생기는 실패(권한 없음·한도·AI 결과 불량). Sentry에 보내지 않는다. */
const EXPECTED_CODES = new Set<AiPlanErrorCode>(["PREMIUM_REQUIRED", "DAILY_LIMIT", "PLAN_INVALID"]);

export const isExpectedAiPlanError = (error: unknown): boolean =>
  error instanceof AiPlanError && EXPECTED_CODES.has(error.code);

export const requestPlan = async (input: GeneratePlanInput): Promise<GeneratePlanResult> => {
  const res = await authorizedFetch(AI_PROXY_URL, "/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) return (await res.json()) as GeneratePlanResult;

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const code = KNOWN_CODES.has(body.error as AiPlanErrorCode)
    ? (body.error as AiPlanErrorCode)
    : "UNKNOWN";
  throw new AiPlanError(code, res.status);
};
