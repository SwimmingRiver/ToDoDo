import type { Todo } from "@/features/todo";
import type { CompletionRateResult } from "./computeCompletionRate";

interface PriorityDistribution {
  low: number;
  medium: number;
  high: number;
}

/** 완료된 항목만 대상으로 우선순위별 개수를 센다. */
export const computePriorityDistribution = (todos: Todo[]): PriorityDistribution => {
  const done = todos.filter((todo) => todo.status === "done");
  return {
    low: done.filter((todo) => todo.priority === "low").length,
    medium: done.filter((todo) => todo.priority === "medium").length,
    high: done.filter((todo) => todo.priority === "high").length,
  };
};

const toRate = (list: Todo[]): CompletionRateResult => {
  const completed = list.filter((todo) => todo.status === "done").length;
  return { completed, total: list.length, rate: list.length === 0 ? 0 : completed / list.length };
};

/**
 * 반복 투두 vs 일반(1회성) 투두의 완료율 비교. 이 앱의 반복 일정 기능이
 * 강점이므로 "반복 투두를 얼마나 잘 지키는가"를 별도로 보여주면 차별화
 * 포인트가 된다.
 */
export const computeRecurringVsOneOffRate = (
  todos: Todo[],
): { recurring: CompletionRateResult; oneOff: CompletionRateResult } => {
  // 프로젝트 전역 관례(projectCard.tsx, todoDetail.tsx 등)와 동일하게 loose
  // null 체크를 쓴다 — mapDocToTodo가 무검증 캐스팅이라 레거시 문서에는
  // recurrence 필드 자체가 없어 undefined일 수 있는데, strict `!== null`은
  // undefined를 "반복"으로 잘못 분류한다.
  const recurring = todos.filter((todo) => todo.recurrence != null);
  const oneOff = todos.filter((todo) => todo.recurrence == null);
  return { recurring: toRate(recurring), oneOff: toRate(oneOff) };
};

/**
 * 기한 준수율 — dueAt과 doneAt이 모두 있는 완료 항목 중, 마감 시각 이내에
 * 끝낸 비율. dueAt이 없는 완료 항목(기한 없이 만든 할 일)은 애초에 "준수"
 * 개념이 성립하지 않으므로 분모에서 제외한다.
 */
export const computeDueAdherence = (todos: Todo[]): CompletionRateResult => {
  const doneWithDue = todos.filter((todo) => todo.status === "done" && todo.dueAt && todo.doneAt);
  const onTime = doneWithDue.filter(
    (todo) => new Date(todo.doneAt as string).getTime() <= new Date(todo.dueAt as string).getTime(),
  );
  return {
    completed: onTime.length,
    total: doneWithDue.length,
    rate: doneWithDue.length === 0 ? 0 : onTime.length / doneWithDue.length,
  };
};

export type { PriorityDistribution };
