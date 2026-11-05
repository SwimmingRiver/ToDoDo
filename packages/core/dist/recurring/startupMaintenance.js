import { buildRecurringInstanceId, buildRecurringOccurrenceDoc, generateRecurringDueDates, } from "./recurrence";
/**
 * done된 지 cutoffISO보다 오래된 루트 프로젝트와 그 자식에 archived를 세울 계획을 만든다.
 *
 * 이전에는 루트를 Firestore 쿼리로 고르고 자식을 루트마다 별도 쿼리(N+1)로 가져왔다.
 * 이제 전체 스냅샷 하나를 받아 parentId로 메모리에서 그룹핑하므로 추가 왕복이 없다.
 *
 * archived 판정에 `!== true`를 쓰는 이유: 이전 Firestore 조건
 * `where("archived", "==", false)`는 필드가 아예 없는 레거시 문서를 매칭하지 않았다.
 * todo.type.ts가 명시한 "없으면 archived 아닌 것으로 취급" 의미를 따르며, 이 문서들은
 * getTodos()에서 이미 보이지 않으므로 archived를 세워도 화면 변화가 없다.
 *
 * `doneAt`이 null인 done 루트는 이제 아카이빙되지 않는다(의도된 동작 변경). 구
 * Firestore 조건 `where("doneAt", "<", cutoffISO)`는 이들을 매칭했다 — Firestore의
 * 타입 간 정렬에서 null이 문자열보다 앞서기 때문이다. 그래서 완료 시점을 모르는데도
 * 30일 규칙을 건너뛰고 즉시 아카이빙됐다. 완료 시점이 없으면 "30일 지났는지" 자체를
 * 판단할 수 없으므로 보존하는 쪽이 맞다.
 */
export const planArchivedSweep = (todos, cutoffISO, now) => {
    const childrenByParentId = new Map();
    for (const todo of todos) {
        if (!todo.parentId)
            continue;
        const siblings = childrenByParentId.get(todo.parentId) ?? [];
        siblings.push(todo);
        childrenByParentId.set(todo.parentId, siblings);
    }
    const groups = [];
    for (const todo of todos) {
        if (todo.parentId !== null)
            continue;
        if (todo.status !== "done")
            continue;
        if (todo.archived === true)
            continue;
        if (!todo.doneAt)
            continue;
        if (todo.doneAt >= cutoffISO)
            continue;
        const children = childrenByParentId.get(todo.id) ?? [];
        // 부모-자식 상태는 항상 함께 갱신된다는 게 원래 불변조건이지만, 모바일
        // 클라이언트는 캐스케이드 없이 부모 상태만 단독으로 바꿀 수 있어 깨질 수 있다.
        // 자식이 아직 done이 아닌데 부모만 archived되면 미완료 자식이 조용히 사라지므로,
        // 이 그룹은 자식이 전부 done일 때만 아카이빙한다.
        if (children.some((child) => child.status !== "done"))
            continue;
        const members = [todo, ...children];
        groups.push({
            updates: members.map((m) => ({ id: m.id, fields: { archived: true, updatedAt: now } })),
        });
    }
    return groups;
};
/**
 * 지난 미완료(overdue) 반복 인스턴스에 overdueArchived를 세울 계획을 만든다.
 *
 * overdueArchived는 Firestore 등호 조건에 쓰지 않는다 — 기존 문서엔 필드가 아예 없을
 * 수 있어 `where("overdueArchived", "==", false)`가 그 문서들을 걸러버린다. 백필 없이도
 * 안전하도록 여기서 `!== true`로 판정한다.
 *
 * status 조건은 이전에 Firestore 쿼리(`where("status", "==", "todo")`)가 담당했으므로
 * 메모리 판정으로 옮기면서 명시적으로 다시 걸어야 한다.
 */
export const planOverdueRecurringSweep = (todos, todayStart, now) => {
    const todayStartTime = todayStart.getTime();
    return todos
        .filter((todo) => {
        if (todo.status !== "todo")
            return false;
        if (!todo.recurrenceId)
            return false;
        if (todo.overdueArchived === true)
            return false;
        if (!todo.dueAt)
            return false;
        const due = new Date(todo.dueAt);
        due.setHours(0, 0, 0, 0);
        return due.getTime() < todayStartTime;
    })
        .map((todo) => ({
        id: todo.id,
        fields: { overdueArchived: true, updatedAt: now },
    }));
};
/** 반복 규칙의 endDate는 "YYYY-MM-DD"로 저장된다(toRecurrenceRule). */
const isDateOnlyKey = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
/**
 * 반복 시리즈들을 호라이즌까지 이어서 채울 계획을 만든다.
 * 기존 인스턴스는 건드리지 않고 마지막 인스턴스 이후의 빈 구간만 채운다.
 *
 * 무기한(indefinite)뿐 아니라 종료일(untilDate) 시리즈도 대상이다. 생성·수정 시 회차는
 * min(endDate, 호라이즌)까지만 만들어지므로, 종료일이 호라이즌보다 멀면 여기서 이어 채우지
 * 않는 한 시리즈가 호라이즌에서 조용히 멈춘다. 종료일 이후 회차는 generateRecurringDueDates가
 * 만들지 않는다. endDate를 해석할 수 없는 untilDate 시리즈는 건너뛴다 — 그대로 두면
 * generateRecurringDueDates가 호라이즌으로 대체해 무기한처럼 늘어난다.
 * (함수 이름은 무기한 전용이던 시절의 것이다. 호출부가 web·mobile에 퍼져 있어 유지한다.)
 *
 * order를 여기서 매기지 않는 이유: 다음 order는 이 시리즈뿐 아니라 사용자의 **모든**
 * 루트 할 일에 걸친 최대값이라 이 함수가 보는 범위를 넘어선다. 계획이 비어있지 않을 때만
 * api 레이어가 공유 스냅샷에서 계산해 buildExtensionCreates로 넘긴다.
 * (초기 설계에서는 api가 Firestore를 한 번 더 조회했으나, 공유 스냅샷으로 충분해 없앴다.)
 */
export const planIndefiniteExtension = (todos, horizonEnd) => {
    const seriesByRecurrenceId = new Map();
    for (const todo of todos) {
        if (!todo.recurrenceId || !todo.recurrence)
            continue;
        if (todo.recurrence.endType === "untilDate" && !isDateOnlyKey(todo.recurrence.endDate)) {
            continue;
        }
        if (!todo.dueAt)
            continue;
        const list = seriesByRecurrenceId.get(todo.recurrenceId) ?? [];
        list.push(todo);
        seriesByRecurrenceId.set(todo.recurrenceId, list);
    }
    const extensions = [];
    for (const [recurrenceId, instances] of seriesByRecurrenceId) {
        const latest = instances.reduce((a, b) => new Date(a.dueAt).getTime() > new Date(b.dueAt).getTime() ? a : b);
        const latestTime = new Date(latest.dueAt).getTime();
        if (latestTime >= horizonEnd.getTime())
            continue; // 이미 새 호라이즌까지 채워져 있음
        const rule = latest.recurrence;
        // `> latestTime` 하나로 충분하다. latest는 시리즈에서 dueAt이 가장 큰 인스턴스이므로
        // 기존 인스턴스는 전부 `<= latestTime`이고, 후보는 전부 `> latestTime`이라 둘은 같은
        // 날짜를 가질 수 없다. 이전에 있던 existingDateKeys 중복 제거 필터는 이 이유로
        // 도달 불가였고(Task 3 리뷰에서 확인), 그 필터의 테스트도 함께 제거했다.
        // 멀티탭에서 같은 날짜가 동시에 생성되는 문제는 이 필터가 아니라 결정론적 문서 ID
        // (buildRecurringInstanceId)가 막는다 — 같은 문서로 수렴하므로 중복이 생기지 않는다.
        const dueDates = generateRecurringDueDates(latest.dueAt, rule, horizonEnd)
            .filter((iso) => new Date(iso).getTime() > latestTime);
        if (dueDates.length === 0)
            continue;
        const { id: _id, ...template } = latest;
        extensions.push({ recurrenceId, template, dueDates });
    }
    return extensions;
};
/**
 * 계획에 order를 채워 실제 생성할 문서로 만든다.
 *
 * order는 시리즈 경계를 넘어 계속 증가한다 — batch가 커밋되기 전에는 새 인스턴스가
 * Firestore에 반영되지 않으므로, 시리즈마다 order를 다시 조회하면 서로 다른 시리즈의
 * 인스턴스들이 중복된 order를 받는다.
 */
export const buildExtensionCreates = (extensions, startOrder, userId, now) => {
    const creates = [];
    let nextOrder = startOrder;
    for (const { recurrenceId, template, dueDates } of extensions) {
        for (const dueAt of dueDates) {
            creates.push({
                id: buildRecurringInstanceId(recurrenceId, dueAt),
                // template은 시리즈의 마지막 회차다. 동기화돼 있으면 googleEventId를, 오래 방치됐으면
                // archived/overdueArchived를 갖고 있을 수 있어 공용 빌더로 회차별 필드를 정리한다.
                doc: buildRecurringOccurrenceDoc(template, {
                    userId,
                    recurrenceId,
                    dueAt,
                    now,
                    order: nextOrder,
                }),
            });
            nextOrder += 1;
        }
    }
    return creates;
};
