import type { Env } from "../env";
import { verifyFirebaseIdToken, isAllowedOrigin } from "@tododo/worker-auth";
import { createOAuthState } from "../tokenStore";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const buildAuthUrl = (state: string, redirectUri: string, clientId: string): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.events",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

export const handleOAuthStart = async (request: Request, env: Env): Promise<Response> => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  if (!idToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  let uid: string;
  let premium: boolean;
  try {
    ({ uid, premium } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!premium) {
    return new Response(JSON.stringify({ error: "PREMIUM_REQUIRED" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 로컬 개발(localhost)에서 연동을 시작해도 구글 동의 후 정확히 그 환경으로
  // 돌아와야 한다 — 되돌아갈 곳을 CLIENT_APP_URL(프로덕션)로 고정하면 로컬에서
  // 연동해도 markConnected()가 프로덕션 탭에서만 실행돼, 로컬 세션은 영원히
  // "연동 안 됨" 상태로 남는다(캘린더 동기화가 조용히 아무 요청도 안 보내는
  // 원인이었다). CORS 허용 목록과 동일한 기준으로 검증해 임의 오리진으로의
  // 오픈 리다이렉트는 막는다.
  const requestOrigin = request.headers.get("Origin");
  const returnOrigin = isAllowedOrigin(requestOrigin, env) ? requestOrigin : env.CLIENT_APP_URL;

  const state = await createOAuthState(env.CALENDAR_TOKENS, uid, returnOrigin);
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/oauth/callback`;
  const authUrl = buildAuthUrl(state, redirectUri, env.GOOGLE_CLIENT_ID);

  return new Response(JSON.stringify({ authUrl }), {
    headers: { "Content-Type": "application/json" },
  });
};
