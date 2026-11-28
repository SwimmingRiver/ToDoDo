export type TodoPriority = "low" | "medium" | "high";
export interface TodoFilter {
    query: string;
    priorities: readonly TodoPriority[];
}
export interface FilterableTodo {
    title: string;
    description?: string | null;
    priority?: TodoPriority | null;
}
export declare const EMPTY_TODO_FILTER: TodoFilter;
export declare function isTodoFilterActive(filter: TodoFilter): boolean;
export declare function matchesTodoFilter(todo: FilterableTodo, filter: TodoFilter): boolean;
