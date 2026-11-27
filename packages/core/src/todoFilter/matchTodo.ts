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

export const EMPTY_TODO_FILTER: TodoFilter = { query: "", priorities: [] };

const normalize = (s: string): string => s.normalize("NFC").toLocaleLowerCase();

const normalizedQuery = (filter: TodoFilter): string => normalize(filter.query.trim());

export function isTodoFilterActive(filter: TodoFilter): boolean {
  return normalizedQuery(filter) !== "" || filter.priorities.length > 0;
}

export function matchesTodoFilter(todo: FilterableTodo, filter: TodoFilter): boolean {
  const query = normalizedQuery(filter);
  if (query !== "") {
    const hit =
      normalize(todo.title).includes(query) ||
      (todo.description != null && normalize(todo.description).includes(query));
    if (!hit) return false;
  }
  if (filter.priorities.length > 0) {
    if (todo.priority == null || !filter.priorities.includes(todo.priority)) return false;
  }
  return true;
}
