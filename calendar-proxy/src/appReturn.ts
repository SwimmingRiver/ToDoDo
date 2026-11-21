// 앱(React Native)에서 시작한 OAuth가 돌아갈 고정 딥링크. 앱은 인앱 브라우저
// 세션으로 /oauth/start가 준 authUrl을 열고, 콜백이 이 주소로 302하면 세션이 닫힌다.
export const APP_RETURN_URL = "tododo://calendar";

// 앱 대상 state의 접두사. 콜백이 "앱으로 돌려보낼지"를 이 접두사로 판정한다 —
// 사용자가 동의 화면에서 취소하거나 state가 만료되면 KV 레코드가 없을 수 있어
// 레코드의 target만으로는 판정할 수 없기 때문이다. 접두사는 위조될 수 있지만
// 고르는 대상이 위 고정 주소 하나뿐이라(임의 URL을 담지 않음) 오픈 리다이렉트가 아니다.
export const APP_STATE_PREFIX = "app.";

export const isAppState = (state: string | null): boolean =>
  state !== null && state.startsWith(APP_STATE_PREFIX);

const RESULT_PARAM = {
  connected: "calendarConnected",
  error: "calendarError",
  cancelled: "calendarCancelled",
} as const;

// Response.redirect는 http(s) 외 스킴에 대한 동작이 런타임마다 달라, Location을 직접 설정한다.
export const appRedirect = (result: keyof typeof RESULT_PARAM): Response =>
  new Response(null, {
    status: 302,
    headers: { Location: `${APP_RETURN_URL}?${RESULT_PARAM[result]}=1` },
  });
