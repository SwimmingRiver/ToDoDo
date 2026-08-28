import type { Todo } from "@tododo/core";
import { getDateKeysInRange, toDateKeyFromISO } from "./dateRange";
import { isTodoOverdue } from "./due";
import { statusColors } from "../../theme/statusColors";
import { colors } from "../../theme/colors";

export interface CalendarDot {
  key: string;
  color: string;
}

export type CalendarMarkedDates = Record<string, { dots: CalendarDot[]; selected?: boolean }>;

// "완료"는 애초에 마커 대상에서 제외되므로 todo/doing만 순서를 정의한다.
const DOT_ORDER = ["todo", "doing"] as const;

function getTodoDateKeys(todo: Todo): string[] {
  const startKey = todo.startAt ? toDateKeyFromISO(todo.startAt) : null;
  const dueKey = todo.dueAt ? toDateKeyFromISO(todo.dueAt) : null;
  if (startKey && dueKey) return getDateKeysInRange(startKey, dueKey);
  if (startKey) return [startKey];
  if (dueKey) return [dueKey];
  return [];
}

/**
 * 날짜별 캘린더 마커(react-native-calendars의 markingType="multi-dot" 입력)를 계산한다.
 * 정책(스펙 5절): overdue(마감 지났고 미완료)가 하나라도 있으면 그 날짜는 danger 점
 * 하나만 표시("위험 신호" 우선, 다른 상태는 그 날짜에서 숨겨진다). overdue가 없으면
 * 그 날짜에 걸친 미완료 상태들의 색을 todo→doing 순서로 각각 표시한다. 완료만 있는
 * 날짜는 마커를 아예 남기지 않는다.
 */
export function buildCalendarMarkedDates(todos: Todo[]): CalendarMarkedDates {
  const byDate = new Map<string, Map<string, string>>();

  for (const todo of todos) {
    if (todo.status === "done") continue;
    const overdue = isTodoOverdue(todo);
    const colorKey = overdue ? "overdue" : todo.status;
    const color = overdue ? colors.danger.main : statusColors[todo.status].main;

    for (const dateKey of getTodoDateKeys(todo)) {
      if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
      byDate.get(dateKey)!.set(colorKey, color);
    }
  }

  const result: CalendarMarkedDates = {};
  for (const [dateKey, colorMap] of byDate) {
    if (colorMap.has("overdue")) {
      result[dateKey] = { dots: [{ key: "overdue", color: colorMap.get("overdue")! }] };
      continue;
    }
    const dots = DOT_ORDER.filter((key) => colorMap.has(key)).map((key) => ({
      key,
      color: colorMap.get(key)!,
    }));
    result[dateKey] = { dots };
  }
  return result;
}
