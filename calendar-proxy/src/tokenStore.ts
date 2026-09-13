export interface CalendarTokenRecord {
  refreshToken: string;
}

const tokenKey = (uid: string): string => `token:${uid}`;

export const getTokenRecord = async (
  kv: KVNamespace,
  uid: string,
): Promise<CalendarTokenRecord | null> => {
  const raw = await kv.get(tokenKey(uid));
  return raw ? (JSON.parse(raw) as CalendarTokenRecord) : null;
};

export const setTokenRecord = async (
  kv: KVNamespace,
  uid: string,
  record: CalendarTokenRecord,
): Promise<void> => {
  await kv.put(tokenKey(uid), JSON.stringify(record));
};

export const deleteTokenRecord = async (kv: KVNamespace, uid: string): Promise<void> => {
  await kv.delete(tokenKey(uid));
};

const oauthStateKey = (state: string): string => `oauthState:${state}`;

// OAuth state 토큰의 유효 기간. 사용자가 구글 동의 화면에서 시간을 끌어도
// 충분하도록 10분으로 둔다 — 짧을수록 안전하지만, 너무 짧으면 정상 사용자도
// 실패한다.
const OAUTH_STATE_TTL_SECONDS = 600;

export interface OAuthStateRecord {
  uid: string;
  /** `/oauth/start`를 호출한 클라이언트의 origin. 로컬 개발(localhost)과
   *  프로덕션이 같은 배포된 Worker를 공유하므로, 콜백이 어디로 돌아가야 하는지는
   *  고정된 CLIENT_APP_URL이 아니라 여기서 왕복시킨 값으로 결정해야 한다. */
  returnOrigin: string;
}

/**
 * OAuth 플로우 시작 시점에 실제로 인증된 uid와 되돌아갈 origin을 서버 쪽에 짧게
 * 보관하고, 이를 가리키는 무작위 1회용 토큰을 발급한다. 이 토큰이 `/oauth/start`
 * 응답의 `state` 파라미터로 나간다 — `/oauth/callback`은 Authorization 헤더가
 * 없는 리다이렉트 엔드포인트라 uid를 직접 검증할 방법이 없으므로, uid 그 자체가
 * 아니라 이 무작위 토큰만 왕복시켜야 위조를 막을 수 있다.
 */
export const createOAuthState = async (
  kv: KVNamespace,
  uid: string,
  returnOrigin: string,
): Promise<string> => {
  const state = crypto.randomUUID();
  const record: OAuthStateRecord = { uid, returnOrigin };
  await kv.put(oauthStateKey(state), JSON.stringify(record), { expirationTtl: OAUTH_STATE_TTL_SECONDS });
  return state;
};

/** state 토큰으로 원래 uid·returnOrigin을 조회하고 즉시 삭제한다(재사용 방지).
 *  없거나 이미 소비됐거나 만료됐으면 null. */
export const consumeOAuthState = async (
  kv: KVNamespace,
  state: string,
): Promise<OAuthStateRecord | null> => {
  const raw = await kv.get(oauthStateKey(state));
  if (!raw) return null;
  await kv.delete(oauthStateKey(state));
  return JSON.parse(raw) as OAuthStateRecord;
};
