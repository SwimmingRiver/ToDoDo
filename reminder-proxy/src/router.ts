import { isAllowedOrigin, verifyFirebaseIdToken } from "@tododo/worker-auth";
import type { Env } from "./env";

const MAX_TOKEN_LENGTH = 4096;
const PLATFORMS = new Set(["web"]);

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const withCors = (response: Response, origin: string | null, env: Env): Response => {
  const headers = new Headers(response.headers);
  if (isAllowedOrigin(origin, env)) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  // 요청마다 preflight가 붙지 않게 하루 캐시한다(브라우저별 상한은 더 짧을 수 있다).
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, headers });
};

const authenticate = async (request: Request, env: Env): Promise<string | null> => {
  const idToken = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    return (await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID)).uid;
  } catch {
    return null;
  }
};

const readToken = async (request: Request): Promise<{ token: string; platform: unknown } | null> => {
  const body = (await request.json().catch(() => null)) as { token?: unknown; platform?: unknown } | null;
  if (!body || typeof body.token !== "string") return null;
  if (body.token.length === 0 || body.token.length > MAX_TOKEN_LENGTH) return null;
  return { token: body.token, platform: body.platform };
};

const route = async (request: Request, env: Env, path: string): Promise<Response> => {
  const isTokens = path === "/push-tokens" && (request.method === "POST" || request.method === "DELETE");
  const isRefresh = path === "/reminders/refresh" && request.method === "POST";
  if (!isTokens && !isRefresh) return new Response("Not Found", { status: 404 });

  const uid = await authenticate(request, env);
  if (!uid) return json({ error: "UNAUTHORIZED" }, 401);
  const scheduler = env.REMINDER_SCHEDULER.get(env.REMINDER_SCHEDULER.idFromName(uid));

  if (isRefresh) {
    await scheduler.requestRefresh(uid);
    return new Response(null, { status: 202 });
  }

  const input = await readToken(request);
  if (!input) return json({ error: "INVALID_INPUT" }, 400);
  if (request.method === "DELETE") {
    await scheduler.unregisterToken(uid, input.token);
    return new Response(null, { status: 204 });
  }
  if (typeof input.platform !== "string" || !PLATFORMS.has(input.platform)) {
    return json({ error: "INVALID_INPUT" }, 400);
  }
  await scheduler.registerToken(uid, input.token, input.platform);
  return new Response(null, { status: 204 });
};

export const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  try {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), origin, env);
    return withCors(await route(request, env, url.pathname), origin, env);
  } catch (error) {
    // 다른 Worker와 같은 이유: CORS 없이 죽으면 브라우저엔 CORS 에러로만 보여 원인이 가려진다.
    console.error(`처리되지 않은 예외 (${url.pathname}):`, error);
    return withCors(new Response("Internal Server Error", { status: 500 }), origin, env);
  }
};
