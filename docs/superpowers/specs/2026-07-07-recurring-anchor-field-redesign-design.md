# 반복 할 일 — 시작일/마감일 의미 재정의 설계

- 대상 파일: `client/src/features/todo/`
- 작성일: 2026-07-07
- 상태: 사용자 승인 완료 — 구현 계획 수립 대기
- 관련 문서: `client/src/features/todo/design/recurringTodo.spec.md` (기존 반복 할 일 UI/UX 스펙 — 본 문서는 그 중 "종료 조건" 관련 부분을 대체한다. 구현 시 해당 스펙의 0절, 1-1절, 3-2절, 4-2절, 4-3절도 함께 갱신 필요)

## 1. 문제 정의

기존 구현에서 반복 할 일을 만들 때:
- **마감일시(dueAt)**: 반복 인스턴스 생성을 시작하는 기준일(앵커)로 사용됨. `generateRecurringDueDates(baseDueAt, rule, horizonEnd)`가 이 값부터 미래로 순회하며 인스턴스를 생성.
- **종료 조건**(무기한 / 특정 날짜까지): `RecurrenceRule.endType`/`endDate`로 별도 입력받아 반복이 끝나는 시점을 결정.

문제: "마감일시"라는 이름은 통상 "이 시점까지 끝내야 한다(deadline)"는 의미인데, 실제로는 "여기서부터 반복이 시작된다"로 동작해 이름과 동작이 반대다. 사용자가 마감일시=7/10을 "7/10까지 반복"이라는 의도로 입력하면, 실제로는 7/10부터 반복이 시작되어 7/7~7/9에는 인스턴스가 전혀 생성되지 않는 조용한 오작동(사용자 관점)이 발생한다.

## 2. 결정된 설계

- **시작일(startAt)**: 필수(반복 활성화 조건). 반복이 언제부터 시작되는지 — 첫 회차 발생일의 앵커.
- **마감일(dueAt)**: 선택. 값이 있으면 "그 날짜까지 반복하고 종료"(반복의 마지막 발생일 경계). 비워두면 무기한 반복(기존과 동일하게 4주 단위로 자동 연장).
- 기존의 별도 "종료 조건"(무기한/특정 날짜까지 라디오 버튼) UI는 **제거**한다. 마감일 입력 여부가 그 역할을 대신한다.
- 각 회차 인스턴스의 실제 마감시각은 그 발생일 자체(+ 시작일의 시:분)로 계산한다. 즉 `generateRecurringDueDates`의 앵커 파라미터가 `dueAt`에서 `startAt`으로 바뀐다.

예시: 시작일=7/7, 마감일=7/10, 매일 반복 → 7/7·7/8·7/9·7/10 네 개 인스턴스 생성, 각 인스턴스의 dueAt은 그 날짜 자체.

**비반복 할 일에는 영향 없음** — startAt/dueAt의 기존 의미(할 일 자체의 시작/마감)는 그대로 유지된다. 의미가 바뀌는 것은 반복 ON일 때의 해석뿐이다.

## 3. 범위

### 변경 대상
- `client/src/features/todo/utils/recurrence.ts` — `generateRecurringDueDates`가 `baseDueAt` 대신 `baseStartAt`을 앵커로 받고, 종료 경계를 `rule.endType`/`endDate` 대신 (선택적) `dueAt` 파라미터로 받도록 시그니처 변경
- `client/src/features/todo/types/todo.type.ts` — `RecurrenceRule`에서 `endType`/`endDate` 필드를 제거한다 (종료 경계가 이제 `todo.dueAt` 자체이므로 별도 필드로 중복 저장할 이유가 없음)
- `client/src/features/todo/components/recurrence/recurrenceFields.tsx` — "종료 조건" 라디오 그룹 UI 제거. 매월 반복의 "일(day)" 유도 안내("매월 {day}일에 반복됩니다")도 `dueAt` 대신 `startAt`의 day를 읽도록 변경 (앵커가 startAt으로 바뀌었으므로)
- `client/src/features/todo/components/recurrence/recurrenceValidation.ts`, `recurrenceTransform.ts` — 유효성 검사/폼 값 변환 로직에서 종료조건 관련 로직 제거, startAt 필수 검증 추가
- `client/src/features/todo/components/todoForm/todoForm.tsx`, `todoDetail.tsx` — 반복 체크박스 활성화 조건을 `!dueAtWatch` → `!startAtWatch`로 변경, "만료일시 미입력 시 반복 불가" 안내 문구를 "시작일시 미입력 시" 로 변경
- `client/src/features/todo/api/todoApi.ts` — `createRecurringTodoImpl`/`editRecurringSeriesImpl`/`extendIndefiniteRecurringSeriesImpl`의 `if (!todo.dueAt) throw` 가드를 `if (!todo.startAt) throw`로 변경, `generateRecurringDueDates` 호출부 인자 순서 변경
- 관련 유닛 테스트 전부(`recurrence.test.ts`, `recurrenceValidation.test.ts`, `todoApi.test.ts` 등)

### 범위 밖 (변경하지 않음)
- 이미 Firestore에 저장된 기존 반복 시리즈 문서는 그대로 유지 — 마이그레이션하지 않는다. 새로 생성되거나 "전체 수정"되는 시리즈부터 새 로직이 적용된다.
- 캘린더/칸반/오늘 화면의 노출 필터 로직(dueAt 기준 필터링)은 변경하지 않는다 — 이번 작업으로 인스턴스별 dueAt이 정확한 발생일로 채워지는 것이 보장되므로 기존 필터가 그대로 올바르게 동작한다.
- 반복 배지, 칸반/캘린더 표시 등 이미 구현된 UI는 변경하지 않는다.

## 4. 검증

- 유닛 테스트: `generateRecurringDueDates`가 startAt을 앵커로, dueAt(있으면)을 종료 경계로 올바르게 처리하는지(daily/weekly/monthly 각각), dueAt 없이 무기한인 경우, startAt만 있고 dueAt 없는 경우
- 폼 유효성: 반복 체크박스가 startAt 없이는 비활성화되는지, dueAt 없이 반복 활성화가 가능한지
- 기존 테스트 중 "마감일시 기준" 가정으로 작성된 것들(예: 매월 반복의 day 유도 안내 문구가 dueAt 기준이었던 부분)은 startAt 기준으로 갱신

## 5. 후속 작업 (본 스펙 범위 밖, 기록만)

- `recurringTodo.spec.md`의 0절(PM 확정 스코프 요약 표의 "종료 조건" 행), 1-1절(와이어프레임의 종료조건 UI), 3-2절(`RecurrenceFormValue` 타입 정의), 4-2절(제목을 "만료일시 필수"→"시작일시 필수"로), 4-3절("마감일시 기준" 문구를 "시작일시 기준"으로)을 본 설계에 맞게 갱신해야 한다. 구현 계획(writing-plans)에 이 문서 갱신 작업도 태스크로 포함할 것.
