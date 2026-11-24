export type ErrorCode = "UNAUTHORIZED" | "INVALID_INPUT" | "TOO_FREQUENT";

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** ai-proxy와 같은 `{ error: CODE }` 규약. */
export const errorResponse = (code: ErrorCode, status: number): Response =>
  jsonResponse({ error: code }, status);
