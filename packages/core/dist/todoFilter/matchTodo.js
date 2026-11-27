export const EMPTY_TODO_FILTER = { query: "", priorities: [] };
const normalize = (s) => s.normalize("NFC").toLocaleLowerCase();
const normalizedQuery = (filter) => normalize(filter.query.trim());
export function isTodoFilterActive(filter) {
    return normalizedQuery(filter) !== "" || filter.priorities.length > 0;
}
export function matchesTodoFilter(todo, filter) {
    const query = normalizedQuery(filter);
    if (query !== "") {
        const hit = normalize(todo.title).includes(query) ||
            (todo.description != null && normalize(todo.description).includes(query));
        if (!hit)
            return false;
    }
    if (filter.priorities.length > 0) {
        if (todo.priority == null || !filter.priorities.includes(todo.priority))
            return false;
    }
    return true;
}
