import type { Todo } from "@/features/todo";
import { toDateKey, toDateKeyFromISO } from "@/shared/utils/date";

interface CompletionRateResult {
  completed: number;
  total: number;
  /** total이 0이면 0. */
  rate: number;
}

/**
 * now를 포함해 최근 `days`일의 로컬 날짜 키 집합을 만든다. ms 차이 계산 대신
 * 날짜 키 문자열로 비교하는 이유는 dueAt/startAt가 UTC ISO로 저장돼 있어서
 * (project convention, dueat-utc-storage 참고) ms 뺄셈은 DST/타임존 경계에서
 * 하루가 어긋날 수 있기 때문이다. toDateKeyFromISO로 로컬 날짜로 변환한 뒤
 * 문자열로만 비교하면 이 문제를 피할 수 있다.
 */
const buildRecentDateKeySet = (now: Date, days: number): Set<string> => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const keys = new Set<string>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() - i);
    keys.add(toDateKey(d));
  }
  return keys;
};

/**
 * 기간 내 완료율. 기준 날짜는 dueAt(없으면 doneAt)으로 판단한다 — "이 기간에
 * 처리했어야 할 일 중 얼마나 끝냈는가"를 보여주기 위함이다. 어느 쪽도 없는
 * Todo(기한 없이 만든 뒤 아직 완료 전인 항목)는 기간 스코프에서 제외한다.
 * `days`를 생략하면 전체 기간을 스코프로 잡는다.
 */
export const computeCompletionRate = (
  todos: Todo[],
  options?: { days?: number; now?: Date },
): CompletionRateResult => {
  const { days, now = new Date() } = options ?? {};
  const recentKeys = days !== undefined ? buildRecentDateKeySet(now, days) : null;

  const scoped = todos.filter((todo) => {
    if (!recentKeys) return true;
    const dateStr = todo.dueAt ?? todo.doneAt;
    if (!dateStr) return false;
    return recentKeys.has(toDateKeyFromISO(dateStr));
  });

  const completed = scoped.filter((todo) => todo.status === "done").length;
  const total = scoped.length;
  return { completed, total, rate: total === 0 ? 0 : completed / total };
};

export type { CompletionRateResult };
