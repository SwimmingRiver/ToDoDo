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
 * 한글 자모: 호환(U+3131–U+318E), 첫가끝(U+1100–U+11FF), 확장 A(U+A960–U+A97F)·B(U+D7B0–U+D7FF),
 * 반각(U+FFA0–U+FFDC).
 */
const HANGUL_JAMO = /[\u3131-\u318E\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF\uFFA0-\uFFDC]/u;

/**
 * Claude에 보내기 전에 규칙으로 거르는 입력.
 * - 글자(유니코드 문자)가 하나도 없음: 숫자·이모지·문장부호·공백만.
 * - 글자가 모두 한글 자모: "ㅋㅋ", "ㅠㅠ 123". 자모만으로 된 목표는 사실상 없어 오판 위험이 낮다.
 *   완성 글자가 하나라도 섞이면("ㅋㅋ 토익 공부") 통과시킨다.
 * 그 밖의 무관한 입력("날씨 어때", "asdf")은 모델이 isGoal로 판단한다(11-14 결정, #174의 "자모 통과"를 뒤집음).
 */
export const isNotAGoal = (goal: string): boolean => {
  // NFC 먼저: macOS 파일명 등에서 붙여 넣은 NFD 한글("토익"이 초성·중성 낱자로 분해된 형태)은
  // 첫가끝 자모로만 이뤄져 정상 목표가 자모 입력으로 오판된다. 합쳐질 수 없는 낱자만 남게 한다.
  const letters = goal.normalize("NFC").trim().match(/\p{L}/gu) ?? [];
  return letters.every((ch) => HANGUL_JAMO.test(ch));
};
