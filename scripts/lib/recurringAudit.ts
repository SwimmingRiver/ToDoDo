/**
 * 운영 todos 데이터 정합성 점검(읽기 전용)의 판정 로직. Firestore에 의존하지 않는 순수 함수라
 * 운영 데이터 없이 테스트할 수 있다(recurringAudit.test.ts).
 *
 * 점검 항목은 docs/data-model/recurring-todos.md의 "알려진 구멍 G4" 중 데이터로 판별 가능한 두 가지다.
 * - 고아 하위 할 일: parentId가 가리키는 문서가 없다(#200 이전 반복 시리즈 삭제 경로에서 생김).
 * - 공유된 구글 일정 id: 한 사용자의 여러 문서가 같은 googleEventId를 가진다(#167 이전 회차 복사에서 생김).
 *
 * 반복을 끈 옛 시리즈(#161 이전)는 데이터로 정상 시리즈와 구별할 수 없어 점검하지 않는다.
 */

/** 점검에 필요한 필드만. 제목·설명 같은 내용 필드는 받지 않는다(읽지도 않는다). */
export interface AuditTodo {
  id: string;
  userId: string;
  parentId: string | null;
  recurrenceId: string | null;
  dueAt: string | null;
  archived: boolean;
  googleEventId: string | null;
}

export interface OrphanReport {
  /** 부모 문서가 아예 없는 하위 할 일 */
  total: number;
  /** 그중 캘린더 동기화 대상(마감 있음 + 보관 안 됨) — 구글 캘린더에 일정이 남아 있을 수 있다 */
  calendarEligible: number;
  /** 그중 이미 구글 일정과 연결된 것 */
  withGoogleEventId: number;
  /** 부모 문서는 있는데 다른 사용자 소유인 하위 할 일(정상이라면 0이어야 함) */
  parentOwnedByOtherUser: number;
  orphanIds: string[];
}

export interface SharedEventGroup {
  /** 같은 googleEventId를 가진 문서 id들 */
  todoIds: string[];
  /** 모두 같은 반복 시리즈(recurrenceId)에 속하는지 — #167 회차 복사로 생긴 전형적인 모양 */
  sameSeries: boolean;
}

export interface SharedEventReport {
  groups: number;
  /** 공유 그룹에 속한 문서 수 합계 */
  todos: number;
  sameSeriesGroups: number;
  otherGroups: number;
  details: SharedEventGroup[];
}

export interface AuditReport {
  totalTodos: number;
  orphans: OrphanReport;
  sharedEvents: SharedEventReport;
}

export const auditTodos = (todos: AuditTodo[]): AuditReport => {
  const byId = new Map(todos.map((t) => [t.id, t]));

  const orphanIds: string[] = [];
  let calendarEligible = 0;
  let withGoogleEventId = 0;
  let parentOwnedByOtherUser = 0;

  for (const todo of todos) {
    if (!todo.parentId) continue;
    const parent = byId.get(todo.parentId);
    if (!parent) {
      orphanIds.push(todo.id);
      if (todo.dueAt && !todo.archived) calendarEligible += 1;
      if (todo.googleEventId) withGoogleEventId += 1;
    } else if (parent.userId !== todo.userId) {
      parentOwnedByOtherUser += 1;
    }
  }

  // googleEventId는 사용자 캘린더 안에서만 의미가 있으므로 사용자별로 묶는다.
  const byEvent = new Map<string, AuditTodo[]>();
  for (const todo of todos) {
    if (!todo.googleEventId) continue;
    const key = `${todo.userId}\u0000${todo.googleEventId}`;
    const list = byEvent.get(key) ?? [];
    list.push(todo);
    byEvent.set(key, list);
  }

  const details: SharedEventGroup[] = [];
  for (const members of byEvent.values()) {
    if (members.length < 2) continue;
    const firstSeries = members[0].recurrenceId;
    const sameSeries = firstSeries != null && members.every((m) => m.recurrenceId === firstSeries);
    details.push({ todoIds: members.map((m) => m.id).sort(), sameSeries });
  }
  details.sort((a, b) => a.todoIds[0].localeCompare(b.todoIds[0]));

  return {
    totalTodos: todos.length,
    orphans: {
      total: orphanIds.length,
      calendarEligible,
      withGoogleEventId,
      parentOwnedByOtherUser,
      orphanIds: orphanIds.sort(),
    },
    sharedEvents: {
      groups: details.length,
      todos: details.reduce((sum, g) => sum + g.todoIds.length, 0),
      sameSeriesGroups: details.filter((g) => g.sameSeries).length,
      otherGroups: details.filter((g) => !g.sameSeries).length,
      details,
    },
  };
};

/** Firestore 문서 데이터를 AuditTodo로. 필드가 없거나 타입이 다르면 null/false로 본다(옛 문서). */
export const toAuditTodo = (id: string, data: Record<string, unknown>): AuditTodo => {
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    id,
    userId: typeof data.userId === "string" ? data.userId : "",
    parentId: str(data.parentId),
    recurrenceId: str(data.recurrenceId),
    dueAt: str(data.dueAt),
    archived: data.archived === true,
    googleEventId: str(data.googleEventId),
  };
};

/** Firestore에서 읽을 필드 목록. 내용 필드(title·description)는 의도적으로 빼서 내려받지도 않는다. */
export const AUDIT_FIELDS = [
  "userId",
  "parentId",
  "recurrenceId",
  "dueAt",
  "archived",
  "googleEventId",
] as const;
