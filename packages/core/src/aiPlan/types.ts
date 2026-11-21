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

export interface PlanTodoInput {
  title: string;
  /** "yyyy-MM-dd" 로컬 날짜 키 또는 null */
  dueDate: string | null;
  priority: PlanPriority;
}

export interface PlanSubmission {
  parent: PlanTodoInput;
  children: PlanTodoInput[];
}

export type AiPlanErrorCode =
  | "UNAUTHORIZED"
  | "PREMIUM_REQUIRED"
  | "INVALID_INPUT"
  | "DAILY_LIMIT"
  | "PLAN_INVALID"
  | "AI_UNAVAILABLE"
  | "NOT_A_GOAL"
  | "TOO_FREQUENT"
  | "ATTEMPT_LIMIT"
  | "UNKNOWN";

const KNOWN_CODES = new Set<AiPlanErrorCode>([
  "UNAUTHORIZED",
  "PREMIUM_REQUIRED",
  "INVALID_INPUT",
  "DAILY_LIMIT",
  "PLAN_INVALID",
  "AI_UNAVAILABLE",
  "NOT_A_GOAL",
  "TOO_FREQUENT",
  "ATTEMPT_LIMIT",
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

/** 정상 흐름에서 생기는 실패(권한 없음·한도·AI 결과 불량·비용 가드). Sentry에 보내지 않는다. */
const EXPECTED_CODES = new Set<AiPlanErrorCode>([
  "PREMIUM_REQUIRED",
  "DAILY_LIMIT",
  "PLAN_INVALID",
  "NOT_A_GOAL",
  "TOO_FREQUENT",
  "ATTEMPT_LIMIT",
]);

export const isExpectedAiPlanError = (error: unknown): boolean =>
  error instanceof AiPlanError && EXPECTED_CODES.has(error.code);

/** /plan 응답을 결과 또는 AiPlanError로 해석한다. fetch 자체는 호출 측(웹·앱)이 한다. */
export const parsePlanResponse = async (res: Response): Promise<GeneratePlanResult> => {
  if (res.ok) return (await res.json()) as GeneratePlanResult;

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const code = KNOWN_CODES.has(body.error as AiPlanErrorCode)
    ? (body.error as AiPlanErrorCode)
    : "UNKNOWN";
  throw new AiPlanError(code, res.status);
};

/**
 * 「다시 만들기」용: 직전 입력의 today를 현재 날짜로 바꾼다. 자정을 넘기면 직전 마감일이
 * 새 today보다 앞설 수 있는데, 서버는 dueDate < today를 거절하므로 그때는 오늘로 맞춘다.
 */
export const rebaseInputToToday = (input: GeneratePlanInput, today: string): GeneratePlanInput => ({
  ...input,
  today,
  dueDate: input.dueDate !== null && input.dueDate < today ? today : input.dueDate,
});
