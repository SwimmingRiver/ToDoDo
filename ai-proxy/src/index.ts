import { isAllowedOrigin } from "@tododo/worker-auth";
import type { Env } from "./env";
import { handlePlan } from "./handlers/plan";

const withCors = (response: Response, requestOrigin: string | null, env: Env): Response => {
  const headers = new Headers(response.headers);
  if (isAllowedOrigin(requestOrigin, env)) {
    headers.set("Access-Control-Allow-Origin", requestOrigin);
  }
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
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
      if (url.pathname === "/plan" && request.method === "POST") {
        return withCors(await handlePlan(request, env), origin, env);
      }
      return withCors(new Response("Not Found", { status: 404 }), origin, env);
    } catch (error) {
      // calendar-proxy와 같은 이유: CORS 없이 죽으면 브라우저엔 CORS 에러로만 보여
      // 진짜 원인(500)이 가려진다.
      console.error(`처리되지 않은 예외 (${url.pathname}):`, error);
      return withCors(new Response("Internal Server Error", { status: 500 }), origin, env);
    }
  },
};
