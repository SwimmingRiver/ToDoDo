import { addDaysToKey, parseDateKey, toDateKey, toDateKeyFromISO } from "../insights/date.js";
/** 읽기 전용으로 겹쳐 보여줄 구글 이벤트. ToDoDo가 이미 만든(googleEventId로
 *  링크된) 이벤트는 같은 Todo가 두 번 보이지 않도록 뺀다. */
export const filterUnsyncedEvents = (events, todos) => {
    const synced = new Set(todos.map((t) => t.googleEventId).filter((id) => !!id));
    return events.filter((event) => !synced.has(event.id));
};
/** 이벤트가 걸친 마지막 날짜 키(포함). */
const lastIncludedKey = (event) => {
    const startKey = toDateKeyFromISO(event.start);
    if (!event.end)
        return startKey;
    // end가 배타적이므로 1ms(시간) 또는 하루(종일)를 빼서 마지막 포함 날짜를 구한다 —
    // 자정에 끝나는 이벤트가 다음 날까지 잡히지 않게 하기 위함
    const lastIncluded = event.end.includes("T")
        ? new Date(new Date(event.end).getTime() - 1)
        : (() => {
            const d = parseDateKey(event.end);
            d.setDate(d.getDate() - 1);
            return d;
        })();
    const endKey = toDateKey(lastIncluded);
    return endKey < startKey ? startKey : endKey;
};
/**
 * 구글 오버레이 이벤트가 dateKey("yyyy-MM-dd") 날짜에 걸쳐 있는지 판정한다.
 * calendar-proxy Worker는 종일 이벤트를 "yyyy-MM-dd"(end 배타), 시간 이벤트를
 * 오프셋 포함 ISO로 준다. 격자와 목록이 어긋나지 않도록 같은 규칙 — end 배타,
 * 로컬 날짜 기준 — 을 따른다.
 */
export const isDateInGoogleEventRange = (dateKey, event) => {
    if (!event.start)
        return false;
    const startKey = toDateKeyFromISO(event.start);
    return startKey <= dateKey && dateKey <= lastIncludedKey(event);
};
/**
 * 구글 이벤트의 날짜 캡션. 종일이면 "종일", 시간 이벤트는 그날 시작하면 로컬 시각,
 * 전날부터 이어지는 날이면 "전날부터 이어짐" — 시작 시각을 그대로 쓰면 다음 날 목록에
 * "오후 11:30"이 떠서 그날 밤 일정으로 오해된다.
 */
export const formatGoogleEventTime = (start, dateKey) => {
    if (!start.includes("T"))
        return "종일";
    if (toDateKeyFromISO(start) < dateKey)
        return "전날부터 이어짐";
    return new Date(start).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
};
/** 점 표시용: 이벤트가 걸친 날짜 키를 [rangeStartKey, rangeEndKeyExclusive) 범위로 잘라 반환. */
export const getGoogleEventDateKeys = (event, rangeStartKey, rangeEndKeyExclusive) => {
    if (!event.start)
        return [];
    const last = lastIncludedKey(event);
    let key = toDateKeyFromISO(event.start);
    if (key < rangeStartKey)
        key = rangeStartKey;
    const keys = [];
    while (key <= last && key < rangeEndKeyExclusive) {
        keys.push(key);
        key = addDaysToKey(key, 1);
    }
    return keys;
};
