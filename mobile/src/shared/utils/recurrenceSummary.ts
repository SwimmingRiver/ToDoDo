// client/src/features/todo/utils/recurrenceSummary.ts 로직을 그대로 포팅한다.
import type { RecurrenceRule } from "@tododo/core";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 반복 규칙을 사람이 읽을 수 있는 한 줄 요약으로 변환하는 표시 전용 함수.
 * (예: "매일 반복", "매주 월・수・금 반복", "매월 10일 반복")
 *
 * monthly 요약은 RecurrenceRule 자체에 '일(day)' 정보가 없으므로(day는 dueAt에서 유도되는
 * 값) 해당 인스턴스의 dueAt을 함께 받아 계산한다.
 */
export function formatRecurrenceSummary(rule: RecurrenceRule, dueAt: string | null): string {
  if (rule.type === "daily") {
    return "매일 반복";
  }

  if (rule.type === "weekly") {
    const days = (rule.weekdays ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d]);
    if (days.length === 0) return "매주 반복";
    return `매주 ${days.join("・")} 반복`;
  }

  // monthly
  if (dueAt) {
    const day = new Date(dueAt).getDate();
    return `매월 ${day}일 반복`;
  }
  return "매월 반복";
}
