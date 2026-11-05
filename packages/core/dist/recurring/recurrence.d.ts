import type { RecurrenceRule } from "../types/todo";
/** 반복 인스턴스를 미리 생성해두는 기본 기간(주). schedule-manager 스프린트 계획 기준. */
export declare const RECURRENCE_HORIZON_WEEKS = 4;
/**
 * 오늘(또는 지정한 기준일)로부터 RECURRENCE_HORIZON_WEEKS(4주) 뒤 시점을 반환한다.
 * generateRecurringDueDates의 horizonEnd 기본값으로 사용.
 */
export declare function getDefaultHorizonEnd(from?: Date): Date;
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
export declare function generateRecurringDueDates(baseDueAt: string, rule: RecurrenceRule, horizonEnd: Date): string[];
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
export declare const buildRecurringInstanceId: (recurrenceId: string, dueAt: string) => string;
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
export declare const buildRecurringOccurrenceDoc: <T extends {
    id?: string;
    googleEventId?: string | null;
}>(template: T, params: {
    userId: string;
    recurrenceId: string;
    dueAt: string;
    now: string;
    order: number;
}) => Omit<T, "id" | "googleEventId"> & {
    userId: string;
    startAt: string;
    dueAt: string;
    status: "todo";
    doneAt: null;
    parentId: null;
    archived: boolean;
    overdueArchived: boolean;
    recurrenceId: string;
    createdAt: string;
    updatedAt: string;
    order: number;
};
