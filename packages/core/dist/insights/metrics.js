import { toDateKey, toDateKeyFromISO } from "./date";
import { scopeTodosByRange } from "./filter";
const toRate = (list) => {
    const completed = list.filter((todo) => todo.status === "done").length;
    return { completed, total: list.length, rate: list.length === 0 ? 0 : completed / list.length };
};
/** 기간 내 완료율. 기간 소속 규칙은 scopeTodosByRange 참고. */
export const computeCompletionRate = (todos, range) => toRate(scopeTodosByRange(todos, range));
/**
 * 오늘부터 거꾸로 센 연속 완료일 수. 오늘 아직 완료가 없어도 어제까지 이어진
 * 스트릭은 끊지 않는다(오늘이 아직 안 끝났을 뿐일 수 있음). 기간/프로젝트 필터와
 * 무관하게 항상 전체 todos·전체 기간으로 계산한다 — 프로젝트별 연속 달성일은
 * 의미가 약하다.
 */
export const computeStreak = (todos, now = new Date()) => {
    const doneDateKeys = new Set(todos
        .filter((todo) => todo.status === "done" && !!todo.doneAt)
        .map((todo) => toDateKeyFromISO(todo.doneAt)));
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!doneDateKeys.has(toDateKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
    }
    let streak = 0;
    while (doneDateKeys.has(toDateKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
};
/** 범위 안 완료 항목만 대상으로 우선순위별 개수. */
export const computePriorityDistribution = (todos, range) => {
    const done = scopeTodosByRange(todos, range).filter((todo) => todo.status === "done");
    return {
        low: done.filter((todo) => todo.priority === "low").length,
        medium: done.filter((todo) => todo.priority === "medium").length,
        high: done.filter((todo) => todo.priority === "high").length,
    };
};
/**
 * 반복 vs 단발 완료율. 레거시 문서는 recurrence 필드 자체가 없어 undefined일 수
 * 있으므로 loose null 체크(`!= null`)로 "반복"을 판단한다.
 */
export const computeRecurringVsOneOffRate = (todos, range) => {
    const scoped = scopeTodosByRange(todos, range);
    return {
        recurring: toRate(scoped.filter((todo) => todo.recurrence != null)),
        oneOff: toRate(scoped.filter((todo) => todo.recurrence == null)),
    };
};
/** 기한 준수율 — dueAt·doneAt이 모두 있는 범위 안 완료 항목 중 마감 이내에 끝낸 비율. */
export const computeDueAdherence = (todos, range) => {
    const doneWithDue = scopeTodosByRange(todos, range).filter((todo) => todo.status === "done" && !!todo.dueAt && !!todo.doneAt);
    const onTime = doneWithDue.filter((todo) => new Date(todo.doneAt).getTime() <= new Date(todo.dueAt).getTime());
    return {
        completed: onTime.length,
        total: doneWithDue.length,
        rate: doneWithDue.length === 0 ? 0 : onTime.length / doneWithDue.length,
    };
};
/**
 * 프로젝트의 현재 상태 구성. 기간 필터를 타지 않는다("지금 어디쯤인가"). 루트의
 * status는 자식에서 도출되는 값이라 이중 계산을 피하려 자식만 세고, 자식이 없는
 * 루트면 루트 자신 1건을 센다.
 */
export const computeStatusBreakdown = (projectScopedTodos, projectId) => {
    const children = projectScopedTodos.filter((todo) => todo.parentId === projectId);
    const target = children.length > 0 ? children : projectScopedTodos.filter((todo) => todo.id === projectId);
    return {
        todo: target.filter((todo) => todo.status === "todo").length,
        doing: target.filter((todo) => todo.status === "doing").length,
        done: target.filter((todo) => todo.status === "done").length,
    };
};
/**
 * 프로젝트 select 옵션: 하위 할 일이 하나라도 있는 루트만, 진행 중 먼저 → 완료 순,
 * 각 그룹은 updatedAt 내림차순. 자식 없는 단독 할 일은 "프로젝트별로 기록을 본다"는
 * 목적에 맞지 않고 옵션만 길어지므로 제외한다. 자식이 아카이브됐어도 통계는 전체
 * 이력을 보므로(getAllTodosForStats) 부모는 옵션에 남는다.
 */
export const listProjectOptions = (todos) => {
    const parentIds = new Set(todos.map((todo) => todo.parentId).filter((id) => id !== null));
    return todos
        .filter((todo) => todo.parentId === null && parentIds.has(todo.id))
        .sort((a, b) => {
        const aDone = a.status === "done" ? 1 : 0;
        const bDone = b.status === "done" ? 1 : 0;
        if (aDone !== bDone)
            return aDone - bDone;
        return b.updatedAt.localeCompare(a.updatedAt);
    })
        .map((todo) => ({ id: todo.id, title: todo.title, isDone: todo.status === "done" }));
};
