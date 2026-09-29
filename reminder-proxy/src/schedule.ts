import {
  computeFireAt,
  resolveReminderOffset,
  type ReminderOffsetMinutes,
} from "@tododo/core/dist/reminders/index.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** 예약표에 담는 범위. 이보다 먼 알림은 창이 끝날 때(windowEnd 알람) 다시 계산한다. */
export const WINDOW_MS = 7 * DAY;
/** Firestore 조회 범위 = 창 + 최대 오프셋(하루 전). */
export const QUERY_SPAN_MS = WINDOW_MS + DAY;
/** 알람이 늦게 울렸을 때 마감 후 이 시간까지만 보낸다. 더 늦으면 소음이다. */
export const LATE_GRACE_MS = 5 * MINUTE;

export interface ReminderTodo {
  id: string;
  userId: string;
  title: string;
  status: string;
  archived: boolean;
  dueAt: string | null;
  reminderOffsetMinutes: unknown;
}

export interface ScheduleEntry {
  todoId: string;
  fireAt: number;
  dueAt: string;
  offsetMinutes: ReminderOffsetMinutes;
}

export const computeSchedule = (
  todos: ReminderTodo[],
  userDefault: unknown,
  now: number,
): ScheduleEntry[] => {
  const windowEnd = now + WINDOW_MS;
  const entries: ScheduleEntry[] = [];
  for (const todo of todos) {
    if (!todo.dueAt || todo.status === "done" || todo.archived) continue;
    const offset = resolveReminderOffset(todo.reminderOffsetMinutes, userDefault);
    if (offset === null) continue;
    const fireAt = computeFireAt(todo.dueAt, offset);
    // 이미 지난 알림은 건너뛴다(스펙 결정): 방금 만든 할 일에 즉시 알림이 오면 소음이다.
    if (Number.isNaN(fireAt) || fireAt <= now || fireAt > windowEnd) continue;
    entries.push({ todoId: todo.id, fireAt, dueAt: todo.dueAt, offsetMinutes: offset });
  }
  return entries.sort((a, b) => a.fireAt - b.fireAt);
};

export type SkipReason = "missing" | "done" | "archived" | "dueAtChanged" | "tooLate";

/** 발송 직전 재조회한 할 일(current)로 예약이 아직 유효한지 판단한다. */
export const shouldSend = (
  entry: ScheduleEntry,
  current: ReminderTodo | null,
  now: number,
): { send: true } | { send: false; reason: SkipReason } => {
  if (!current) return { send: false, reason: "missing" };
  if (current.status === "done") return { send: false, reason: "done" };
  if (current.archived) return { send: false, reason: "archived" };
  if (current.dueAt !== entry.dueAt) return { send: false, reason: "dueAtChanged" };
  if (now > Date.parse(entry.dueAt) + LATE_GRACE_MS) return { send: false, reason: "tooLate" };
  return { send: true };
};
