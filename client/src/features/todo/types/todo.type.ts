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
  /** 기본 조회(getTodos)에서 제외할지 여부. true면 30일 지난 완료 프로젝트(루트+자식)로 간주.
   *  기존 문서엔 필드가 없을 수 있어 optional — 없으면 archived 아닌 것으로 취급한다. */
  archived?: boolean;
  /** 지난 미완료(overdue) 반복 투두 인스턴스가 archived 처리되었는지 여부. true면
   *  목록/칸반의 대표 노출(collapseRecurringInstances) 후보에서 제외된다.
   *  위 `archived`와 의도적으로 분리된 별도 필드다 — `archived`는 getTodos()의 Firestore
   *  쿼리(`where("archived", "==", false)`) 단계에서 걸러지므로, 이 정책에 그대로 재사용하면
   *  캘린더(이 정책 대상에서 제외되어야 함)도 getTodos() 결과에서 함께 사라져 버린다.
   *  overdueArchived는 Firestore 쿼리에서는 걸러지지 않고 애플리케이션 레이어
   *  (collapseRecurringInstances)에서만 걸러지므로, 캘린더는 손대지 않아도 계속 그대로
   *  렌더링된다. 기존 문서엔 필드가 없을 수 있어 optional — 없으면 archived 아닌 것으로
   *  취급한다. */
  overdueArchived?: boolean;
  /** 구글 캘린더에 매핑된 이벤트 ID. 연동 안 됐거나 아직 동기화 전이면 없음(optional).
   *  useSyncTodosToCalendar가 /sync-todos 응답을 받아 기록한다. */
  googleEventId?: string | null;
}

/** 칸반 같은 컬럼 내 드래그 재정렬 시 bulk write할 order 변경분. */
interface TodoReorderUpdate {
  id: string;
  order: number;
}

export type { Todo, RecurrenceRule, TodoReorderUpdate };
