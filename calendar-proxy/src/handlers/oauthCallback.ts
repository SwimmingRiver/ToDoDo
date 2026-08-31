import type { Env } from "../env";
import { exchangeCodeForTokens } from "../googleOAuth";
import { setTokenRecord, consumeOAuthState } from "../tokenStore";

export const handleOAuthCallback = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return Response.redirect(`${env.CLIENT_APP_URL}/dashboard/calendar?calendarError=1`, 302);
  }

  // state는 /oauth/start가 발급한 1회용 토큰이다 — 여기서 실제 uid로 교환하고
  // 즉시 소비한다. uid 자체를 state로 왕복시키면 Authorization 헤더가 없는 이
  // 엔드포인트에서 누구든 다른 사용자의 uid를 흉내 낼 수 있다.
  const uid = await consumeOAuthState(env.CALENDAR_TOKENS, state);
  if (!uid) {
    return Response.redirect(`${env.CLIENT_APP_URL}/dashboard/calendar?calendarError=1`, 302);
  }

  try {
    const redirectUri = `${url.origin}/oauth/callback`;
    const tokens = await exchangeCodeForTokens(
      code,
      redirectUri,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    if (!tokens.refresh_token) {
      throw new Error("refresh_token 없음");
    }
    await setTokenRecord(env.CALENDAR_TOKENS, uid, { refreshToken: tokens.refresh_token });
    return Response.redirect(`${env.CLIENT_APP_URL}/dashboard/calendar?calendarConnected=1`, 302);
  } catch (error) {
    console.error("OAuth 콜백 실패:", error);
    return Response.redirect(`${env.CLIENT_APP_URL}/dashboard/calendar?calendarError=1`, 302);
  }
};
