/**
 * 반복 시리즈를 읽고(getDocs) 판단한 뒤 batch로 쓰는 함수들(createRecurringTodo,
 * editRecurringSeries, deleteRecurringSeries, runStartupMaintenance)은 트랜잭션으로
 * 묶여있지 않다. 이 함수들이 겹쳐 실행되면(예: 앱 마운트 시 백그라운드로 도는
 * runStartupMaintenance와 사용자가 그 사이에 실행하는 editRecurringSeries) 서로
 * 상대방의 쓰기를 반영하지 못한 stale 스냅샷을 기준으로 각자 커밋해서, 같은 recurrenceId의
 * 같은 날짜에 문서가 중복 생성되는 문제가 있었다. 완전한 원자성 대신, 이 함수들을 항상 하나씩
 * 순서대로만 실행되게 직렬화해 겹쳐 실행 자체를 막는다.
 *
 * 잠금 상태는 이 모듈의 단일 인스턴스에 있다. 시리즈를 쓰는 모든 함수(웹·모바일 공통)가
 * 반드시 이 함수를 거쳐야 같은 잠금을 공유한다 — 따로 mutex를 두면 직렬화가 깨진다.
 */
let recurringSeriesMutex = Promise.resolve();
export const withRecurringSeriesLock = (run) => {
    const result = recurringSeriesMutex.then(run, run);
    recurringSeriesMutex = result.then(() => undefined, () => undefined);
    return result;
};
