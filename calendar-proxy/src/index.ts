import type { Env } from "./env";
import { handleOAuthStart } from "./handlers/oauthStart";
import { handleOAuthCallback } from "./handlers/oauthCallback";
import { handleSyncTodos } from "./handlers/syncTodos";

const ALLOWED_ORIGIN = "https://tododo-83576.web.app";

const withCors = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/oauth/start" && request.method === "GET") {
      return withCors(await handleOAuthStart(request, env));
    }
    if (url.pathname === "/oauth/callback" && request.method === "GET") {
      // 구글 리다이렉트가 직접 호출하는 풀 페이지 네비게이션이라 CORS 불필요
      return handleOAuthCallback(request, env);
    }
    if (url.pathname === "/sync-todos" && request.method === "POST") {
      return withCors(await handleSyncTodos(request, env));
    }

    return withCors(new Response("Not Found", { status: 404 }));
  },
};
