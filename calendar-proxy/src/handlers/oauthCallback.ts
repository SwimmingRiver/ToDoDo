import type { Env } from "../env";
import { exchangeCodeForTokens } from "../googleOAuth";
import { setTokenRecord, consumeOAuthState } from "../tokenStore";
import { appRedirect, isAppState } from "../appReturn";

export const handleOAuthCallback = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const webError = (): Response =>
    Response.redirect(`${env.CLIENT_APP_URL}/calendar?calendarError=1`, 302);

  if (!state) {
    return webError();
  }

  // 앱 여부는 레코드가 아니라 state 접두사로 판정한다 — 동의 화면 취소·state 만료
  // 때는 레코드가 없을 수 있어 레코드의 target을 볼 수 없다. 접두사는 "고정 딥링크"
  // 하나만 고르므로 위조돼도 오픈 리다이렉트가 아니다.
  const fromApp = isAppState(state);

  // 구글이 error(예: 사용자가 동의 거부)로 돌려보냈거나 code가 없으면 교환 없이 종료한다.
  // 이 경우에도 1회용 state는 KV에 남기지 않도록 소비를 시도해 지운다.
  if (oauthError || !code) {
    await consumeOAuthState(env.CALENDAR_TOKENS, state).catch(() => null);
    if (fromApp) {
      return appRedirect(oauthError === "access_denied" ? "cancelled" : "error");
    }
    return webError();
  }

  // state는 /oauth/start가 발급한 1회용 토큰이다 — 여기서 실제 uid·returnOrigin으로
  // 교환하고 즉시 소비한다. uid 자체를 state로 왕복시키면 Authorization 헤더가
  // 없는 이 엔드포인트에서 누구든 다른 사용자의 uid를 흉내 낼 수 있다.
  // KV가 던져도 Worker 500 대신 아래 null 분기(앱이면 딥링크 오류)로 보낸다.
  const consumed = await consumeOAuthState(env.CALENDAR_TOKENS, state).catch(() => null);
  if (!consumed) {
    return fromApp ? appRedirect("error") : webError();
  }
  const { uid, returnOrigin, target } = consumed;
  const toApp = target === "app";
  // returnOrigin이 없는 레코드는 정상 경로가 아니다 — 안전하게 CLIENT_APP_URL로.
  const webBase = returnOrigin ?? env.CLIENT_APP_URL;

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
    return toApp
      ? appRedirect("connected")
      : Response.redirect(`${webBase}/calendar?calendarConnected=1`, 302);
  } catch (error) {
    console.error("OAuth 콜백 실패:", error);
    return toApp
      ? appRedirect("error")
      : Response.redirect(`${webBase}/calendar?calendarError=1`, 302);
  }
};
