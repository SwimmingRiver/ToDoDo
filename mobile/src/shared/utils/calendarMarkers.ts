import type { Todo } from "@tododo/core";
import { getDateKeysInRange, toDateKeyFromISO } from "./dateRange";
import { isTodoOverdue } from "./due";
import { statusColors } from "../../theme/statusColors";
import { colors } from "../../theme/colors";

export interface CalendarDot {
  key: string;
  color: string;
  /** 선택된 날짜(어두운 브랜드색 배경) 위에서도 점이 보이도록 별도 지정하는 색. */
  selectedDotColor?: string;
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
    const dueKey = todo.dueAt ? toDateKeyFromISO(todo.dueAt) : null;

    for (const dateKey of getTodoDateKeys(todo)) {
      if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
      // overdue 색은 이 todo의 마감일 자체에만 칠한다 — startAt~dueAt 구간 전체에
      // 칠하면 장기간 todo 하나가 캘린더 여러 날을 통째로 danger로 덮어써 다른
      // todo들의 점을 가려버린다(날짜별 우선순위 결정 로직은 아래에서 그대로 유지).
      const isOverdueDay = overdue && dateKey === dueKey;
      const colorKey = isOverdueDay ? "overdue" : todo.status;
      const color = isOverdueDay ? colors.danger.main : statusColors[todo.status].main;
      byDate.get(dateKey)!.set(colorKey, color);
    }
  }

  const result: CalendarMarkedDates = {};
  for (const [dateKey, colorMap] of byDate) {
    if (colorMap.has("overdue")) {
      result[dateKey] = {
        dots: [
          {
            key: "overdue",
            color: colorMap.get("overdue")!,
            selectedDotColor: colors.background.primary,
          },
        ],
      };
      continue;
    }
    const dots = DOT_ORDER.filter((key) => colorMap.has(key)).map((key) => ({
      key,
      color: colorMap.get(key)!,
      selectedDotColor: colors.background.primary,
    }));
    result[dateKey] = { dots };
  }
  return result;
}
