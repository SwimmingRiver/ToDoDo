# 모바일 반복 할 일 + 앱 진입 정리 작업 (웹 동등화) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹의 반복 시리즈 쓰기와 앱 진입 정리 작업을 `packages/core`로 옮긴다(PR 1, 웹 동작 변경 없음). 그 core 함수로 모바일에 반복 생성·수정·시리즈 삭제·앱 진입 정리 작업을 붙인다(PR 2).

**Architecture:** core에 `src/recurring/` 모듈을 새로 만든다. 여기에 순수 로직(날짜 계산, 스윕 판단, 폼 검증·변환)과 Firestore 쓰기 함수(`db`, `userId`를 인자로 받음)를 두고, 모든 쓰기 함수가 모듈 단일 잠금 하나를 공유한다. 웹의 기존 export는 이름과 시그니처를 그대로 둔 채 core에 위임하는 얇은 래퍼(또는 re-export shim)가 된다. 모바일은 core를 직접 호출하는 훅, 공용 반복 섹션 컴포넌트, `AppState` 기반 정리 작업 훅을 추가한다.

**Tech Stack:** TypeScript, Firebase Firestore v12, Vitest(core·client), React Native/Expo + Jest(`jest-expo`, `@testing-library/react-native` v14), TanStack Query, AsyncStorage.

**Spec:** `docs/superpowers/specs/2026-11-04-mobile-recurring-parity-design.md`

## Global Constraints

- PR 1 브랜치는 `feat/mobile-recurring-parity`(이미 spec 커밋 있음)다. PR 2 브랜치는 `feat/mobile-recurring-parity-app`이고, PR 1 브랜치 끝에서 분기한다. base는 둘 다 `develop`이다.
- PR 1은 웹 동작 변경 0이다. 기존 웹 테스트의 **기대값**(어떤 문서가 어떤 필드로 쓰이는지, 에러 문구·순서)은 바꾸지 않는다. mock 배선과 import 위치만 고친다. 기대값을 바꿔야 하는 순간이 오면 멈추고 보고한다.
- core는 `@sentry/*`, `@/…` 웹 경로, 전역 `db`/`auth`를 import하지 않는다.
- client 런타임은 **커밋된** `packages/core/dist`를 읽는다. core `src`를 바꾼 커밋마다 `cd packages/core && npm run build` 후 `dist`를 함께 커밋한다(CI가 `git diff --exit-code -- dist`로 검사).
- client에서 새 core 모듈을 import할 때는 `@tododo/core/dist/recurring/index.js` 경로를 쓴다. 루트 import는 firestore가 초기 번들에 들어와 금지다. 예외로 `api/todoApi.ts`는 이미 루트를 쓰니 그대로 둔다.
- 날짜: `dueAt`/`startAt`은 UTC `Z` ISO 문자열이다. 날짜 키는 `split("T")[0]`이 아니라 로컬 변환(core `insights/date.ts`의 `toDateKeyFromISO`)으로 뽑는다. 테스트는 절대 날짜 하드코딩 대신 시스템 시간 mock(`vi.setSystemTime` / `jest.useFakeTimers().setSystemTime`)으로 고정한다.
- 문구는 웹과 동일하게 쓴다. 아래 "고정 문구" 표가 기준이다.
- 반복 할 일에는 모바일 로컬 알림(`scheduleReminder`)을 걸지 않는다.
- client 유닛 테스트는 CI와 같게 `VITE_FIREBASE_API_KEY= npx vitest run …`으로 돌린다. 로컬 `.env`에 `VITE_BILLING_ENABLED=true`가 있으면 무관한 aiPlanModal 테스트가 실패할 수 있다.
- 서브에이전트는 git hooks를 우회하면 안 된다(`--no-verify` 금지). 훅이 실패하면 고쳐서 다시 커밋한다.
- `@testing-library/react-native` v14의 `render`·`renderHook`·`fireEvent.*`는 async다. 반드시 `await`한다.

### 고정 문구 (웹에서 그대로 복사)

| 위치 | 문구 |
| --- | --- |
| 스위치 라벨 | `이 할 일을 반복합니다` |
| 비활성 (시작일시 없음) | `반복 설정은 시작일시를 입력해야 사용할 수 있습니다` |
| 비활성 (하위 할 일 있음) | `하위 할 일이 있는 항목은 반복을 설정할 수 없습니다` |
| 섹션 라벨 | `반복 주기` / `반복 요일` / `반복 범위` |
| 주기 칩 | `매일` / `매주` / `매월` |
| 요일 | `일 월 화 수 목 금 토` (0=일) |
| 요일 미선택 에러 | `요일을 하나 이상 선택해주세요` |
| 매월 안내 | `매월 {N}일에 반복됩니다 (시작일시 기준)`, N≥29이면 추가로 `31일이 없는 달은 해당 월 마지막 날에 생성됩니다` |
| 범위 안내 | `{YYYY-MM-DD}까지 반복됩니다` / `마감일시가 없으면 무기한으로 반복됩니다` |
| 범위 에러 | `마감일은 시작일과 같거나 이후여야 합니다` |
| 시리즈 수정 확인 | 제목 `반복 일정 수정`, 본문 `이 변경은 이 일정과 이후 일정에 적용됩니다.\n\n이전 일정과 이미 완료됐거나 진행 중인 회차는 그대로 유지됩니다.`, 버튼 `취소` / `전체 적용` |
| 반복 삭제 확인 | 제목 `할 일 삭제`, 본문 `"{title}"은(는) 반복 일정입니다.\n\n삭제하면 이 반복 시리즈의 모든 일정이 함께 삭제됩니다.`, 버튼 `취소` / `삭제`(destructive) |
| 전환 후 정리 실패 | `새 반복 일정은 생성되었지만 기존 항목 정리에 실패했습니다. 목록을 확인해주세요` |
| 시리즈 저장 실패 | `반복 일정 저장 중 오류가 발생했습니다. 다시 시도해주세요` |

## Review Focus

1. **자정 근처의 KST 시각:** 예를 들어 `dueAt = 2026-11-05T15:30:00Z`는 KST로 11-06이다. 범위 안내와 `endDate`는 로컬 날짜인 `2026-11-06`이어야 한다. 이 테스트는 Task 1(`toRecurrenceRule`)과 Task 6(범위 안내)에 넣고, 기대값은 로컬 게터로 계산한다.
2. **같은 세션에서 계정 전환:** A로 로그아웃하고 B로 로그인하면 B 기준으로 정리 작업이 한 번 돌아야 한다. A의 "이미 실행함" 표시가 B를 막으면 안 된다. 테스트는 Task 9에 넣는다.
3. **정리 작업 도중 포그라운드 복귀:** 실행 중에 `AppState`가 `active`가 되어도 두 번째 실행이 겹치면 안 된다. 테스트는 Task 9에 넣는다.
4. **반복을 켠 채 시작일시를 지우는 경우:** 반복이 꺼지고 저장은 일반 할 일 경로로 가야 한다. 테스트는 Task 7에 넣는다.
5. **반복 저장 버튼 더블탭:** `createRecurringTodo`/`editRecurringSeries`는 한 번만 호출되어야 한다. 테스트는 Task 7과 Task 8에 넣는다.

---

## PR 1: core로 이동 (브랜치 `feat/mobile-recurring-parity`)

### Task 1: core 순수 반복 로직 + 웹 shim

**Files:**
- Create: `packages/core/src/recurring/recurrence.ts`. 웹 `client/src/features/todo/utils/recurrence.ts`를 이동한다. `toDateKeyFromISO`는 `../insights/date`에서 가져온다.
- Create: `packages/core/src/recurring/startupMaintenance.ts`. 웹 `utils/startupMaintenance.ts`를 이동하고 core `Todo` 타입을 쓴다. core `Todo.recurrence`/`recurrenceId`는 optional이므로 `?? null`로 다룬다.
- Create: `packages/core/src/recurring/recurrenceForm.ts`. 웹 `components/recurrence/recurrenceValidation.ts`, `recurrenceTransform.ts`, `weekdayConstants.ts`, `recurrenceFields.types.ts`의 비-UI 내용을 합친다.
- Create: `packages/core/src/recurring/index.ts`. 위 세 파일을 재수출한다.
- Modify: `packages/core/src/index.ts`. `export * from "./recurring";`를 추가한다.
- Move tests: `client/src/features/todo/utils/__tests__/{recurrence,startupMaintenance}.test.ts`, `components/recurrence/__tests__/{recurrenceTransform,recurrenceValidation}.test.ts`를 `packages/core/src/recurring/__tests__/`로 옮긴다. import만 고치고 기대값은 그대로 둔다. 옮긴 뒤 client 쪽 원본은 삭제한다.
- Modify (shim): 웹의 위 소스 파일 6개는 본문을 지운다. 그 자리는 `@tododo/core/dist/recurring/index.js`에서 같은 이름을 재수출하는 한 줄짜리 파일로 바꾼다. `RecurrenceFormValue` 타입도 재수출한다. 웹 소비자 파일은 수정하지 않는다.
- Modify: `packages/core/dist/**`. 빌드 산출물이다.

**Interfaces:**
- Produces (core `recurring`):
  - `RECURRENCE_HORIZON_WEEKS = 4`
  - `getDefaultHorizonEnd(from?: Date): Date`
  - `generateRecurringDueDates(startAt: string, rule: RecurrenceRule, horizonEnd: Date): string[]`
  - `buildRecurringInstanceId(recurrenceId: string, dueAt: string): string`
  - `planArchivedSweep`, `planOverdueRecurringSweep`, `planIndefiniteExtension`, `buildExtensionCreates`: 웹과 같은 시그니처이고 `Todo`만 core 타입이다.
  - 타입: `TodoFieldUpdate`, `ArchiveGroup`, `TodoCreate`, `SeriesExtension`
  - `type RecurrenceFormValue = { type: "daily" | "weekly" | "monthly"; weekdays?: number[] }`
  - `WEEKDAY_LABELS: string[]`, `WEEKDAY_REQUIRED_ERROR: string`
  - `getRecurrenceValidationError(value: RecurrenceFormValue | null, startAt: string | null, dueAt: string | null): string | null`
  - `toFormValue(rule: RecurrenceRule | null | undefined): RecurrenceFormValue | null`
  - `toRecurrenceRule(value: RecurrenceFormValue | null, dueAt: string | null): RecurrenceRule | null`

- [ ] **Step 1: 테스트를 core로 옮기고 Review Focus 1 테스트를 추가한다**

`recurrenceTransform.test.ts`에 아래 테스트를 추가한다. TZ와 무관하게 로컬 날짜 키를 기대하는지 확인하는 테스트다.

```ts
it("toRecurrenceRule의 endDate는 dueAt의 로컬 날짜 키다 (UTC split 금지)", () => {
  const dueAt = "2026-11-05T15:30:00.000Z";
  const d = new Date(dueAt);
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  expect(toRecurrenceRule({ type: "daily" }, dueAt)).toEqual({
    type: "daily", endType: "untilDate", endDate: expected,
  });
});
```

- [ ] **Step 2: 실패를 확인한다.** `cd packages/core && npx vitest run src/recurring`를 실행한다. 모듈이 없어서 FAIL이어야 한다.
- [ ] **Step 3: core `recurring/` 파일 4개를 만들고 루트 index에 재수출을 추가한다.**
- [ ] **Step 4: core 테스트가 통과하는지 확인한다.** `cd packages/core && npx vitest run && TZ=America/New_York npx vitest run`를 실행한다. 둘 다 PASS여야 한다.
- [ ] **Step 5: 빌드하고 웹 shim으로 교체한다.** `npm run build`(core)를 실행한 뒤 웹 원본 6개를 재수출 shim으로 바꾸고, client로 옮긴 테스트 원본을 삭제한다.
- [ ] **Step 6: 웹이 그대로 도는지 확인한다.** `cd client && npx tsc -b && VITE_FIREBASE_API_KEY= npx vitest run`를 실행한다. 전부 PASS여야 하고, 테스트 수는 옮긴 개수만큼만 줄어야 한다.
- [ ] **Step 7: 커밋한다.** `refactor(core): 반복·정리 순수 로직을 packages/core로 이동` (core src + dist + client shim + 테스트 이동)

### Task 2: core 반복 시리즈 쓰기 함수 (생성·수정·삭제) + 공유 잠금

**Files:**
- Create: `packages/core/src/recurring/seriesLock.ts`. 모듈 단일 `withRecurringSeriesLock`이고, 웹 구현을 그대로 옮긴다.
- Create: `packages/core/src/recurring/seriesApi.ts`. 웹 `createRecurringTodoImpl`/`editRecurringSeriesImpl`/`deleteRecurringSeriesImpl`과 `getNextRootOrder`를 옮긴다. 전역 `db`/`getUserId()`/`todosRef` 대신 인자로 받는다. 에러 문구는 그대로 둔다.
- Test: `packages/core/src/recurring/__tests__/seriesApi.test.ts`. 웹 `client/src/features/todo/api/__tests__/recurringTodoApi.test.ts`의 기대값을 core 시그니처로 옮긴다. firestore mock 방식은 기존 `packages/core/src/api/__tests__/todoApi.test.ts`를 따른다.
- Modify: `client/src/features/todo/api/todoApi.ts`. `createRecurringTodo`/`editRecurringSeries`/`deleteRecurringSeries`의 본문을 core 호출로 바꾼다(`db`, `getUserId()` 주입). 웹 export 시그니처와 반환 타입은 유지하고, 필요하면 `as Todo[]`로 맞춘다.
- Modify: `client/src/features/todo/api/__tests__/recurringTodoApi.test.ts`. 웹 쪽에는 래퍼 위임 검증만 남긴다. `vi.mock("@tododo/core", …)`로 core 함수를 가짜로 바꾸고 다음을 확인한다.
  - (a) `db`와 현재 uid가 전달되는지
  - (b) 로그인되지 않았으면 `"Not authenticated"`를 던지는지
  - (c) `horizonEnd` 인자가 전달되는지

  Firestore 쓰기 기대값 테스트는 Step 1에서 core로 옮긴 쪽이 담당한다.
- Modify: `packages/core/dist/**`

**Interfaces:**
- Produces:
  - `withRecurringSeriesLock<T>(run: () => Promise<T>): Promise<T>`. 같은 모듈 인스턴스 하나를 Task 3도 쓴다.
  - `type RecurringTodoInput = { id?: string; title: string; description?: string; priority: Todo["priority"]; startAt: string | null; dueAt: string | null; parentId: string | null; recurrence: RecurrenceRule | null; recurrenceId?: string | null } & Partial<Omit<Todo, "id">>`. 런타임은 웹처럼 입력의 나머지 키를 인스턴스에 펼쳐 넣는다.
  - `createRecurringTodo(db: Firestore, userId: string, todo: RecurringTodoInput, horizonEnd?: Date): Promise<Todo[]>`
  - `editRecurringSeries(db: Firestore, userId: string, seriesTodo: RecurringTodoInput & { id: string }, horizonEnd?: Date): Promise<void>`
  - `deleteRecurringSeries(db: Firestore, userId: string, recurrenceId: string): Promise<void>`

- [ ] **Step 1: 웹 `recurringTodoApi.test.ts`의 쓰기 기대값 테스트를 core `seriesApi.test.ts`로 옮긴다.** 호출은 `createRecurringTodo(fakeDb, "u1", …)` 형태로 바꾸고 기대값은 그대로 둔다. 잠금 테스트도 하나 추가한다. `editRecurringSeries`의 `getDocs`가 끝나기 전에 `deleteRecurringSeries`를 호출하면, delete의 `getDocs`가 edit의 `batch.commit` 이후에야 호출되는지 확인하는 테스트다.
- [ ] **Step 2: 실패를 확인한다.** `cd packages/core && npx vitest run src/recurring/__tests__/seriesApi.test.ts`를 실행한다. FAIL이어야 한다.
- [ ] **Step 3: `seriesLock.ts`와 `seriesApi.ts`를 구현하고 `recurring/index.ts`에서 재수출한다.**
- [ ] **Step 4: 통과를 확인한다.** Step 2와 같은 명령을 기본 TZ와 `TZ=America/New_York`로 각각 실행한다. 둘 다 PASS여야 한다.
- [ ] **Step 5: core를 빌드하고 웹 래퍼로 교체한 뒤 웹 래퍼 테스트를 다시 쓴다.** 웹 `todoApi.ts`의 기존 `recurringSeriesMutex`와 `withRecurringSeriesLock`은 삭제한다. 이 시점에서 웹 `runStartupMaintenance`는 아직 웹 잠금을 쓰므로, Task 3이 끝날 때까지는 core의 `withRecurringSeriesLock`을 import해서 쓴다. 이렇게 해야 생성·수정·삭제와 정리 작업이 같은 잠금을 공유한다.
- [ ] **Step 6: 웹 전체를 검증한다.** `cd client && npx tsc -b && VITE_FIREBASE_API_KEY= npx vitest run`를 실행한다. 전부 PASS여야 한다.
- [ ] **Step 7: 커밋한다.** `refactor(core): 반복 시리즈 생성·수정·삭제를 core로 이동, 웹은 위임`

### Task 3: core 앱 진입 정리 작업 + PR 1 마무리

**Files:**
- Create: `packages/core/src/recurring/startupMaintenanceApi.ts`. 웹 `runStartupMaintenanceImpl`과 `fetchAllUserTodos`, `commitUpdates`, `commitArchiveGroups`, `commitCreates`, `nextRootOrderFrom`, `runSweep`, `SWEEP_BATCH_SIZE = 400`을 옮긴다.
- Test: `packages/core/src/recurring/__tests__/startupMaintenanceApi.test.ts`. 웹 `api/__tests__/startupMaintenance.api.test.ts`의 기대값을 옮긴다.
- Modify: `client/src/features/todo/api/todoApi.ts`. `runStartupMaintenance(cutoffDays = 30, horizonEnd = getDefaultHorizonEnd()): Promise<number>`의 시그니처는 그대로 둔다. 본문은 core를 호출하고 `.written`을 반환한다. `onSweepError`에는 `(error, sweep) => { console.error(\`앱 진입 유지보수 실패 (${sweep}):\`, error); Sentry.captureException(error, { tags: { sweep } }); }`를 넘긴다. 웹 자체 `fetchAllUserTodos` export는 insights가 쓰므로 남겨 둔다.
- Modify: `client/src/features/todo/api/__tests__/startupMaintenance.api.test.ts`. Task 2와 같은 방식으로 래퍼 위임과 Sentry 콜백 연결만 검증한다. 콜백을 호출하면 `Sentry.captureException(error, { tags: { sweep: "archived" } })`가 불리는지 확인한다.
- Modify: `packages/core/dist/**`

**Interfaces:**
- Consumes: Task 2 `withRecurringSeriesLock`; Task 1 `plan*`·`buildExtensionCreates`·`getDefaultHorizonEnd`
- Produces:
  - `type SweepName = "archived" | "overdue" | "extension"`
  - `type StartupMaintenanceResult = { written: number; failedSweeps: SweepName[] }`
  - `runStartupMaintenance(db: Firestore, userId: string, options?: { cutoffDays?: number; horizonEnd?: Date; onSweepError?: (error: unknown, sweep: SweepName) => void }): Promise<StartupMaintenanceResult>`. 스윕마다 실패를 삼키는 것은 웹과 같다. 대신 실패한 스윕 이름을 `failedSweeps`에 담는다. 전체 읽기(`fetchAllUserTodos`)가 실패하면 reject한다.

- [ ] **Step 1: 웹 API 테스트의 기대값을 core 테스트로 옮긴다.** 다음 테스트도 추가한다. `writeBatch().commit`이 archived 스윕에서 reject되면 결과가 `{ written: <나머지 스윕 합>, failedSweeps: ["archived"] }`이고, `onSweepError`가 `(err, "archived")`로 한 번 호출되는지 확인한다.
- [ ] **Step 2: 실패를 확인한다.** `cd packages/core && npx vitest run src/recurring/__tests__/startupMaintenanceApi.test.ts`를 실행한다. FAIL이어야 한다.
- [ ] **Step 3: 구현하고 재수출한다.**
- [ ] **Step 4: core 전체가 통과하는지 확인한다.** `npx vitest run && TZ=America/New_York npx vitest run && npm run build && git status --short dist`를 실행한다. PASS여야 하고, dist 변경은 커밋할 대상이다.
- [ ] **Step 5: 웹 래퍼로 교체한다.** 웹 `todoApi.ts`에 남은 정리 작업 전용 내부 함수를 삭제하고, 웹 테스트를 수정한다.
- [ ] **Step 6: PR 1 전체를 검증한다.** 각 명령의 기대 결과는 다음과 같다.
  - `cd client && npx tsc -b && VITE_FIREBASE_API_KEY= npx vitest run && TZ=America/New_York VITE_FIREBASE_API_KEY= npx vitest run`: 전부 PASS
  - `cd client && npm run lint`: 에러 0
  - `cd client && npm run build`: 성공. `reference_bundle_size_measurement` 방식으로 초기 번들 증분을 확인하고, 이 브랜치와 develop을 비교해 수 kB 이내여야 한다.
  - `cd client && npm run test:e2e`: 전부 PASS. 로컬에서는 먼저 JDK 21인지, 8080 포트에 고아 에뮬레이터가 없는지 확인한다.
- [ ] **Step 7: 커밋하고 PR 1을 연다.**
  - 커밋: `refactor(core): 앱 진입 정리 작업을 core로 이동, 웹은 Sentry 콜백 주입`
  - push 후 `develop` 대상 PR을 연다. 본문에 "웹 동작 변경 없음 — 기대값 무변경 테스트 + E2E로 확인"을 적는다.

---

## PR 2: 모바일 (브랜치 `feat/mobile-recurring-parity-app`, PR 1 끝에서 분기)

### Task 4: 모바일 반복 시리즈 훅

**Files:**
- Create: `mobile/src/hooks/useCreateRecurringTodo.ts`, `useEditRecurringSeries.ts`, `useDeleteRecurringSeries.ts`
- Test: `mobile/src/hooks/__tests__/useRecurringSeries.test.tsx`

**Interfaces:**
- Consumes: core `createRecurringTodo`, `editRecurringSeries`, `deleteRecurringSeries`, `RecurringTodoInput`
- Produces:
  - `useCreateRecurringTodo()`: `useMutation<Todo[], Error, RecurringTodoInput>`
  - `useEditRecurringSeries()`: `useMutation<void, Error, RecurringTodoInput & { id: string }>`
  - `useDeleteRecurringSeries()`: `useMutation<void, Error, string /* recurrenceId */>`
  - 셋 다 `db`와 `user!.uid`를 주입하고, 성공 시 `["todos", user?.uid]`를 무효화한다. `scheduleReminder`는 호출하지 않는다.

- [ ] **Step 1: 테스트를 작성한다.** 기존 `useCreateTodo.test.tsx`의 mock 패턴을 따른다. 각 훅마다 다음 두 가지를 확인한다.
  - (a) core 함수가 `({}, "u1", input)`으로 호출되는지
  - (b) 성공 시 `invalidateQueries({ queryKey: ["todos", "u1"] })`가 불리는지

  생성 훅은 하나 더 확인한다.
  - (c) `scheduleReminder`가 호출되지 않는지
- [ ] **Step 2: 실패를 확인한다.** `cd mobile && npx jest src/hooks/__tests__/useRecurringSeries.test.tsx`를 실행한다. FAIL이어야 한다.
- [ ] **Step 3: 훅 3개를 구현한다.**
- [ ] **Step 4: 통과를 확인한다.** Step 2와 같은 명령을 실행한다. PASS여야 한다.
- [ ] **Step 5: 커밋한다.** `feat(mobile): 반복 시리즈 생성·수정·삭제 훅`

### Task 5: 모바일 정리 작업 실행 판단 + 저장소 (순수 로직)

**Files:**
- Create: `mobile/src/maintenance/maintenanceSchedule.ts`
- Test: `mobile/src/maintenance/__tests__/maintenanceSchedule.test.ts`

**Interfaces:**
- Produces:
  - `MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000`
  - `shouldRunOnForeground(lastSuccessMs: number | null, nowMs: number): boolean`: `null`이거나 `nowMs - lastSuccessMs >= MAINTENANCE_INTERVAL_MS`이면 true
  - `readLastSuccess(uid: string): Promise<number | null>`, `writeLastSuccess(uid: string, ms: number): Promise<void>`: AsyncStorage 키는 `startupMaintenance:lastSuccess:${uid}`. 읽기 실패나 파싱 실패는 `null`로 처리한다.

- [ ] **Step 1: 테스트를 작성한다.** 확인할 것은 다음과 같다.
  - `shouldRunOnForeground(null, t)`는 true다.
  - 23시간 59분이 지났으면 false다.
  - 정확히 24시간이 지났으면 true다.
  - `readLastSuccess`는 uid별로 분리된 키를 읽는다.
  - 저장소가 throw하거나 값이 숫자가 아니면 `null`을 반환한다.

  AsyncStorage는 `jest.mock("@react-native-async-storage/async-storage", …)`로 바꾼다.
- [ ] **Step 2: 실패를 확인한다.** `npx jest src/maintenance`를 실행한다. FAIL이어야 한다.
- [ ] **Step 3: 구현한다.**
- [ ] **Step 4: 통과를 확인한다.** Step 2와 같은 명령을 실행한다. PASS여야 한다.
- [ ] **Step 5: 커밋한다.** `feat(mobile): 앱 정리 작업 실행 간격 판단과 마지막 성공 시각 저장`

### Task 6: 반복 설정 섹션 컴포넌트 (A안)

**Files:**
- Create: `mobile/src/shared/ui/recurrenceSection/RecurrenceSection.tsx`. 스위치, 주기 칩, 요일 토글, 매월·범위 안내, 에러를 담는다.
- Test: `mobile/src/shared/ui/recurrenceSection/__tests__/RecurrenceSection.test.tsx`

**Interfaces:**
- Consumes: core `RecurrenceFormValue`, `WEEKDAY_LABELS`, `WEEKDAY_REQUIRED_ERROR`, `getRecurrenceValidationError`, `toDateKeyFromISO`
- Produces: `RecurrenceSection(props: { disabled: boolean; disabledReason?: "hasChildren" | "noStartAt"; startAt: string | null; dueAt: string | null; value: RecurrenceFormValue | null; onChange: (v: RecurrenceFormValue | null) => void })`. 동작은 웹 `recurrenceFields.tsx`와 같다.
  - 스위치를 켜면 `{ type: "daily" }`가 된다.
  - 주기를 매주로 바꾸면 `weekdays`는 기존 값을 유지하거나 `[]`가 된다.
  - 다른 주기로 바꾸면 `weekdays`는 `undefined`가 된다.
  - 요일 토글 결과는 정렬된 배열이다.

  스타일은 다음을 따른다.
  - 칩: `PriorityChips` 모양
  - 선택 색: `colors.brand.strong`
  - 안내 박스 배경: brand tint 토큰
  - 터치 타겟: 44px 이상
  - 스위치: RN `Switch`
  - 접근성: 요일 버튼에 `accessibilityRole="button"`, `accessibilityState={{ selected }}`, `accessibilityLabel="{요일}요일"`

- [ ] **Step 1: 테스트를 작성한다.** 고정 문구 표의 문구로 확인할 것은 다음과 같다.
  - 꺼진 상태에서 스위치를 누르면 `onChange({ type: "daily" })`가 호출된다.
  - `disabled`와 `noStartAt`이면 해당 비활성 문구가 보이고, 스위치를 눌러도 `onChange`가 호출되지 않는다.
  - 매주 + `weekdays: []`이면 `요일을 하나 이상 선택해주세요`가 보인다.
  - `월` 요일을 누르면 `onChange({ type: "weekly", weekdays: [1] })`가 호출된다.
  - 매월이면서 `startAt`의 로컬 날짜가 30일이면 매월 안내와 31일 보조 문구가 모두 보인다. `startAt`은 `new Date(2026, 10, 30, 7).toISOString()`처럼 로컬 기준으로 만든다.
  - `dueAt=null`이면 무기한 문구가 보인다.
  - Review Focus 1: `dueAt="2026-11-05T15:30:00.000Z"`이면 `{로컬 키}까지 반복됩니다`가 보인다. 로컬 키는 Task 1과 같은 방식으로 계산한다.
- [ ] **Step 2: 실패를 확인한다.** `npx jest src/shared/ui/recurrenceSection`를 실행한다. FAIL이어야 한다.
- [ ] **Step 3: 구현한다.**
- [ ] **Step 4: 통과를 확인한다.** Step 2와 같은 명령을 실행한다. PASS여야 한다.
- [ ] **Step 5: 커밋한다.** `feat(mobile): 반복 설정 섹션 컴포넌트 (웹 RecurrenceFields 동등)`

### Task 7: 작성 화면에 반복 연결

**Files:**
- Modify: `mobile/src/screens/TodoFormScreen.tsx`
- Test: `mobile/src/screens/__tests__/TodoFormScreen.test.tsx`

**Interfaces:**
- Consumes: Task 4 `useCreateRecurringTodo`, Task 6 `RecurrenceSection`, core `toRecurrenceRule`, `getRecurrenceValidationError`

동작 규칙:
- `parentId`가 있으면(하위 할 일 작성) 섹션을 렌더링하지 않는다.
- 섹션은 "더보기" 영역 안, 만료일시와 날짜 에러 아래에 둔다. `disabled = !startAt`, `disabledReason = "noStartAt"`.
- 반복이 켜진 상태에서 `startAt`이 `null`이 되면 `recurrenceValue`를 `null`로 바꾼다(`useEffect`).
- 제출할 때 `getRecurrenceValidationError`가 값을 주면 그 문구를 에러로 보여 주고 중단한다.
- 반복이 켜져 있으면 `createRecurringTodo({ title, description, priority, startAt, dueAt, parentId: null, order: nextOrder, recurrence: toRecurrenceRule(value, dueAt) })`를 호출한다. 아니면 기존 `createTodo` 경로를 탄다.
- 더블탭 가드: 두 mutation 중 하나라도 `isPending`이면 제출을 무시하고 버튼은 `loading`으로 표시한다.

- [ ] **Step 1: 테스트를 추가한다.** 확인할 것은 다음과 같다.
  - `parentId`가 있으면 `이 할 일을 반복합니다`가 없다.
  - 시작일시를 정하고 반복을 켜서 저장하면 `createRecurringTodo`가 `recurrence: { type: "daily", endType: "indefinite", endDate: null }`로 한 번 호출되고, `createTodo`는 호출되지 않는다.
  - Review Focus 4: 반복을 켠 뒤 시작일시를 지우고 저장하면 `createTodo`가 호출되고 `createRecurringTodo`는 호출되지 않는다.
  - 매주 + 요일 없이 저장하면 에러 문구가 보이고 아무 mutation도 호출되지 않는다.
  - Review Focus 5: `createRecurringTodo` mutation이 pending인 동안 저장을 두 번 눌러도 한 번만 호출된다. mock이 끝나지 않는 Promise를 반환하게 하고, `fireEvent.press`는 각각 `await`한다.
- [ ] **Step 2: 실패를 확인한다.** `npx jest src/screens/__tests__/TodoFormScreen.test.tsx`를 실행한다. 새 테스트가 FAIL이어야 한다.
- [ ] **Step 3: 구현한다.**
- [ ] **Step 4: 통과를 확인한다.** Step 2와 같은 명령을 실행한다. PASS여야 한다.
- [ ] **Step 5: 커밋한다.** `feat(mobile): 할 일 작성 화면에서 반복 설정`

### Task 8: 상세 화면 수정·전환·시리즈 삭제

**Files:**
- Modify: `mobile/src/screens/TodoDetailScreen.tsx`
- Test: `mobile/src/screens/__tests__/TodoDetailScreen.test.tsx`

**Interfaces:**
- Consumes: Task 4 훅 3개, Task 6 `RecurrenceSection`, core `toFormValue`, `toRecurrenceRule`, `getRecurrenceValidationError`

동작 규칙은 웹 `todoDetail.tsx`와 같다.

- **섹션 표시**
  - 루트 할 일(`parentId === null`)에만 섹션을 렌더링한다.
  - `disabled = childTodos.length > 0 || !startAt`이고, 사유는 하위 할 일을 먼저 따진다.
  - `recurrenceValue`는 `todo.id`가 바뀔 때 `toFormValue(todo.recurrence)`로 다시 채운다. 기존 시딩 `useEffect`에 넣는다.
- **저장:** 먼저 `updated = { ...todo, title, description, priority, startAt, dueAt, recurrence: toRecurrenceRule(recurrenceValue, dueAt) }`를 만든 뒤 다음 순서로 분기한다.
  1. `todo.recurrence != null`이면(규칙 변경, 끄기, 일반 필드만 수정 모두 해당) 시리즈 수정 확인 `Alert.alert`를 띄운다. `전체 적용`을 누르면 `editRecurringSeries(updated)`를 호출하고, 성공하면 `goBack`한다. 실패하면 `반복 일정 저장 중 오류가 발생했습니다. 다시 시도해주세요`를 에러로 보여 준다.
  2. `updated.recurrence != null`이면(비반복 → 반복 전환) `createRecurringTodo(updated)`를 호출하고, 성공한 뒤에 `deleteTodo(todo.id)`를 호출한다.
     - 삭제까지 성공하면 `goBack`한다.
     - 삭제만 실패하면 전환 후 정리 실패 문구를 띄우고 `goBack`한다.
     - 생성이 실패하면 원본을 그대로 두고 에러를 보여 준다.
  3. 둘 다 아니면 기존 `updateTodo` 경로를 탄다.
- **삭제:** `todo.recurrenceId`가 있으면 반복 삭제 확인 문구를 띄우고, 확인하면 `deleteRecurringSeries(todo.recurrenceId)` 후 `goBack`한다. 없으면 기존 동작 그대로다.
- **하위 할 일 추가:** `todo.recurrenceId`가 있으면 `+ 하위 할 일 추가` 버튼을 렌더링하지 않는다.
- **더블탭 가드:** 저장 관련 mutation 중 하나라도 pending이면 저장을 무시한다.

- [ ] **Step 1: 테스트를 추가한다.** `Alert.alert`는 `jest.spyOn`으로 잡고, 버튼 `onPress`를 직접 호출한다. 확인할 것은 다음과 같다.
  - 반복 할 일의 제목만 바꿔 저장하면 확인 창이 뜨고, `전체 적용` 후 `editRecurringSeries`가 바뀐 title과 원래 `recurrenceId`로 호출된다. `updateTodo`는 호출되지 않는다.
  - 확인 창에서 `취소`를 누르면 아무 mutation도 호출되지 않는다.
  - 비반복 할 일에서 반복을 켜고 저장하면 `createRecurringTodo` 다음에 `deleteTodo(todo.id)`가 이 순서로 호출된다.
  - `createRecurringTodo`가 reject되면 `deleteTodo`는 호출되지 않는다.
  - 반복 할 일을 삭제하면 반복 삭제 문구가 뜨고, 확인 후 `deleteRecurringSeries(recurrenceId)`가 호출되며 `deleteTodo`는 호출되지 않는다.
  - 반복 할 일에는 `하위 할 일 추가` 버튼이 없다.
  - 하위 할 일이 있는 루트에서는 섹션이 비활성이고 하위 할 일 사유 문구가 보인다.
  - Review Focus 5: `전체 적용`의 `onPress`를 두 번 호출해도 pending 동안 `editRecurringSeries`는 한 번만 호출된다.
- [ ] **Step 2: 실패를 확인한다.** `npx jest src/screens/__tests__/TodoDetailScreen.test.tsx`를 실행한다. 새 테스트가 FAIL이어야 한다.
- [ ] **Step 3: 구현한다.**
- [ ] **Step 4: 통과를 확인한다.** Step 2와 같은 명령을 실행한다. PASS여야 한다.
- [ ] **Step 5: 커밋한다.** `feat(mobile): 상세 화면 반복 수정·전환·시리즈 삭제 (웹 규칙 동일)`

### Task 9: 앱 진입 정리 작업 훅 + 연결

**Files:**
- Create: `mobile/src/maintenance/useStartupMaintenance.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx`. `MainTabs`가 렌더링되는 경로(로그인 상태)에서 `useStartupMaintenance(user.uid)`를 호출한다. 작은 래퍼 컴포넌트를 써도 된다.
- Test: `mobile/src/maintenance/__tests__/useStartupMaintenance.test.tsx`

**Interfaces:**
- Consumes: core `runStartupMaintenance`, Task 5 `shouldRunOnForeground`, `readLastSuccess`, `writeLastSuccess`
- Produces: `useStartupMaintenance(uid: string | null): void`, 테스트 전용 `resetStartupMaintenanceState(): void`

동작 규칙:
- 모듈 수준 `claimedUids: Set<string>`가 있다. uid가 처음 나타나면(콜드 스타트 또는 로그인) 마지막 성공 시각과 상관없이 한 번 실행한다. 같은 프로세스에서 다시 마운트되면 claim이 이미 있으므로 실행하지 않는다.
- `AppState.addEventListener("change")`에서 상태가 `"active"`가 되면 `readLastSuccess(uid)`를 읽고, `shouldRunOnForeground`가 true일 때 실행한다.
- 모듈 수준 `inFlight: Set<string>`가 있다. 실행 중인 uid는 다시 실행하지 않는다.
- 실행: `runStartupMaintenance(db, uid, { onSweepError: (e, s) => console.error(\`앱 진입 유지보수 실패 (${s}):\`, e) })`
  - `failedSweeps.length === 0`이면 `writeLastSuccess(uid, Date.now())`를 호출한다.
  - `written > 0`이면 `queryClient.invalidateQueries({ queryKey: ["todos"] })`를 호출한다.
  - reject되면 `console.error`만 남기고 시각을 갱신하지 않는다.

- [ ] **Step 1: 테스트를 작성한다.** core는 `jest.mock("@tododo/core")`로, AppState는 `jest.spyOn(AppState, "addEventListener")`로 리스너를 잡는다. 확인할 것은 다음과 같다.
  - 마운트 시 한 번 실행되고, 언마운트 후 같은 uid로 다시 마운트하면 실행되지 않는다.
  - 리스너에 `"active"`를 주고 lastSuccess가 1시간 전이면 실행되지 않는다. 25시간 전이면 실행된다.
  - `failedSweeps: ["extension"]`이면 `writeLastSuccess`가 호출되지 않는다. `[]`이면 호출된다.
  - `written: 0`이면 `invalidateQueries`가 호출되지 않는다. `written: 3`이면 `["todos"]`로 호출된다.
  - reject되어도 throw하지 않고 `console.error`가 호출된다.
  - Review Focus 2: uid `"a"`로 마운트한 뒤 `"b"`로 rerender하면 `runStartupMaintenance`가 `({}, "b", …)`로 호출된다.
  - Review Focus 3: 첫 실행이 resolve되기 전에 `"active"`(lastSuccess=null)를 주면 추가 실행이 없다. 호출은 총 1회여야 한다.
- [ ] **Step 2: 실패를 확인한다.** `npx jest src/maintenance`를 실행한다. FAIL이어야 한다.
- [ ] **Step 3: 훅을 구현하고 `RootNavigator`에 연결한다.**
- [ ] **Step 4: 통과를 확인한다.** Step 2와 같은 명령을 실행한다. PASS여야 한다.
- [ ] **Step 5: 커밋한다.** `feat(mobile): 앱 진입·24시간 경과 포그라운드 시 정리 작업 실행`

### Task 10: PR 2 검증 + 시뮬레이터 확인

- [ ] **Step 1: 자동 검증을 실행한다.**
  - `cd mobile && npx tsc --noEmit && npx jest`: 에러 0, 전부 PASS
  - `cd packages/core && npx vitest run`: PASS
- [ ] **Step 2: 시뮬레이터를 띄우기 전에 함정을 확인한다.**
  - `mobile/metro.config.js`에 blockList가 있는지 확인한다.
  - `ls packages/core/node_modules/firebase`가 있으면 firebase가 두 벌 로드될 수 있으니 확인한다.
  - 워크트리에 심볼릭 `node_modules`가 있으면 `reference_worktree_mobile_metro_firebase_dup` 메모대로 처리한다.
  - 오래 떠 있던 Metro가 아니라 새 Metro를 쓴다.
- [ ] **Step 3: 사용자와 함께 실기 확인한다.**
  - 반복 생성: 매주 월·수·금, 무기한
  - 오늘 탭에서 회차 체크
  - 상세에서 제목 수정 후 전체 적용
  - 반복 끄기
  - 시리즈 삭제
  - 같은 계정의 웹에서 결과가 같게 보이는지
  - 간격 등 시각 세부 조정은 사용자 피드백으로 별도 커밋한다.
- [ ] **Step 4: PR 2를 연다.** push 후 `develop` 대상 PR을 연다. PR 1이 아직 병합되지 않았으면 base를 PR 1 브랜치로 두고, PR 1 병합 후 develop으로 바꾼다.

---

## 추가 작업 (2026-11-04 `/code-review` 후속, 사용자 승인: "그렇게 진행하자")

`/code-review`에서 웹에 원래 있던 버그를 발견했습니다. 반복 회차를 수정하면 `toRecurrenceRule(value, dueAt)`가 **그 회차의 dueAt**을 종료일로 삼습니다. 그래서 무기한 시리즈도 그 회차 날짜에서 끝나고, 이후 미래 회차가 모두 삭제됩니다. 웹 `todoDetail.tsx:318-319`와 `todoForm.tsx`의 수정 경로, 그리고 모바일 `TodoDetailScreen`이 모두 해당합니다.

사용자는 A안을 선택했습니다. **이미 반복 중인 할 일을 수정할 때는 종료 조건(`endType`/`endDate`)을 기존 `todo.recurrence`에서 그대로 유지합니다.** dueAt 칸은 그 회차의 마감으로만 씁니다. 비반복 할 일을 반복으로 전환할 때와 새로 만들 때는 지금처럼 dueAt에서 종료일을 유도합니다.

브랜치 구성:
- `fix/recurring-series-end-date`: PR 1(`feat/mobile-recurring-parity`) 위에 쌓고, core와 웹을 고칩니다.
- PR 2(`feat/mobile-recurring-parity-app`): 이 브랜치 위로 rebase합니다.

### Task 11: core 수정용 규칙 변환 + 웹 수정 경로 (브랜치 `fix/recurring-series-end-date`)

**Files:** `packages/core/src/recurring/recurrenceForm.ts`(+ `__tests__`, dist), `client/src/features/todo/components/recurrence/recurrenceFields.tsx`, `client/src/features/todo/components/todoDetail/todoDetail.tsx`, `client/src/features/todo/components/todoForm/todoForm.tsx`, 그리고 각 파일의 테스트

**Interfaces (Produces):**
- `toRecurrenceRuleForEdit(value: RecurrenceFormValue | null, existing: RecurrenceRule): RecurrenceRule | null`
  - `value`가 null이면 null을 반환합니다(반복 끄기).
  - 아니면 type/weekdays는 `value`에서 가져오고 `endType`/`endDate`는 `existing`에서 그대로 복사합니다. weekly일 때만 weekdays를 넣습니다.
- `getRecurrenceValidationError`는 그대로 둡니다. 수정 모드의 범위 검증(dueAt < startAt)은 건너뜁니다. 회차 날짜 검증은 기존 `getTodoDateValidationError`가 계속 담당합니다.
- 웹 `RecurrenceFields`에 optional prop `existingRule?: RecurrenceRule | null`을 추가합니다. 이 값이 있으면 범위 안내를 기존 규칙 기준으로 바꿉니다.
  - `untilDate`이면 `{endDate}까지 반복됩니다`
  - `indefinite`이면 `무기한으로 반복됩니다`
  - 이 경우 범위 에러는 표시하지 않습니다.
  - `existingRule`이 없을 때는 기존 문구와 동작을 그대로 유지합니다.

**규칙:** 웹 `todoDetail`과 `todoForm`의 수정 경로에서 `todo.recurrence != null`이면 `toRecurrenceRuleForEdit(recurrenceValue, todo.recurrence)`를 쓰고, 범위 검증을 건너뛰고, `existingRule={todo.recurrence}`를 넘깁니다. 그 외에는 기존 경로를 그대로 탑니다.

- [ ] core 테스트:
  - indefinite 유지
  - untilDate 유지
  - weekly→daily 변경 시 weekdays 제거
  - null이면 null
- [ ] 회귀 테스트(core seriesApi): 무기한 매일 시리즈에서 내일 회차(startAt=dueAt=내일)를 `toRecurrenceRuleForEdit`로 만든 규칙으로 `editRecurringSeries`하면, 내일 이후 호라이즌까지의 회차가 재생성되는지 확인합니다. 시스템 시간은 mock합니다.
- [ ] 웹 테스트:
  - todoDetail/todoForm 수정 경로에서 dueAt이 있는 반복 회차의 제목만 바꿔 저장하면 `editRecurringSeries` payload의 `recurrence.endType`이 기존 값(`indefinite`)인지 확인합니다. 픽스처는 실제와 같게 dueAt=회차일로 둡니다.
  - 비반복 → 반복 전환은 기존대로 dueAt에서 유도되는지 확인합니다.
- [ ] core build + dist 커밋. 웹 tsc, vitest(기본 TZ와 NY TZ, redirect on), lint, build를 확인합니다.
- [ ] 커밋: `fix(recurring): 반복 회차 수정 시 시리즈 종료 조건을 기존 규칙에서 유지`

### Task 12: 모바일 상세·작성 화면 보완 (PR 2, rebase 후)

- `TodoDetailScreen`: `todo.recurrence != null`이면 `toRecurrenceRuleForEdit`를 쓰고, 범위 검증을 건너뛰고, `RecurrenceSection`에 `existingRule`을 넘깁니다. `RecurrenceSection`에도 웹과 같은 `existingRule` prop을 추가합니다.
- 테스트 픽스처 `recurringRoot`의 dueAt을 회차일로 바꿉니다. "제목만 수정해도 `endType` indefinite 유지"를 검증합니다.
- 시리즈 삭제 중 저장 잠금: 삭제도 `saveInFlightRef`(또는 공용 in-flight ref)를 거칩니다. 시리즈 삭제의 pending을 저장 비활성 조건에 포함합니다. 삭제 확인을 두 번 눌러도 `deleteRecurringSeries`는 한 번만 불려야 합니다.
- `TodoFormScreen`: `useRef` in-flight 가드를 둡니다. 같은 tick에 두 번 눌러도 `createRecurringTodo`/`createTodo`는 한 번만 불려야 합니다. 반복 경로에서는 쓰이지 않는 `order` 계산을 제거합니다. `RecurringTodoInput`에서 `order`는 optional입니다.
- 하위 할 일 추가 버튼은 웹처럼 `todo.recurrence != null`일 때만 숨깁니다.
- 커밋은 기능 단위로 나눕니다.

### Task 13: 모바일 정리 작업 보완 (PR 2)

- uid가 null로 바뀌면(로그아웃) 이전 uid의 claim을 해제합니다. 같은 계정으로 다시 로그인하면 정리 작업이 다시 돌아야 합니다.
- 포그라운드 시도 사이에 최소 간격 `MAINTENANCE_RETRY_MIN_MS = 60 * 60 * 1000`을 둡니다. 마지막 **시도** 시각은 메모리(uid별)에 기록합니다. 실패가 이어져도 1시간에 한 번만 다시 돕니다.
- 테스트:
  - 로그아웃 후 같은 uid로 재로그인하면 실행됩니다.
  - 실패 직후 `active`가 와도 1시간 이내면 실행하지 않고, 1시간이 지나면 실행합니다.
  - 기존 테스트는 모두 통과해야 합니다.
