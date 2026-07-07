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

### 구현 방식 (계획 수립 중 확정 — 저위험 경로)

`generateRecurringDueDates`는 이미 "앵커 날짜 하나 + 규칙 + horizonEnd"만 받는 범용 순수 함수라, 무엇을 앵커로 넘기든 내부 로직 변경 없이 그대로 동작한다. 따라서 **`recurrence.ts`와 `RecurrenceRule`(Firestore 저장 타입)은 변경하지 않고, 호출부와 폼 레이어만 바꾸는 쪽**으로 구현한다:
- 앵커를 `todo.dueAt`에서 `todo.startAt`으로 바꾸는 것은 **호출부**(`todoApi.ts`)에서 어떤 값을 첫 인자로 넘기느냐의 문제일 뿐이다.
- 종료 조건(`RecurrenceRule.endType`/`endDate`)은 필드 자체를 없애는 대신, 폼 레이어(`recurrenceTransform.ts`)가 `todo.dueAt` 유무로부터 **자동으로 채워 넣도록**(사용자가 더 이상 직접 고르지 않도록) 만든다. `RecurrenceRule`의 저장 형태는 그대로이므로 `extendIndefiniteRecurringSeriesImpl`의 기존 `endType === "indefinite"` 체크, `calendar.tsx`/`kanbanFilters.test.ts`/`useTodo.test.tsx` 등 기존 `RecurrenceRule` 픽스처를 쓰는 코드가 전혀 영향받지 않는다.

이 방식은 §2에서 결정한 사용자 경험(시작일 필수 앵커, 마감일 선택적 종료, 종료조건 UI 제거)을 동일하게 구현하면서 변경 파일 수와 회귀 위험을 크게 줄인다.

### 변경 대상
- `client/src/features/todo/types/todo.type.ts` — **변경 없음** (`RecurrenceRule`은 그대로 유지)
- `client/src/features/todo/utils/recurrence.ts` — **변경 없음** (`generateRecurringDueDates` 시그니처/로직 그대로, 호출부만 다른 값을 앵커로 전달)
- `client/src/features/todo/components/recurrence/recurrenceFields.types.ts` — `RecurrenceFormValue`에서 `endType`/`endDate` 제거 (더 이상 사용자 입력이 아님)
- `client/src/features/todo/components/recurrence/recurrenceTransform.ts` — `toRecurrenceRule(value, dueAt)`으로 시그니처 변경, `dueAt` 유무로 `endType`/`endDate` 자동 유도
- `client/src/features/todo/components/recurrence/recurrenceFields.tsx` — "종료 조건" 라디오 그룹 UI 제거(읽기 전용 "반복 범위" 요약으로 대체). 매월 반복의 "일(day)" 유도 안내도 `dueAt` 대신 `startAt`의 day를 읽도록 변경
- `client/src/features/todo/components/recurrence/recurrenceValidation.ts` — `getRecurrenceValidationError(value, startAt, dueAt)`으로 시그니처 변경, "종료일 vs 마감일" 비교를 "마감일 vs 시작일" 비교로 교체
- `client/src/features/todo/components/todoForm/todoForm.tsx`, `todoDetail.tsx` — 반복 체크박스 활성화 조건을 `!dueAtWatch` → `!startAtWatch`로 변경, "만료일시 미입력 시 반복 불가" 안내 문구를 "시작일시 미입력 시" 로 변경
- `client/src/features/todo/api/todoApi.ts` — `createRecurringTodoImpl`/`editRecurringSeriesImpl`의 `if (!todo.dueAt) throw` 가드를 `if (!todo.startAt) throw`로 변경, `generateRecurringDueDates` 호출부의 앵커 인자를 `dueAt`→`startAt`으로 변경. `extendIndefiniteRecurringSeriesImpl`은 기존 인스턴스의 `dueAt`을 "다음 회차 연속 앵커"로 계속 사용하므로 **변경 없음**
- 관련 유닛 테스트 전부(`recurrenceTransform.test.ts`, `recurrenceValidation.test.ts`, `recurringTodoApi.test.ts`, 신규 `recurrenceFields.test.tsx`)

### 범위 밖 (변경하지 않음)
- 이미 Firestore에 저장된 기존 반복 시리즈 문서는 그대로 유지 — 마이그레이션하지 않는다. 새로 생성되거나 "전체 수정"되는 시리즈부터 새 로직이 적용된다.
- 캘린더/칸반/오늘 화면의 노출 필터 로직(dueAt 기준 필터링)은 변경하지 않는다 — 이번 작업으로 인스턴스별 dueAt이 정확한 발생일로 채워지는 것이 보장되므로 기존 필터가 그대로 올바르게 동작한다.
- 반복 배지, 칸반/캘린더 표시 등 이미 구현된 UI는 변경하지 않는다.

## 4. 검증

- 유닛 테스트: `toRecurrenceRule`이 dueAt 유무에 따라 `endType`/`endDate`를 올바르게 유도하는지, `createRecurringTodo`/`editRecurringSeries`가 `startAt`을 앵커로 인스턴스를 생성하는지(daily 기준), `startAt` 없이는 에러를 던지는지, `dueAt` 없이도(무기한) 정상 생성되는지
- 폼 유효성: 반복 체크박스가 startAt 없이는 비활성화되는지, dueAt 없이 반복 활성화가 가능한지, dueAt이 startAt보다 이전이면 제출이 막히는지
- 기존 테스트 중 "마감일시 기준" 가정으로 작성된 것들(예: 매월 반복의 day 유도 안내 문구가 dueAt 기준이었던 부분)은 startAt 기준으로 갱신

## 5. 후속 작업 (본 스펙 범위 밖, 기록만)

- `recurringTodo.spec.md`의 0절(PM 확정 스코프 요약 표의 "종료 조건" 행), 1-1절(와이어프레임의 종료조건 UI), 3-2절(`RecurrenceFormValue` 타입 정의), 4-2절(제목을 "만료일시 필수"→"시작일시 필수"로), 4-3절("마감일시 기준" 문구를 "시작일시 기준"으로)을 본 설계에 맞게 갱신해야 한다. 구현 계획(writing-plans)에 이 문서 갱신 작업도 태스크로 포함할 것.
