const KNOWN_CODES = new Set([
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
    constructor(code, status) {
        super(`AI 플랜 요청 실패: ${code} (${status})`);
        this.name = "AiPlanError";
        this.code = code;
        this.status = status;
    }
}
/** 정상 흐름에서 생기는 실패(권한 없음·한도·AI 결과 불량·비용 가드). Sentry에 보내지 않는다. */
const EXPECTED_CODES = new Set([
    "PREMIUM_REQUIRED",
    "DAILY_LIMIT",
    "PLAN_INVALID",
    "NOT_A_GOAL",
    "TOO_FREQUENT",
    "ATTEMPT_LIMIT",
]);
export const isExpectedAiPlanError = (error) => error instanceof AiPlanError && EXPECTED_CODES.has(error.code);
/** /plan 응답을 결과 또는 AiPlanError로 해석한다. fetch 자체는 호출 측(웹·앱)이 한다. */
export const parsePlanResponse = async (res) => {
    if (res.ok)
        return (await res.json());
    const body = (await res.json().catch(() => ({})));
    const code = KNOWN_CODES.has(body.error)
        ? body.error
        : "UNKNOWN";
    throw new AiPlanError(code, res.status);
};
