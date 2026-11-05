import { type Firestore } from "firebase/firestore";
import type { RecurrenceRule, Todo } from "../types/todo";
/**
 * 반복 시리즈 생성·수정 입력. 웹은 폼에서 만든 Todo 전체를 넘기고, 모바일은 필요한
 * 필드만 넘길 수 있도록 나머지 Todo 필드는 optional로 둔다. 런타임은 웹과 동일하게
 * 입력의 나머지 키를 인스턴스 문서에 그대로 펼쳐 넣는다.
 */
export type RecurringTodoInput = {
    id?: string;
    title: string;
    description?: string;
    priority: Todo["priority"];
    startAt: string | null;
    dueAt: string | null;
    parentId: string | null;
    recurrence: RecurrenceRule | null;
    recurrenceId?: string | null;
} & Partial<Omit<Todo, "id">>;
/**
 * 반복 규칙이 설정된 할 일을 저장한다. generateRecurringDueDates로 계산한 dueAt마다
 * 하나씩 Todo 문서를 batch 생성하고, 모두 동일한 recurrenceId(신규 Firestore 문서 id)를
 * 부여해 같은 시리즈로 묶는다. 개별 인스턴스는 status: "todo"로 시작한다.
 */
export declare const createRecurringTodo: (db: Firestore, userId: string, todo: RecurringTodoInput, horizonEnd?: Date) => Promise<Todo[]>;
/**
 * 반복 시리즈 전체 수정. 입력은 시리즈 대표 todo(수정 폼에서 편집 중인 인스턴스)의
 * 새 필드값 + 새 recurrence 규칙이다 (recurrence가 null이면 반복 OFF 전환).
 *
 * 같은 recurrenceId를 가진 모든 인스턴스를 조회한 뒤 3단 분기로 처리한다:
 *  1) status가 "done" 또는 "doing" → 그대로 보존 (필드 값 포함 전혀 건드리지 않음)
 *  2) status가 "todo"이고 dueAt < 오늘(지난 미완료 = overdue) → 그대로 보존
 *  3) status가 "todo"이고 dueAt >= 오늘(미래) → 삭제 후, 새 규칙/새 필드값으로 재생성
 *     (재생성 시작 기준일은 새 dueAt부터 horizonEnd까지, 오늘 이전 발생일은 제외)
 *
 * recurrence를 null로 바꿔 반복을 끄는 저장도 동일한 3단 분기를 따른다: done/doing/overdue는
 * 그대로 두고, 미래 "todo" 인스턴스만 재생성 없이 완전히 삭제한다(문서 자체가 사라지므로
 * recurrenceId도 함께 사라진다).
 */
export declare const editRecurringSeries: (db: Firestore, userId: string, seriesTodo: RecurringTodoInput & {
    id: string;
}, horizonEnd?: Date) => Promise<void>;
/**
 * 반복 시리즈 전체 삭제. editRecurringSeries(부분 수정)와 달리, 사용자가 명시적으로
 * "삭제"를 선택한 경우이므로 done/doing/overdue를 보존하지 않고 같은 recurrenceId를
 * 가진 모든 인스턴스를 예외 없이 삭제한다.
 */
export declare const deleteRecurringSeries: (db: Firestore, userId: string, recurrenceId: string) => Promise<void>;
