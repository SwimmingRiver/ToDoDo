import type { Env } from "./env";
import { handleOAuthStart } from "./handlers/oauthStart";
import { handleOAuthCallback } from "./handlers/oauthCallback";
import { handleSyncTodos } from "./handlers/syncTodos";
import { handleGetEvents } from "./handlers/events";
import { handleDisconnect } from "./handlers/disconnect";

// Firebase Hosting은 같은 사이트를 web.app과 firebaseapp.com 두 도메인으로 동시에
// 서빙한다. 로컬 개발과 CI E2E는 별도 로컬 Worker를 띄우지 않고 이 배포된
// Worker를 그대로 바라보도록 배선돼 있어(client/.env, ci.yml의
// VITE_CALENDAR_PROXY_URL), localhost 개발 서버 origin도 허용해야 한다. CORS는
// 브라우저의 응답 열람만 막을 뿐 서버 접근 자체를 막지 않고 모든 엔드포인트가
// Firebase ID 토큰 검증을 거치므로, localhost origin을 허용해도 보안 저하는 없다.
const isAllowedOrigin = (origin: string | null, clientAppUrl: string): origin is string => {
  if (!origin) return false;
  if (origin === clientAppUrl) return true;
  if (origin === "https://tododo-83576.firebaseapp.com") return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  return false;
};

const withCors = (response: Response, requestOrigin: string | null, env: Env): Response => {
  const headers = new Headers(response.headers);
  if (isAllowedOrigin(requestOrigin, env.CLIENT_APP_URL)) {
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
      console.error("처리되지 않은 예외:", error);
      return withCors(new Response("Internal Server Error", { status: 500 }), origin, env);
    }
  },
};
