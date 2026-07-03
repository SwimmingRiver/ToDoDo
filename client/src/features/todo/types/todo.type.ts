/**
 * 반복 규칙.
 * - 모든 인스턴스(Todo 문서)가 동일한 recurrenceId를 공유하고, 이 규칙 값도
 *   각 인스턴스에 비정규화되어 저장된다 (별도의 "시리즈 루트" 문서 없음).
 *   따라서 시리즈의 어느 인스턴스를 열어도 규칙을 읽고 전체 수정할 수 있다.
 */
interface RecurrenceRule {
  type: "daily" | "weekly" | "monthly";
  /** 0=일 ~ 6=토. type==="weekly"일 때만 사용, 최소 1개 이상이어야 한다. */
  weekdays?: number[];
  endType: "indefinite" | "untilDate";
  /** endType==="untilDate"일 때만 사용 (ISO date string) */
  endDate?: string | null;
}

interface Todo {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: "todo" | "doing" | "done";
  createdAt: string;
  updatedAt: string;
  startAt: string | null;
  dueAt: string | null;
  doneAt: string | null;
  priority: "low" | "medium" | "high";
  parentId: string | null;
  order: number;
  /** 반복 규칙. null이면 반복 아님. parentId가 있으면 항상 null이어야 한다(상호 배제). */
  recurrence: RecurrenceRule | null;
  /** 같은 반복 시리즈에 속한 인스턴스들을 묶는 그룹 id. 반복 아니면 null. */
  recurrenceId: string | null;
}

export type { Todo, RecurrenceRule };
