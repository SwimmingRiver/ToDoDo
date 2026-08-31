import type { Env } from "../env";
import { exchangeCodeForTokens } from "../googleOAuth";
import { setTokenRecord } from "../tokenStore";

export const handleOAuthCallback = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const uid = url.searchParams.get("state");

  if (!code || !uid) {
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
