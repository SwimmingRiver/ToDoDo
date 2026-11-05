# 반복 종료 설정 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 반복의 종료 조건을 「만료일시」에서 추측하지 않고, 반복 섹션의 「반복 종료: 없음 / 날짜 지정」에서 직접 고르게 한다(웹·앱 공통). 기존 시리즈의 종료일 편집도 지원한다.

**Architecture:** 폼 값 타입 `RecurrenceFormValue`가 endType/endDate를 갖게 하고, 변환·검증 규칙을 core `recurrenceForm.ts` 한 곳에 둔다. 웹 `RecurrenceFields`와 앱 `RecurrenceSection`은 같은 규칙을 쓰는 UI만 다르게 구현한다. 시리즈 수정에서 "재생성 0개"를 정상 저장으로 허용하는 분기만 `seriesApi.ts`에 추가한다.

**Tech Stack:** TypeScript, React 19 + styled-components + react-hook-form(웹), React Native/Expo 57(앱), Firestore, vitest(core·웹), jest + @testing-library/react-native 14(앱, render/fireEvent가 async).

**Spec:** `docs/superpowers/specs/2026-11-05-recurrence-end-setting-design.md`

## Global Constraints

- 데이터 모델(`RecurrenceRule`) 변경과 마이그레이션은 없다. `endType: "indefinite" | "untilDate"`, `endDate: "YYYY-MM-DD" | null`을 그대로 쓴다.
- 반복을 새로 켤 때의 기본값은 `{ type: "daily", endType: "indefinite", endDate: null }`이다.
- 문구는 정확히 다음과 같다: 라벨 "반복 종료", 옵션 "없음" / "날짜 지정", 안내 "계속 반복됩니다" / "YYYY-MM-DD까지 반복됩니다", 오류 "종료일을 선택해주세요" / "종료일은 시작일과 같거나 이후여야 합니다".
- 날짜 키는 로컬 기준이다. dueAt/startAt(UTC Z)에서 날짜를 뽑을 때 `split("T")[0]`을 쓰지 말고 `toDateKeyFromISO`를 쓴다.
- Firestore에는 `undefined`를 쓰지 않는다. 값이 없으면 `null`을 쓰거나 키를 생략한다.
- core를 고치면 `packages/core`에서 `npm run build`로 dist를 다시 만들어 같은 커밋에 넣는다. CI가 `git diff --exit-code -- dist`로 검사한다.
- 웹 런타임에서는 `@tododo/core` 루트를 import하지 않는다. `@tododo/core/dist/recurring/index.js` 경로로 가져온다(번들 크기).
- 앱 터치 영역은 44pt 이상(`MIN_TOUCH_TARGET`)으로 한다.
- hooks 우회(`--no-verify`)는 금지한다.
- 장시간 백그라운드 명령은 쓰지 않는다. 끝나는 명령만 포그라운드로 돌린다.

## 검증 명령 (모든 태스크 공통)

- core: `cd packages/core && npx vitest run` 그리고 `TZ=America/New_York npx vitest run`
- 웹: worktree의 `client/node_modules`는 메인 체크아웃(`/Users/river/tododo`)을 가리키는 심링크라 낡은 core를 본다. 메인 체크아웃의 링크는 바꾸지 말 것(다른 세션이 쓰는 중). 대신 `client/vitest.redirect.config.ts`(커밋 금지)를 만들어 `@tododo/core`를 이 worktree의 `packages/core`로 돌린다:
  ```ts
  import { mergeConfig } from 'vitest/config'
  import path from 'path'
  import base from './vite.config'
  export default mergeConfig(base, {
    resolve: { alias: [{ find: /^@tododo\/core/, replacement: path.resolve(__dirname, '../packages/core') }] },
  })
  ```
  실행: `cd client && VITE_FIREBASE_API_KEY= npx vitest run -c vitest.redirect.config.ts [파일]`. 뉴욕 TZ로도 한 번 더 돈다. 타입 검사 `npx tsc -b`도 심링크 때문에 낡은 core 타입을 볼 수 있다. 의심되면 CI 결과로 판단한다.
- 앱: `cd mobile && npx tsc --noEmit && npx jest`. mobile의 `@tododo/core`는 이 worktree를 가리킨다.

## Review Focus

1. **오늘·캘린더 탭 자동 채움.** `route.params.dueAt`이 있는 채로 반복을 켜고 저장하면 `endType: "indefinite"`로 생성돼야 한다. 숨긴 dueAt 때문에 날짜 검증 오류가 나서도 안 된다. 테스트는 Task 4가 가진다.
2. **endDate가 없거나 형식이 다른 옛 문서를 수정 화면에서 열 때.** 앱이 죽지 않아야 하고 종료가 「날짜 지정」 + 빈 날짜로 보여야 한다. 저장 시 "종료일을 선택해주세요"로 막아야 한다. 조용히 무기한으로 바꿔 시리즈를 키우면 안 된다. 테스트는 Task 1(toFormValue)과 Task 3(웹 표시)이 가진다.
3. **뉴욕 TZ에서 종료일과 시작일 비교.** 시작일시 로컬 7/10 09:00, 종료일 "2026-07-10"은 통과해야 하고 "2026-07-09"는 실패해야 한다. 테스트는 Task 1이 가진다.
4. **종료일을 수정 중인 회차 날짜와 같게 줄이기.** 그 회차는 남고 이후 todo 회차만 지워져야 한다. 테스트는 Task 2가 가진다.
5. **반복을 껐다 다시 켜기(새 시리즈).** 종료는 「없음」으로 다시 시작하고, 숨겼던 만료일시는 원래 값 그대로 다시 보여야 한다. 테스트는 Task 3(웹)과 Task 4(앱)가 가진다.

---

### Task 1: core 폼 값·변환·검증 + 호출부 최소 이행

**Files:**
- Modify: `packages/core/src/recurring/recurrenceForm.ts`
- Modify: `client/src/features/todo/components/recurrence/recurrenceTransform.ts`, `recurrenceValidation.ts`, `weekdayConstants.ts`(필요 시 오류 문구 재노출)
- Modify (호출부만 맞춤, UI 변경 없음): `client/src/features/todo/components/todoForm/todoForm.tsx`, `client/src/features/todo/components/todoDetail/todoDetail.tsx`, `client/src/features/todo/components/recurrence/recurrenceFields.tsx`, `mobile/src/screens/TodoFormScreen.tsx`, `mobile/src/screens/TodoDetailScreen.tsx`, `mobile/src/shared/ui/recurrenceSection/RecurrenceSection.tsx`
- Test: `packages/core/src/recurring/__tests__/recurrenceTransform.test.ts`, `recurrenceValidation.test.ts`. 기존 웹·앱 테스트 중 시그니처 때문에 깨지는 것은 고친다.
- dist: `packages/core/dist/recurring/recurrenceForm.{js,d.ts}`

**Interfaces:**
- Produces (core, `recurring/index`로 export):
  - `interface RecurrenceFormValue { type: "daily" | "weekly" | "monthly"; weekdays?: number[]; endType: "indefinite" | "untilDate"; endDate: string | null }`
  - `const DEFAULT_RECURRENCE_FORM_VALUE: RecurrenceFormValue`. 값은 `{ type: "daily", endType: "indefinite", endDate: null }`이다. 소비자는 펼쳐서 복사해 쓴다.
  - `toFormValue(rule: RecurrenceRule | null | undefined): RecurrenceFormValue | null`
  - `toRecurrenceRule(value: RecurrenceFormValue | null): RecurrenceRule | null`. dueAt 인자를 없앤다.
  - `getRecurrenceValidationError(value: RecurrenceFormValue | null, startAt: string | null): string | null`. dueAt 인자를 없앤다.
  - `const END_DATE_REQUIRED_ERROR = "종료일을 선택해주세요"`, `const END_DATE_BEFORE_START_ERROR = "종료일은 시작일과 같거나 이후여야 합니다"`
  - `toRecurrenceRuleForEdit`는 이 태스크에서 **삭제**한다.
  - 기존 `"마감일은 시작일과 같거나 이후여야 합니다"` 문구는 반복 검증에서 사라진다. 일반 할 일 날짜 검증(`getTodoDateValidationError`)은 그대로 둔다.

- [ ] **Step 1: 실패하는 core 테스트 작성** (`recurrenceTransform.test.ts`, `recurrenceValidation.test.ts`)
  - `toFormValue({type:"weekly", weekdays:[1], endType:"untilDate", endDate:"2026-12-31"})` → `{type:"weekly", weekdays:[1], endType:"untilDate", endDate:"2026-12-31"}`
  - `toFormValue({type:"daily", endType:"indefinite"})` → `{type:"daily", endType:"indefinite", endDate:null}`
  - 옛 문서: `endType` 없음 → `endType:"indefinite"`. `endType:"untilDate", endDate:"2026-12-31T00:00:00.000Z"` → `{endType:"untilDate", endDate:null}`(형식이 다르면 null). `endDate` 없음 → `endDate:null`.
  - `toRecurrenceRule({type:"daily", endType:"indefinite", endDate:"2026-12-31"})` → `{type:"daily", endType:"indefinite", endDate:null}`(무기한이면 endDate를 버림)
  - `toRecurrenceRule({type:"weekly", weekdays:[1,3], endType:"untilDate", endDate:"2026-12-31"})` → `{type:"weekly", weekdays:[1,3], endType:"untilDate", endDate:"2026-12-31"}`
  - `toRecurrenceRule({type:"daily", endType:"untilDate", endDate:"2026-12-31"})`의 결과에 `weekdays` 키가 없다(`"weekdays" in rule === false`).
  - 왕복: `toRecurrenceRule(toFormValue(rule))`가 정상 규칙 3종(daily 무기한, weekly 종료일, monthly 종료일)에서 원래 규칙과 같다.
  - 검증 ("지금"을 고정할 필요 없음. 픽스처는 로컬 생성자 `new Date(2026, 6, 10, 9, 0).toISOString()`로 만든다):
    - untilDate + endDate null → `END_DATE_REQUIRED_ERROR`
    - startAt 로컬 7/10 09:00, endDate "2026-07-10" → `null`
    - startAt 로컬 7/10 09:00, endDate "2026-07-09" → `END_DATE_BEFORE_START_ERROR`
    - indefinite → `null`(endDate 무시)
    - weekly + 요일 없음 → `WEEKDAY_REQUIRED_ERROR`(종료 검사보다 우선)
    - startAt null + untilDate + endDate 있음 → `null`(시작일 비교 생략)

- [ ] **Step 2: 실패 확인** — `cd packages/core && npx vitest run src/recurring/__tests__/recurrenceTransform.test.ts src/recurring/__tests__/recurrenceValidation.test.ts`. 새 필드가 없거나 시그니처가 달라서 FAIL이 나야 한다.

- [ ] **Step 3: core 구현** — 위 Interfaces대로 `recurrenceForm.ts`를 바꾼다. 날짜 키 형식 검사는 `/^\d{4}-\d{2}-\d{2}$/`로 한다. `startupMaintenance.ts`의 `isDateOnlyKey`와 같은 규칙이니, 공용으로 쓰도록 `recurrenceForm.ts`(또는 `recurrence.ts`)로 옮겨 export하고 `startupMaintenance.ts`도 그것을 쓰게 한다. 시작일 비교는 기존 `toLocalDateKey(startAt)` 대 endDate 문자열 비교다.

- [ ] **Step 4: core 통과 확인** — 서울과 뉴욕 TZ 모두 `npx vitest run` 전체가 통과해야 한다. 그다음 `npm run build`.

- [ ] **Step 5: 호출부 최소 이행 (UI 변경 없음)**
  - 웹 `recurrenceTransform.ts`, `recurrenceValidation.ts`: `toRecurrenceRuleForEdit` 재노출을 지우고 새 상수 2개와 `DEFAULT_RECURRENCE_FORM_VALUE`를 재노출한다.
  - 웹 `recurrenceFields.tsx`와 앱 `RecurrenceSection.tsx`의 켜기 핸들러: `{ type: "daily" }` 대신 `{ ...DEFAULT_RECURRENCE_FORM_VALUE }`로 바꾼다. `getRecurrenceValidationError` 호출에서 dueAt 인자를 뺀다. 이 태스크에서는 아직 종료 컨트롤을 넣지 않는다.
  - 웹 `todoForm.tsx`·`todoDetail.tsx`, 앱 `TodoFormScreen.tsx`·`TodoDetailScreen.tsx`:
    - `existingRule ? toRecurrenceRuleForEdit(...) : toRecurrenceRule(value, dueAt)`를 `toRecurrenceRule(recurrenceValue)`로 바꾼다.
    - 검증은 `existingRule` 분기 없이 `getRecurrenceValidationError(recurrenceValue, startAt)`로 바꾼다.
    - `existingRule` 변수가 다른 데서 쓰이지 않으면 지운다. 확인 창 분기는 `todo.recurrence != null`로 계속 판단한다.
  - 기존 웹·앱 테스트에서 dueAt으로 종료가 유도된다고 기대하던 것은 새 동작에 맞게 고친다. 새 동작은 "종료는 폼 값에서 오고, 새로 켜면 무기한"이다. 고친 테스트 이름에 바뀐 이유가 드러나게 한다.

- [ ] **Step 6: 전체 확인** — core(서울·뉴욕), 웹 vitest(리다이렉트 설정), 앱 `tsc --noEmit` + `jest`, `git diff --exit-code -- packages/core/dist`(빌드 후 커밋 전이면 diff가 있어야 정상. 커밋 후 재빌드 시 깨끗해야 함).

- [ ] **Step 7: 커밋** — `feat(core): 반복 폼 값에 종료 조건(endType/endDate)을 담고 dueAt 유도를 없앰`

---

### Task 2: 시리즈 수정 "재생성 0개" 허용 규칙

**Files:**
- Modify: `packages/core/src/recurring/seriesApi.ts`(`editRecurringSeriesImpl`의 `dueDates.length === 0` 분기)
- Test: `packages/core/src/recurring/__tests__/seriesApi.test.ts`
- dist 재빌드

**Interfaces:**
- Consumes: 없음. `generateRecurringDueDates`, `getDefaultHorizonEnd`는 기존 것이다.
- Produces: 동작 변경만 있다. 새 export는 없다.

규칙: 재생성할 날짜가 0개일 때, `seriesTodo.startAt`의 로컬 날짜가 `horizonEnd`보다 뒤면 기존처럼 throw한다(기존 문구 유지, commit 전이라 삭제는 취소됨). 그 밖의 경우는 throw하지 않는다. 창 안의 todo 회차 삭제와 그 밖의 batch 작업만 커밋한다. `createRecurringTodoImpl`은 바꾸지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성** (기존 seriesApi 테스트의 Firestore mock 패턴을 따른다. 시스템 시간은 mock으로 고정하고, 날짜 픽스처는 로컬 생성자로 만든다)
  - "이미 지난 종료일 시리즈의 지난 회차 제목만 고쳐도 저장된다": 오늘=7/20, 규칙 untilDate endDate "2026-07-15", 수정 회차 = 7/12 todo(overdue). `editRecurringSeries`가 reject하지 않고 `batch.commit`이 1회 호출된다. 7/12 문서는 갱신(update)되고 `batch.set`은 0회다.
  - "종료일을 수정 회차 날짜로 줄이면 그 회차는 남고 이후 todo 회차만 지워진다": 오늘=7/10, 기존 무기한 매일 시리즈(7/10~7/20 todo, 7/9 done). 7/12 회차를 열어 endDate "2026-07-12"로 저장한다. 그러면 7/13~7/20 todo는 `batch.delete`, 7/12는 재생성(`batch.set` 문서 id `${rid}_2026-07-12`), 7/10·7/11 todo와 7/9 done은 delete·set 대상이 아니다.
  - "시작일시가 호라이즌 밖이면 여전히 실패하고 commit하지 않는다": startAt을 호라이즌 + 10일로 → reject 메시지에 "생성 가능 기간"이 들어가고 `batch.commit` 0회.

- [ ] **Step 2: 실패 확인** — 첫 번째 테스트가 "생성 가능 기간" throw로 FAIL이어야 한다. 두 번째는 이미 통과할 수 있다(그러면 가드로 유지). 세 번째는 통과해야 정상이다.

- [ ] **Step 3: 구현** — 위 규칙대로 분기를 고친다. 주석에 9f659ea의 데이터 손실 방지 목적과, 종료일 선택 도입으로 0개가 정상이 된 경우를 적는다.

- [ ] **Step 4: 통과 확인** — core 전체를 서울·뉴욕 TZ에서 돌리고 `npm run build`.

- [ ] **Step 5: 커밋** — `fix(core): 종료일이 재생성 창보다 앞선 시리즈 수정이 "생성 가능 기간" 오류로 막히던 문제`

---

### Task 3: 웹 반복 종료 컨트롤 + 폼 연결

**Files:**
- Modify: `client/src/features/todo/components/recurrence/recurrenceFields.tsx`, `recurrence.styles.ts(x)`(파일명은 현재 import 경로를 따른다)
- Modify: `client/src/features/todo/components/todoForm/todoForm.tsx`, `client/src/features/todo/components/todoDetail/todoDetail.tsx`
- Test: `client/src/features/todo/components/recurrence/__tests__/recurrenceFields.test.tsx`, `client/src/features/todo/components/todoForm/__tests__/todoForm.test.tsx`, `client/src/features/todo/components/todoDetail/__tests__/todoDetail.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `RecurrenceFormValue`, `DEFAULT_RECURRENCE_FORM_VALUE`, 오류 상수, `getRecurrenceValidationError(value, startAt)`, `toRecurrenceRule(value)`
- Produces: `RecurrenceFieldsProps`에서 `dueAt`과 `existingRule`을 없앤다. 남는 것은 `disabled`, `disabledReason`, `startAt`, `value`, `onChange`다. 종료 안내와 오류는 value와 startAt만으로 만든다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - recurrenceFields: 켜면 "반복 종료" 라벨과 "없음"(선택됨)·"날짜 지정" 옵션이 보이고 안내는 "계속 반복됩니다"다. "날짜 지정"을 누르면 `onChange`가 `endType:"untilDate", endDate:null`로 불리고 날짜 입력(`type="date"`, 접근성 이름 "반복 종료일")이 보인다. 날짜를 "2026-12-31"로 바꾸면 `onChange(endDate:"2026-12-31")`, 안내는 "2026-12-31까지 반복됩니다"다. untilDate + 빈 날짜면 "종료일을 선택해주세요"가 `role="alert"`로 보인다. 다시 "없음"을 누르면 `endType:"indefinite", endDate:null`이다.
  - todoForm(생성):
    - 반복을 켜면 「만료일시」 입력이 DOM에서 사라지고, 끄면 원래 값으로 다시 보인다(Review Focus 5).
    - 만료일시에 값이 있는 채로 반복을 켜고 저장하면 `createRecurringTodo` payload의 `recurrence`가 `{type:"daily", endType:"indefinite", endDate:null}`이고, 만료일시가 시작일시보다 앞서도 날짜 검증 토스트가 뜨지 않는다(Review Focus 1의 웹 버전).
    - 반복이 켜져 있으면 「마감 알림」 select가 만료일시 없이도 활성화되고, 고른 값이 payload `reminderOffsetMinutes`에 들어간다.
  - todoForm(수정)과 todoDetail:
    - 기존 시리즈(`endType:"untilDate", endDate:"2026-12-31"`)를 열면 「날짜 지정」과 "2026-12-31"이 선택돼 있다. 제목만 바꿔 확인 창 → 전체 적용하면 `editRecurringSeries` payload `recurrence.endDate === "2026-12-31"`이다(#160 회귀 가드). 종료일을 "2027-01-31"로 바꾸면 payload에 반영된다. 기존 시리즈 수정에서는 「만료일시」가 계속 보인다.
    - `endType:"untilDate"`인데 endDate가 ISO 형식인 옛 시리즈를 열면 「날짜 지정」 + 빈 날짜이고, 저장하면 "종료일을 선택해주세요" 토스트가 뜨고 mutate는 호출되지 않는다(Review Focus 2).

- [ ] **Step 2: 실패 확인** — 리다이렉트 설정으로 세 파일을 돌린다. 새 라벨이 없어 FAIL이 나야 한다.

- [ ] **Step 3: 구현**
  - `RecurrenceFields`: "반복 범위" 블록을 「반복 종료」로 바꾼다. 옵션 UI는 `RecurrenceTypeTabs`와 같은 탭/라디오 패턴을 쓰고, 기존 styles 토큰(다크모드 포함)을 따른다. 날짜 입력은 `<input type="date" aria-label="반복 종료일">`이다.
  - `todoForm`과 `todoDetail`:
    - 숨김 조건 `const hideDueAt = recurrenceValue !== null && !(todo?.recurrence)`가 참이면 만료일시 입력을 렌더링하지 않는다. RHF 값은 유지한다(`shouldUnregister` 기본값 false 확인).
    - `hideDueAt`이면 `getTodoDateValidationError(startAt, null)`로 검증한다.
    - `reminderOffsetMinutes`는 반복이 켜져 있으면 `parseReminderSetting(reminder)`로 저장하고, 아니면 기존대로 dueAt이 있을 때만 저장한다.
    - 마감 알림 select의 `disabled`는 `!(dueAtWatch || (recurrenceValue && startAtWatch))`다.
    - `offerIfDue`에는 반복이면 시작일시 ISO를, 아니면 dueAtIso를 넘긴다.
    - todoDetail에 마감 알림 select가 없으면 그 부분은 건너뛴다.

- [ ] **Step 4: 통과 확인** — 웹 vitest 전체를 서울·뉴욕 TZ에서 돌리고, 바뀐 파일에 `npx eslint`를 돌린다.

- [ ] **Step 5: 커밋** — `feat(web): 반복 섹션에 「반복 종료: 없음/날짜 지정」 — 새 반복은 만료일시를 숨기고 무기한 기본`

---

### Task 4: 앱 날짜 전용 입력 + 반복 종료 컨트롤 + 화면 연결

**Files:**
- Modify: `mobile/src/shared/ui/dateTimeField/DateTimeField.tsx`(날짜 전용 모드 추가) 또는 Create: `mobile/src/shared/ui/dateField/DateField.tsx`. 방식은 구현자가 정한다.
- Modify: `mobile/src/shared/ui/recurrenceSection/RecurrenceSection.tsx`
- Modify: `mobile/src/screens/TodoFormScreen.tsx`, `mobile/src/screens/TodoDetailScreen.tsx`
- Test: `mobile/src/shared/ui/recurrenceSection/__tests__/RecurrenceSection.test.tsx`, `mobile/src/screens/__tests__/TodoFormScreen.test.tsx`(없으면 생성), `mobile/src/screens/__tests__/TodoDetailScreen.test.tsx`, 날짜 필드 테스트

**Interfaces:**
- Consumes: Task 1의 core API. Task 3과 같은 동작 규칙을 쓴다(웹 코드는 import하지 않는다).
- Produces:
  - 날짜 전용 필드: `value: string | null`("YYYY-MM-DD"), `onChange: (dateKey: string | null) => void`, `label: string`. 선택한 Date는 `toDateKeyFromISO(date.toISOString())`가 아니라 로컬 연·월·일로 키를 만든다. 로컬 자정을 ISO로 바꿔 자르지 않는다.
  - `RecurrenceSectionProps`에서 `dueAt`과 `existingRule`을 없앤다(웹과 같다).

- [ ] **Step 1: 실패하는 테스트 작성** (RNTL 14의 `render`/`fireEvent.press`는 `await`한다. 한 테스트 안에서 연속 press는 각각 await한다)
  - RecurrenceSection: 켜면 "반복 종료" 라벨, `accessibilityRole="radio"` 칩 "없음"(selected)·"날짜 지정"이 보이고 "계속 반복됩니다"가 나온다. "날짜 지정"을 누르면 `onChange({…, endType:"untilDate", endDate:null})`이고, 접근성 이름 "반복 종료일" 필드가 보인다. untilDate + null이면 "종료일을 선택해주세요"가 `accessibilityRole="alert"`로 나온다. endDate "2026-12-31"이면 "2026-12-31까지 반복됩니다"다. 칩 높이 스타일은 `MIN_TOUCH_TARGET` 이상이다.
  - 날짜 필드: 선택값(로컬 2026-07-10 00:30 Date)이 onChange "2026-07-10"을 낸다. 뉴욕/서울 어느 쪽이든 같아야 한다. 지우기 버튼은 `onChange(null)`이다.
  - TodoFormScreen:
    - `route.params.dueAt`이 오늘 자정 ISO이고, 시작일시를 설정하고 반복을 켜고 저장하면 `createRecurringTodo`가 `recurrence: {type:"daily", endType:"indefinite", endDate:null}`로 호출된다. 날짜 검증 오류가 없어야 한다(Review Focus 1).
    - 반복을 켜면 "만료일시" 필드가 사라지고, 끄면 프리필 값으로 다시 보인다(Review Focus 5).
  - TodoDetailScreen:
    - 기존 untilDate 시리즈는 「날짜 지정」과 날짜로 채워진다.
    - 제목만 수정한 뒤 전체 적용하면 `editRecurringSeries` payload `recurrence.endDate`가 유지된다.
    - 종료를 "없음"으로 바꾸면 `endType:"indefinite", endDate:null`이다.
    - 기존 시리즈 수정에서는 "만료일시"가 보인다.

- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/shared/ui/recurrenceSection src/screens`

- [ ] **Step 3: 구현** — 웹 Task 3의 숨김·검증 규칙을 그대로 옮긴다. 앱 폼에는 마감 알림 select가 없으므로 알림 관련 변경은 없다. 종료 칩은 기존 주기 칩 스타일을 재사용한다.

- [ ] **Step 4: 통과 확인** — `npx tsc --noEmit && npx jest` 전체를 돌린다.

- [ ] **Step 5: 커밋** — `feat(mobile): 반복 섹션에 「반복 종료: 없음/날짜 지정」 + 날짜 전용 입력`

---

### Task 5: 정리, 문서, 최종 검증

**Files:**
- Modify: `client/src/features/todo/design/recurringTodo.spec.md`(종료 조건을 dueAt에서 유도한다는 서술을 고친다)
- Modify: core·웹·앱 주석 중 "dueAt이 있으면 반복 종료일 역할"이라는 stale 서술(`grep -rn "종료일 역할\|dueAt.*종료" client/src mobile/src packages/core/src`)
- 삭제: `client/vitest.redirect.config.ts`(커밋하지 않았는지 확인)

- [ ] **Step 1:** grep으로 남은 `toRecurrenceRuleForEdit`과 dueAt→종료 서술을 찾아 정리한다. 결과가 0건이어야 한다(문서의 변경 이력 서술은 예외).
- [ ] **Step 2:** core에서 `npm run build` 후 `git diff --exit-code -- packages/core/dist`가 깨끗해야 한다.
- [ ] **Step 3:** 최종 검증
  - core: 서울·뉴욕·UTC
  - 웹 vitest: 서울·뉴욕, `VITE_FIREBASE_API_KEY=`
  - 웹 `npx tsc -b`와 `npm run lint`
  - 앱 `tsc`와 `jest`
- [ ] **Step 4: 시뮬레이터 실기** (컨트롤러가 사용자와 함께 한다. 탭은 사용자가, 문서 확인은 임시 덤프 로그로 하며 덤프 로그는 커밋하지 않는다)
  - 오늘 탭 → 추가 → 시작일시 → 반복 켜기 → 저장한다. 회차가 4주치 생기고 규칙이 `indefinite`인지 확인한다.
  - 기존 시리즈의 종료일을 줄였다 늘린다.
- [ ] **Step 5: 커밋** — `docs: 반복 종료 조건 서술을 새 동작에 맞춤`
