import type { FilterableTodo, TodoFilter } from "./matchTodo";
export interface CompletableTodo extends FilterableTodo {
    id: string;
    parentId: string | null;
    status: string;
    recurrenceId?: string | null;
    doneAt?: string | null;
    updatedAt: string;
}
export type CompletedCard<T> = {
    kind: "project";
    key: string;
    root: T;
    children: T[];
    completedAt: string;
    matchedChildIds: ReadonlySet<string>;
} | {
    kind: "series";
    key: string;
    root: T;
    count: number;
    completedAt: string;
};
export interface CompletedMonthGroup<T> {
    monthKey: string;
    cards: CompletedCard<T>[];
}
/** 완료 탭용: 완료 루트를 월별로 묶고, 반복 회차는 (시리즈, 월) 단위 카드 한 장으로 합친다. */
export declare function buildCompletedGroups<T extends CompletableTodo>(todos: readonly T[], filter: TodoFilter): CompletedMonthGroup<T>[];
