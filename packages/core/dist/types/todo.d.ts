/**
 * 반복 규칙. client/src/features/todo/types/todo.type.ts의 RecurrenceRule과 동일한
 * shape을 그대로 옮긴 것 — 값 이름/의미도 동일하다.
 * - 모든 인스턴스(Todo 문서)가 동일한 recurrenceId를 공유하고, 이 규칙 값도
 *   각 인스턴스에 비정규화되어 저장된다 (별도의 "시리즈 루트" 문서 없음).
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
    priority: "low" | "medium" | "high";
    startAt: string | null;
    dueAt: string | null;
    doneAt: string | null;
    parentId: string | null;
    order: number;
    createdAt: string;
    updatedAt: string;
    /** 기존 문서엔 필드가 없을 수 있어 optional — 없으면 archived 아닌 것으로 취급한다. */
    archived?: boolean;
    /** 반복 규칙. null이면 반복 아님. parentId가 있으면 항상 null이어야 한다(상호 배제).
     *  client와 동일하게 optional/nullable로 추가 — 기존 문서엔 필드가 없을 수 있다. */
    recurrence?: RecurrenceRule | null;
    /** 같은 반복 시리즈에 속한 인스턴스들을 묶는 그룹 id. 반복 아니면 null. */
    recurrenceId?: string | null;
    /** 지난 미완료(overdue) 반복 투두 인스턴스가 archived 처리되었는지 여부. true면
     *  목록/칸반의 대표 노출(collapseRecurringInstances) 후보에서 제외된다.
     *  기존 문서엔 필드가 없을 수 있어 optional — 없으면 아닌 것으로 취급한다. */
    overdueArchived?: boolean;
}
/** 생성 시 클라이언트가 채우는 부분집합. status/doneAt/timestamps는 서버 쪽(todoApi)이 채운다. */
interface TodoFields {
    title: string;
    description?: string;
    priority: Todo["priority"];
    startAt: string | null;
    dueAt: string | null;
    parentId: string | null;
    order: number;
}
export type { Todo, TodoFields, RecurrenceRule };
