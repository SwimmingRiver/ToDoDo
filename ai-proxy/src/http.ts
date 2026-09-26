export type ErrorCode =
  | "UNAUTHORIZED"
  | "PREMIUM_REQUIRED"
  | "INVALID_INPUT"
  | "DAILY_LIMIT"
  | "PLAN_INVALID"
  | "AI_UNAVAILABLE";

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** calendar-proxy와 같은 `{ error: CODE }` 규약. extra는 429의 usage처럼 부가 정보용. */
export const errorResponse = (
  code: ErrorCode,
  status: number,
  extra: Record<string, unknown> = {},
): Response => jsonResponse({ error: code, ...extra }, status);
