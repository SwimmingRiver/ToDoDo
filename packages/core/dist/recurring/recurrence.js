import { toDateKeyFromISO } from "../insights/date";
/** 반복 인스턴스를 미리 생성해두는 기본 기간(주). schedule-manager 스프린트 계획 기준. */
export const RECURRENCE_HORIZON_WEEKS = 4;
/**
 * 오늘(또는 지정한 기준일)로부터 RECURRENCE_HORIZON_WEEKS(4주) 뒤 시점을 반환한다.
 * generateRecurringDueDates의 horizonEnd 기본값으로 사용.
 */
export function getDefaultHorizonEnd(from = new Date()) {
    const result = new Date(from);
    result.setDate(result.getDate() + RECURRENCE_HORIZON_WEEKS * 7);
    return result;
}
/** year/month(0-indexed) 기준 마지막 날짜(28~31)를 반환한다. */
function getLastDayOfMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}
/** 시각(시/분/초/밀리초)만 base 기준으로 맞춰 새 Date를 반환한다. */
function applyTimeOfDay(date, base) {
    const result = new Date(date);
    result.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
    return result;
}
/** 날짜의 자정(00:00:00.000)을 반환한다 (날짜 단위 비교용). */
function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}
/** 날짜의 23:59:59.999를 반환한다 (경계 포함 비교용). */
function endOfDay(date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
}
/**
 * "YYYY-MM-DD" date-only 문자열(<input type="date"> 값)을 로컬 자정 Date로 만든다.
 * new Date("YYYY-MM-DD")로 바로 파싱하면 UTC 자정으로 해석되어, UTC보다 시간이
 * 느린 타임존(예: America/New_York)에서는 하루 전 날짜로 밀리는 문제가 있다.
 */
function parseDateOnlyLocal(dateOnlyStr) {
    const [y, m, d] = dateOnlyStr.split("-").map(Number);
    return new Date(y, m - 1, d);
}
/**
 * 실제 종료 시점을 계산한다: endType이 untilDate이면 endDate와 horizonEnd 중 더 이른 날짜,
 * 무기한(indefinite)이면 horizonEnd 그대로.
 */
function resolveEffectiveEnd(rule, horizonEnd) {
    if (rule.endType === "untilDate" && rule.endDate) {
        const endDate = parseDateOnlyLocal(rule.endDate);
        if (!Number.isNaN(endDate.getTime()) && endDate.getTime() < horizonEnd.getTime()) {
            return endDate;
        }
    }
    return horizonEnd;
}
/**
 * baseDueAt(최초 dueAt)과 반복 규칙을 받아 horizonEnd(또는 endDate, 더 이른 쪽)까지
 * 생성해야 할 인스턴스들의 dueAt(ISO string) 목록을 반환한다. baseDueAt 시각(시:분)은
 * 모든 인스턴스에 동일하게 적용된다.
 *
 * - daily: 매일 하나씩
 * - weekly: rule.weekdays에 해당하는 요일마다 하나씩 (0=일~6=토). baseDueAt의 요일이
 *   weekdays에 포함되지 않으면 baseDueAt 자체는 결과에 포함되지 않을 수 있다(요일 규칙이
 *   최우선 기준이므로) — 시작점은 baseDueAt이지만 실제 발생일은 요일 규칙을 따른다.
 * - monthly: baseDueAt의 day(일)를 유지. 해당 월에 그 날짜가 없으면(예: 31일, 2월)
 *   그 달의 마지막 날로 생성한다.
 */
export function generateRecurringDueDates(baseDueAt, rule, horizonEnd) {
    const base = new Date(baseDueAt);
    if (Number.isNaN(base.getTime()))
        return [];
    const effectiveEnd = endOfDay(resolveEffectiveEnd(rule, horizonEnd));
    const baseDayStart = startOfDay(base);
    const results = [];
    if (rule.type === "daily") {
        const cursor = new Date(baseDayStart);
        while (cursor.getTime() <= effectiveEnd.getTime()) {
            results.push(applyTimeOfDay(cursor, base).toISOString());
            cursor.setDate(cursor.getDate() + 1);
        }
        return results;
    }
    if (rule.type === "weekly") {
        const weekdays = rule.weekdays ?? [];
        if (weekdays.length === 0)
            return [];
        const cursor = new Date(baseDayStart);
        while (cursor.getTime() <= effectiveEnd.getTime()) {
            if (weekdays.includes(cursor.getDay())) {
                results.push(applyTimeOfDay(cursor, base).toISOString());
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        return results;
    }
    // monthly: baseDueAt의 day를 유지하되, 없는 날짜는 그 달의 마지막 날로 클램핑한다.
    const day = base.getDate();
    let year = base.getFullYear();
    let month = base.getMonth();
    for (;;) {
        const lastDay = getLastDayOfMonth(year, month);
        const occurrence = startOfDay(new Date(year, month, Math.min(day, lastDay)));
        if (occurrence.getTime() > effectiveEnd.getTime())
            break;
        if (occurrence.getTime() >= baseDayStart.getTime()) {
            results.push(applyTimeOfDay(occurrence, base).toISOString());
        }
        month += 1;
        if (month > 11) {
            month = 0;
            year += 1;
        }
    }
    return results;
}
/**
 * 반복 인스턴스 문서 ID를 {recurrenceId}_{YYYY-MM-DD}로 결정론적으로 만든다(로컬 타임존
 * 기준 연-월-일 — 코드베이스 전반의 toDateString() 기반 "같은 날짜" 판정과 동일 기준).
 *
 * createRecurringTodo/editRecurringSeries/runStartupMaintenance(확장 스윕)는 서로 다른
 * 탭·기기에서 겹쳐 실행될 수 있는데(withRecurringSeriesLock은 탭 내부만 직렬화), 인스턴스를
 * 매번 새 자동생성 ID로 만들면 같은 recurrenceId·같은 날짜에 대해 두 문서가 동시에 생성될 수
 * 있다. ID 자체를 recurrenceId+날짜로 고정하면 Firestore 문서 ID의 유일성이 곧 "같은
 * 날짜엔 항상 같은 문서"를 보장하므로, 여러 곳에서 동시에 써도(batch.set은 없으면 생성,
 * 있으면 덮어쓰는 upsert) 마지막에 커밋된 내용으로 수렴할 뿐 중복 문서가 생기지 않는다.
 */
export const buildRecurringInstanceId = (recurrenceId, dueAt) => `${recurrenceId}_${toDateKeyFromISO(dueAt)}`;
/**
 * 반복 회차 문서를 새로 만들 때 쓰는 공용 빌더. 회차를 만드는 세 경로(createRecurringTodo,
 * editRecurringSeries의 재생성, runStartupMaintenance의 확장 스윕)가 모두 이 함수를 거친다.
 *
 * 템플릿(폼 입력 또는 시리즈의 마지막 회차)의 나머지 필드(제목·설명·우선순위·반복 규칙·알림
 * 설정 등)는 그대로 물려받되, 회차마다 따로 가져야 하는 값은 여기서 한 번에 정리한다:
 * - googleEventId: 문서 1개 ↔ 구글 이벤트 1개 매핑이다. 물려주면 동기화 시 회차 N개가 같은
 *   이벤트를 PATCH해 이벤트 하나로 뭉치므로 빼서 각 회차가 미동기화 상태로 시작하게 한다.
 * - archived / overdueArchived: 템플릿이 보관·숨김 상태여도 새 회차는 항상 보여야 한다.
 * - status/doneAt/parentId/startAt/timestamps/order: 새 회차의 초기값.
 * 회차별 필드가 새로 생기면 여기에만 추가하면 된다.
 */
export const buildRecurringOccurrenceDoc = (template, params) => {
    const { id: _id, googleEventId: _gid, ...rest } = template;
    const { userId, recurrenceId, dueAt, now, order } = params;
    return {
        ...rest,
        userId,
        // 템플릿의 startAt은 그 템플릿 자신의 발생일 기준 고정값이라, 그대로 물려받으면 캘린더가
        // startAt~dueAt을 다중일 span으로 잘못 렌더링한다. 발생일(dueAt)로 덮어쓴다 — dueAt은
        // generateRecurringDueDates가 이미 원래 startAt의 시:분을 적용해 계산한 값이다.
        startAt: dueAt,
        dueAt,
        status: "todo",
        doneAt: null,
        parentId: null,
        archived: false,
        overdueArchived: false,
        recurrenceId,
        createdAt: now,
        updatedAt: now,
        order,
    };
};
