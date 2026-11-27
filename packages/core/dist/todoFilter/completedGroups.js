import { toDateKeyFromISO, toMonthKey } from "../insights/date";
import { isTodoFilterActive, matchesTodoFilter } from "./matchTodo";
const completedAtOf = (t) => t.doneAt ?? t.updatedAt;
const byCompletedAtDesc = (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
/** 완료 탭용: 완료 루트를 월별로 묶고, 반복 회차는 (시리즈, 월) 단위 카드 한 장으로 합친다. */
export function buildCompletedGroups(todos, filter) {
    const active = isTodoFilterActive(filter);
    const byId = new Map();
    for (const t of todos)
        if (!byId.has(t.id))
            byId.set(t.id, t);
    const childrenOf = new Map();
    const roots = [];
    for (const t of byId.values()) {
        if (t.parentId) {
            const list = childrenOf.get(t.parentId) ?? [];
            list.push(t);
            childrenOf.set(t.parentId, list);
        }
        else if (t.status === "done") {
            roots.push(t);
        }
    }
    const monthOf = (t) => toMonthKey(toDateKeyFromISO(completedAtOf(t)));
    const byMonth = new Map();
    const push = (monthKey, card) => {
        const list = byMonth.get(monthKey) ?? [];
        list.push(card);
        byMonth.set(monthKey, list);
    };
    const seriesGroups = new Map();
    for (const root of roots) {
        const monthKey = monthOf(root);
        if (root.recurrenceId) {
            const key = `${root.recurrenceId}:${monthKey}`;
            const g = seriesGroups.get(key) ?? { monthKey, items: [] };
            g.items.push(root);
            seriesGroups.set(key, g);
            continue;
        }
        const children = childrenOf.get(root.id) ?? [];
        const matchedChildIds = new Set();
        if (active)
            for (const c of children)
                if (matchesTodoFilter(c, filter))
                    matchedChildIds.add(c.id);
        if (active && !matchesTodoFilter(root, filter) && matchedChildIds.size === 0)
            continue;
        push(monthKey, {
            kind: "project",
            key: root.id,
            root,
            children,
            completedAt: completedAtOf(root),
            matchedChildIds,
        });
    }
    for (const [key, g] of seriesGroups) {
        if (active && !g.items.some((t) => matchesTodoFilter(t, filter)))
            continue;
        const latest = g.items.reduce((a, b) => new Date(completedAtOf(b)).getTime() > new Date(completedAtOf(a)).getTime() ? b : a);
        push(g.monthKey, {
            kind: "series",
            key,
            root: latest,
            count: g.items.length,
            completedAt: completedAtOf(latest),
        });
    }
    return [...byMonth.entries()]
        .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
        .map(([monthKey, cards]) => ({ monthKey, cards: cards.sort(byCompletedAtDesc) }));
}
