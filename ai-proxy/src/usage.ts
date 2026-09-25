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

const usageKey = (uid: string, now: Date): string => `usage:${uid}:${seoulDateKey(now)}`;

export const getUsage = async (kv: KVNamespace, uid: string, now: Date): Promise<number> => {
  const raw = await kv.get(usageKey(uid, now));
  const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * 쓰기 직전에 최신값을 다시 읽어 latest+1을 쓴다(게이트 체크 때 읽은 값을 그대로
 * 쓰지 않는다). AI 호출 동안 다른 요청이 먼저 끝나 카운트를 올려놔도 그 값을
 * 반영한다. 알고 감수한 한계: KV get/put 자체는 여전히 원자적이지 않아, 이
 * 재조회~쓰기 사이 수 ms 창에서 완전히 동시에 끝나는 요청은 한도를 소폭 넘길 수
 * 있다. 목적이 남용 방지(정확한 과금 아님)라 감수한다. 결제(프리미엄 조각 3)
 * 도입 시 Durable Object 전환을 다시 검토한다.
 */
export const incrementUsage = async (kv: KVNamespace, uid: string, now: Date): Promise<number> => {
  const current = await getUsage(kv, uid, now);
  const next = current + 1;
  await kv.put(usageKey(uid, now), String(next), { expirationTtl: USAGE_TTL_SECONDS });
  return next;
};
