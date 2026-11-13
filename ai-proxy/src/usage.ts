/** 날짜별 키가 쌓이지 않도록 2일 뒤 자동 삭제. 하루 경계를 넘긴 조회가 없으니 2일이면 충분하다. */
export const USAGE_TTL_SECONDS = 60 * 60 * 24 * 2;

const seoulFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 사용량 집계 날짜. 클라이언트가 보낸 today로 세면 날짜를 바꿔 보내는 것만으로
 * 한도를 우회할 수 있으므로 서버 시계 기준 서울 날짜를 쓴다. en-CA 로캘은
 * YYYY-MM-DD 형식으로 포맷한다.
 */
export const seoulDateKey = (now: Date): string => seoulFormatter.format(now);

/** usage = 성공한 계획 수(하루 한도·클라이언트 표시용), attempts = Claude까지 간 시도 수(실패 포함). */
type CounterKind = "usage" | "attempts";

const counterKey = (kind: CounterKind, uid: string, now: Date): string =>
  `${kind}:${uid}:${seoulDateKey(now)}`;

const readCounter = async (kv: KVNamespace, key: string): Promise<number> => {
  const raw = await kv.get(key);
  const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const bumpCounter = async (kv: KVNamespace, key: string): Promise<number> => {
  const next = (await readCounter(kv, key)) + 1;
  await kv.put(key, String(next), { expirationTtl: USAGE_TTL_SECONDS });
  return next;
};

export const getUsage = (kv: KVNamespace, uid: string, now: Date): Promise<number> =>
  readCounter(kv, counterKey("usage", uid, now));

/**
 * 쓰기 직전에 최신값을 다시 읽어 latest+1을 쓴다(게이트 체크 때 읽은 값을 그대로
 * 쓰지 않는다). AI 호출 동안 다른 요청이 먼저 끝나 카운트를 올려놔도 그 값을
 * 반영한다. 알고 감수한 한계: KV get/put 자체는 여전히 원자적이지 않아, 이
 * 재조회~쓰기 사이 수 ms 창에서 완전히 동시에 끝나는 요청은 한도를 소폭 넘길 수
 * 있다. 목적이 남용 방지(정확한 과금 아님)라 감수한다. 결제(프리미엄 조각 3)
 * 도입 시 Durable Object 전환을 다시 검토한다.
 */
export const incrementUsage = (kv: KVNamespace, uid: string, now: Date): Promise<number> =>
  bumpCounter(kv, counterKey("usage", uid, now));

/** 시도 카운터도 같은 재조회~쓰기 방식이라 위 비원자성 한계를 그대로 가진다. */
export const getAttempts = (kv: KVNamespace, uid: string, now: Date): Promise<number> =>
  readCounter(kv, counterKey("attempts", uid, now));

export const incrementAttempts = (kv: KVNamespace, uid: string, now: Date): Promise<number> =>
  bumpCounter(kv, counterKey("attempts", uid, now));
