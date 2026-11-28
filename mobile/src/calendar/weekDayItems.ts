import type { Todo } from "@tododo/core";
import type { GoogleCalendarEvent } from "@tododo/core/dist/calendarSync/index.js";
import { toDateKeyFromISO } from "../shared/utils/dateRange";
import { isTodoOverdue } from "../shared/utils/due";
import { statusColors } from "../theme/statusColors";
import { colors } from "../theme/colors";

/** 주간 보기 하루 줄에 그리는 칩 하나. */
export interface WeekDayItem {
  key: string;
  title: string;
  dotColor: string;
  /** 완료 할 일·구글 일정은 흐린 글자로 그린다. */
  muted: boolean;
  kind: "todo" | "google";
}

// 묶음 순서: 기한 초과(마감일) → 대기 → 진행 중 → 구글 일정 → 완료.
const RANK = { overdue: 0, todo: 1, doing: 2, google: 3, done: 4 } as const;

interface Ranked {
  item: WeekDayItem;
  rank: number;
  dueAt: string | null;
}

/**
 * 그날 줄의 칩 목록. todos·googleEvents는 호출자가 이미 그날 것으로 거른 목록이다
 * (getTodosForDate·isDateInGoogleEventRange — 월간 점·날짜 시트와 같은 기준).
 *
 * 기한 초과 빨강은 마감일 줄의 칩에만 칠한다 — 월간 buildCalendarMarkedDates와 같은 규칙이라
 * 같은 날 월간 빨간 점과 주간 빨간 칩이 맞물린다. 기간 중 다른 날은 상태 색이다.
 */
export function buildWeekDayItems(dateKey: string, todos: Todo[], googleEvents: GoogleCalendarEvent[]): WeekDayItem[] {
  const ranked: Ranked[] = todos.map((todo) => {
    const isOverdueDay = isTodoOverdue(todo) && todo.dueAt !== null && toDateKeyFromISO(todo.dueAt) === dateKey;
    const rank = isOverdueDay ? RANK.overdue : RANK[todo.status];
    return {
      rank,
      dueAt: todo.dueAt,
      item: {
        key: `todo-${todo.id}`,
        title: todo.title,
        dotColor: isOverdueDay ? colors.danger.main : statusColors[todo.status].main,
        muted: todo.status === "done",
        kind: "todo",
      },
    };
  });

  for (const event of googleEvents) {
    ranked.push({
      rank: RANK.google,
      dueAt: event.start,
      item: { key: `google-${event.id}`, title: event.title, dotColor: colors.text.tertiary, muted: true, kind: "google" },
    });
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    // 마감(구글은 시작) 이른 순, 없는 것은 뒤에서 제목 순. ISO 문자열은 UTC Z라 사전순 = 시간순.
    if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    if (a.dueAt && !b.dueAt) return -1;
    if (!a.dueAt && b.dueAt) return 1;
    return a.item.title.localeCompare(b.item.title, "ko");
  });

  return ranked.map((entry) => entry.item);
}
