import type { Env } from "./env";
import { handleOAuthStart } from "./handlers/oauthStart";
import { handleOAuthCallback } from "./handlers/oauthCallback";
import { handleSyncTodos } from "./handlers/syncTodos";
import { handleGetEvents } from "./handlers/events";
import { handleDisconnect } from "./handlers/disconnect";
import { isAllowedOrigin } from "@tododo/worker-auth";

const withCors = (response: Response, requestOrigin: string | null, env: Env): Response => {
  const headers = new Headers(response.headers);
  if (isAllowedOrigin(requestOrigin, env)) {
    headers.set("Access-Control-Allow-Origin", requestOrigin);
  }
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    try {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }), origin, env);
      }

      if (url.pathname === "/oauth/start" && request.method === "GET") {
        return withCors(await handleOAuthStart(request, env), origin, env);
      }
      if (url.pathname === "/oauth/callback" && request.method === "GET") {
        // 구글 리다이렉트가 직접 호출하는 풀 페이지 네비게이션이라 CORS 불필요
        return handleOAuthCallback(request, env);
      }
      if (url.pathname === "/sync-todos" && request.method === "POST") {
        return withCors(await handleSyncTodos(request, env), origin, env);
      }
      if (url.pathname === "/events" && request.method === "GET") {
        return withCors(await handleGetEvents(request, env), origin, env);
      }
      if (url.pathname === "/disconnect" && request.method === "POST") {
        return withCors(await handleDisconnect(request, env), origin, env);
      }

      return withCors(new Response("Not Found", { status: 404 }), origin, env);
    } catch (error) {
      // 라우팅된 핸들러가 예상치 못한 예외를 던지면(예: KV 바인딩 누락) 여기서
      // 잡지 않는 한 CORS 헤더 없이 죽어서 브라우저에는 CORS 에러로만 보이고
      // 진짜 원인(500)이 가려진다 — 반드시 CORS가 붙은 응답으로 변환해서 내보낸다.
      // 어느 라우트에서 터졌는지 알아야 KV 바인딩 문제 같은 원인을 빨리 찾을 수
      // 있으므로 pathname을 같이 남긴다(핸들러마다 중복으로 try/catch하지 않는다).
      console.error(`처리되지 않은 예외 (${url.pathname}):`, error);
      return withCors(new Response("Internal Server Error", { status: 500 }), origin, env);
    }
  },
};
