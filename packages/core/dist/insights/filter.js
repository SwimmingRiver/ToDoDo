import { addDaysToKey, toDateKey, toDateKeyFromISO } from "./date";
export const DEFAULT_INSIGHTS_FILTER = { period: "thisMonth", projectId: null };
/**
 * 프리셋 → 날짜 키 범위. 주 시작은 일요일(대시보드 캘린더의 FullCalendar 기본값과
 * 일치). 모든 범위는 오늘(now)로 끝난다.
 */
export const resolvePeriodRange = (period, now = new Date()) => {
    const todayKey = toDateKey(now);
    switch (period) {
        case "thisWeek":
            return { startKey: addDaysToKey(todayKey, -now.getDay()), endKey: todayKey };
        case "thisMonth":
            return { startKey: `${todayKey.slice(0, 7)}-01`, endKey: todayKey };
        case "last90Days":
            return { startKey: addDaysToKey(todayKey, -89), endKey: todayKey };
        case "all":
            return null;
    }
};
/** yyyy-MM-dd는 사전순 == 시간순이라 문자열 비교로 충분하다. */
export const isKeyInRange = (key, range) => range === null || (key >= range.startKey && key <= range.endKey);
/** 루트 자신 + 그 직계 자식만 남긴다. null이면 입력 배열을 그대로 돌려준다. */
export const scopeTodosByProject = (todos, projectId) => projectId === null ? todos : todos.filter((t) => t.id === projectId || t.parentId === projectId);
/**
 * 기간 소속 판단 규칙(모든 기간 지표가 공유): dueAt(없으면 doneAt)이 범위 안이면
 * 포함. "이 기간에 처리했어야 할 일"을 뜻하기 위해 dueAt을 우선한다. 둘 다 없는
 * 항목(기한 없이 만들고 아직 완료 전)은 기간이 있으면 제외, `all`이면 포함.
 */
export const scopeTodosByRange = (todos, range) => {
    if (range === null)
        return todos;
    return todos.filter((t) => {
        const anchor = t.dueAt ?? t.doneAt;
        return !!anchor && isKeyInRange(toDateKeyFromISO(anchor), range);
    });
};
