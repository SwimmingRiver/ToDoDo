export interface PlanRequest {
  goal: string;
  dueDate: string | null;
  /** 사용자 기기의 로컬 날짜. AI 날짜 배치 기준으로만 쓰고, 사용량 집계에는 쓰지 않는다. */
  today: string;
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const GOAL_MAX_LENGTH = 200;

/** "2026-02-30"처럼 형식만 맞고 실재하지 않는 날짜도 거른다. */
export const isValidDateKey = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = DATE_KEY_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export const parsePlanRequest = (body: unknown): PlanRequest | null => {
  if (typeof body !== "object" || body === null) return null;
  const { goal, dueDate, today } = body as Record<string, unknown>;

  if (typeof goal !== "string") return null;
  const trimmedGoal = goal.trim();
  if (trimmedGoal.length === 0 || trimmedGoal.length > GOAL_MAX_LENGTH) return null;

  if (!isValidDateKey(today)) return null;

  let normalizedDue: string | null = null;
  if (dueDate !== undefined && dueDate !== null) {
    if (!isValidDateKey(dueDate)) return null;
    // YYYY-MM-DD는 사전순 비교가 날짜순 비교와 같다.
    if (dueDate < today) return null;
    normalizedDue = dueDate;
  }

  return { goal: trimmedGoal, dueDate: normalizedDue, today };
};

/**
 * 글자(유니코드 문자)가 하나도 없는 입력 — 숫자·이모지·문장부호·공백만 — 은 목표로 볼 수 없어
 * Claude에 보내지 않는다. 한글 자모("ㅋㅋㅋ")는 글자라 통과시킨다: 같은 글자 반복·무관한 문장은
 * 정상 입력과 판별이 애매해 걸러내지 않고, 비용은 하루 시도 상한이 막는다.
 */
export const isNotAGoal = (goal: string): boolean => !/\p{L}/u.test(goal.trim());
