import { isAllowedOrigin, verifyFirebaseIdToken } from "@tododo/worker-auth";
import { isBillingAllowed } from "./allowlist";
import type { CommitDeps } from "./commit";
import type { Env } from "./env";
import { handleCheckout, handlePortal, handleTrial } from "./handlers/account";
import { handleWebhook } from "./handlers/webhook";
import type { PaddleClient } from "./paddle";

export interface BillingDeps extends CommitDeps {
  paddle: Pick<PaddleClient, "createCheckoutTransaction" | "createPortalUrl">;
}

type AccountRoute = (uid: string, deps: BillingDeps, now: Date) => Promise<Response>;

const ACCOUNT_ROUTES = new Map<string, AccountRoute>([
  ["/checkout", handleCheckout],
  ["/trial", handleTrial],
  ["/portal", (uid, deps) => handlePortal(uid, deps)],
]);

const withCors = (response: Response, origin: string | null, env: Env): Response => {
  const headers = new Headers(response.headers);
  if (isAllowedOrigin(origin, env)) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
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

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * getDeps는 try 안에서 호출한다 — 시크릿 누락으로 의존성 생성이 실패해도 CORS가 붙은 500이 나가야
 * 브라우저에서 진짜 원인이 CORS 에러로 가려지지 않는다(ai-proxy와 같은 이유).
 */
export const handleRequest = async (
  request: Request,
  env: Env,
  getDeps: () => BillingDeps,
  now: Date = new Date(),
): Promise<Response> => {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");

  try {
    if (url.pathname === "/webhooks/paddle" && request.method === "POST") {
      return await handleWebhook(request, env, getDeps(), now);
    }
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), origin, env);

    const route = request.method === "POST" ? ACCOUNT_ROUTES.get(url.pathname) : undefined;
    if (!route) return withCors(new Response("Not Found", { status: 404 }), origin, env);

    const uid = await authenticate(request, env);
    if (!uid) return withCors(json({ error: "UNAUTHORIZED" }, 401), origin, env);
    if (!isBillingAllowed(uid, env.BILLING_ALLOWED_UIDS)) {
      return withCors(json({ error: "NOT_ALLOWED" }, 403), origin, env);
    }
    return withCors(await route(uid, getDeps(), now), origin, env);
  } catch (error) {
    console.error(`처리되지 않은 예외 (${url.pathname}):`, error);
    return withCors(new Response("Internal Server Error", { status: 500 }), origin, env);
  }
};
