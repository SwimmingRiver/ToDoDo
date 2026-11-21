# 모바일 AI 할 일 플랜 이식 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 목록 탭에서 목표를 적으면 AI가 상위+하위 할 일을 제안하고, 미리보기에서 고친 뒤 한 번에 추가하는 웹 AI 플랜을 앱에 옮긴다.

**Architecture:** 화면이 아닌 로직(타입·오류 코드·응답 해석·오류 문구·미리보기 리듀서·일괄 저장)을 `packages/core`로 옮겨 웹과 앱이 같이 쓴다. 웹은 가져오는 위치만 바뀐다. 앱은 ID 토큰을 붙인 fetch로 기존 ai-proxy를 호출하고, `TodoListStack`에 전체 화면 `AiPlan` 라우트를 추가한다. 서버는 바꾸지 않는다.

**Tech Stack:** TypeScript, packages/core(tsc, vitest, dist 커밋), 웹 React+Vite+vitest, 앱 Expo/React Native+React Navigation native-stack+TanStack Query+jest(@testing-library/react-native).

**Spec:** `docs/superpowers/specs/2026-11-20-mobile-ai-plan-design.md`

## Global Constraints

- 서버(ai-proxy·worker-auth) 코드 변경 금지.
- 오류 문구·확인창 문구는 웹과 글자 하나까지 같다(core `aiPlanErrorMessage`, 아래 Task 5 문구).
- `packages/core/dist`는 커밋된다. core 소스를 바꾼 태스크는 `cd packages/core && npm run build` 후 dist도 같이 커밋한다(CI가 `git diff --exit-code -- dist`로 막음).
- core의 순수 모듈(`aiPlan/`)은 `firebase`를 import하지 않는다. Firestore를 쓰는 일괄 저장은 `api/planTodoApi.ts`에 둔다.
- 앱은 AI로 추가한 할 일에 로컬 알림(`scheduleReminder`)을 걸지 않는다(사용자 결정).
- 앱에 웹 결제로 유도하는 문구·링크를 넣지 않는다(Apple 3.1.1).
- 앱에는 Sentry가 없다. 예상 못 한 오류만 `console.warn`.
- 커밋은 hooks를 우회하지 않는다(`--no-verify` 금지).
- 웹 테스트 검증은 `cd client && VITE_FIREBASE_API_KEY= npx vitest run`(CI 등가). 날짜 키 변환 테스트는 `TZ=America/New_York`으로도 돌린다.

## Review Focus

1. **저장 성공 후 화면을 닫을 때 이탈 확인창이 뜨지 않아야 한다.** 미리보기를 고친 상태(dirty)에서 저장에 성공하면 `goBack`이 `beforeRemove`를 거친다. 확인창 없이 닫혀야 한다. 테스트는 Task 6.
2. **네트워크 끊김이나 `EXPO_PUBLIC_AI_PROXY_URL` 미설정 상태에서 「계획 만들기」를 누르면** 기본 문구("잠시 후 다시 시도해 주세요 / AI 응답을 받지 못했어요")가 나와야 한다. 화면은 목표 단계에 머물고 입력값도 유지된다. 테스트는 Task 3·5.
3. **목표 화면이 열린 상태에서 구독이 끝나면** 프리미엄 판정이 바뀌는 즉시 잠금 화면으로 바뀌어야 한다. 서버 403을 받은 뒤에는 판정이 프리미엄이어도 잠금이 유지된다. 테스트는 Task 5.
4. **생성이 진행 중일 때 Android 뒤로 키나 iOS 스와이프가 들어오면** 화면이 닫히지 않아야 한다. 응답이 오면 미리보기로 넘어간다. 테스트는 Task 6.
5. **AI가 과거 날짜(오늘 이전)를 돌려준 항목**도 미리보기에는 그대로 보인다. 날짜 선택기에서는 오늘 이전을 고를 수 없다. 저장은 막지 않는다(웹과 같음). 테스트는 Task 4.

---

## File Structure

**core**
- Create `packages/core/src/aiPlan/types.ts`: 요청·응답 타입, `AiPlanErrorCode`, `AiPlanError`, `isExpectedAiPlanError`, `parsePlanResponse`
- Create `packages/core/src/aiPlan/planDraft.ts`: 웹 `planDraft.ts` 이동(리듀서·헬퍼·타입)
- Create `packages/core/src/aiPlan/errorMessage.ts`: 웹 `aiPlanErrorMessage` 이동
- Create `packages/core/src/aiPlan/priorityLabels.ts`: `PRIORITY_LABELS` 이동
- Create `packages/core/src/aiPlan/index.ts`: 위 4개 re-export
- Create `packages/core/src/api/planTodoApi.ts`: `createPlanTodos(db, userId, submission)`, `PlanTodoInput`, `PlanSubmission`
- Modify `packages/core/src/index.ts`: `createPlanTodos`, `PlanSubmission`, `PlanTodoInput` export 추가
- Tests: `packages/core/src/aiPlan/__tests__/{types,planDraft,errorMessage}.test.ts`, `packages/core/src/api/__tests__/planTodoApi.test.ts`

**web** (동작 불변)
- Modify `client/src/features/aiPlan/api/aiProxyApi.ts`, `hooks/planDraft.ts`, `utils/aiPlanErrorMessage.ts`, `components/priorityLabels.ts`: core re-export로 축소
- Modify `client/src/features/todo/api/todoApi.ts`: `createPlanTodos`·`getNextRootOrder`(plan 전용 사용분)·타입을 core 위임으로 교체
- Delete (core로 이동한 테스트): `client/src/features/aiPlan/hooks/__tests__/planDraft.test.ts`, `utils/__tests__/aiPlanErrorMessage.test.ts`, `client/src/features/todo/api/__tests__/planTodoApi.test.ts`

**mobile**
- Create `mobile/src/aiPlan/aiProxyApi.ts`, `useGeneratePlan.ts`, `useCreatePlanTodos.ts`, `usePlanDraft.ts`, `index.ts`
- Create `mobile/src/aiPlan/components/{PlanGoalStep,PlanPreviewStep,PlanItemRow,PlanLockedNotice}.tsx`
- Create `mobile/src/screens/AiPlanScreen.tsx`
- Modify `mobile/src/shared/ui/dateField/DateField.tsx`: `minimumDate?: string` prop
- Modify `mobile/src/navigation/types.ts`, `RootNavigator.tsx`, `mobile/src/screens/TodoListScreen.tsx`
- Modify `mobile/.env`: `EXPO_PUBLIC_AI_PROXY_URL` (로컬 전용, git 미추적 확인 후)
- Tests: `mobile/src/aiPlan/__tests__/*`, `mobile/src/screens/__tests__/AiPlanScreen.test.tsx`, 기존 `TodoListScreen.test.tsx`·`DateField` 관련 테스트

---

### Task 1: core `aiPlan` 순수 모듈

**Files:**
- Create: `packages/core/src/aiPlan/{types,planDraft,errorMessage,priorityLabels,index}.ts`
- Test: `packages/core/src/aiPlan/__tests__/{types,planDraft,errorMessage}.test.ts`
- Build: `packages/core/dist/aiPlan/**`

**Interfaces:**
- Produces (모두 `@tododo/core/dist/aiPlan/index.js`에서):
  - 타입 `PlanPriority`, `GeneratedPlanItem`, `GeneratedPlan`, `PlanUsage`, `GeneratePlanInput`, `GeneratePlanResult`, `AiPlanErrorCode`. 웹 `aiProxyApi.ts`와 같은 정의다.
  - `class AiPlanError extends Error { code; status }`. 생성자는 `(code, status)`, 메시지는 `AI 플랜 요청 실패: ${code} (${status})`, `name`은 `"AiPlanError"`.
  - `isExpectedAiPlanError(error: unknown): boolean`
  - `parsePlanResponse(res: Response): Promise<GeneratePlanResult>`
    - `res.ok`이면 JSON을 그대로 돌려준다.
    - 아니면 본문 `error`가 알려진 코드인지 보고, 알려진 코드면 그 코드로, 아니면 `"UNKNOWN"`으로 `AiPlanError(code, res.status)`를 던진다.
    - 본문이 JSON이 아니어도 `UNKNOWN`으로 던진다.
  - `DraftFields`, `DraftItem`, `PlanDraft`, `PlanDraftAction`, `EMPTY_DRAFT`, `planDraftReducer`, `checkedCount`, `canSubmit`, `toSubmission(draft): PlanSubmission`. 웹 `planDraft.ts`와 같다.
    - `PlanSubmission` 타입이 아직 core에 없으므로 이 태스크에서 `aiPlan/types.ts`에 정의한다.
    - `PlanTodoInput = { title: string; dueDate: string | null; priority: PlanPriority }`, `PlanSubmission = { parent: PlanTodoInput; children: PlanTodoInput[] }`
    - Task 2가 이 두 타입을 `aiPlan/types`에서 import한다.
  - `aiPlanErrorMessage(error: unknown): { title: string; message: string }`. 웹과 문구가 같다.
  - `PRIORITY_LABELS = { high: "높음", medium: "보통", low: "낮음" } as const`

- [ ] **Step 1: 테스트 옮기기 + 추가.**
  - `client/src/features/aiPlan/hooks/__tests__/planDraft.test.ts`는 `packages/core/src/aiPlan/__tests__/planDraft.test.ts`로, `utils/__tests__/aiPlanErrorMessage.test.ts`는 `errorMessage.test.ts`로 복사하고 import 경로만 core 상대경로로 바꾼다.
  - 웹 `aiProxyApi.test.ts`의 오류 코드 매핑 `it.each` 케이스들은 `types.test.ts`로 옮겨 `parsePlanResponse(jsonRes(body, status))` 형태로 다시 쓴다.
  - 추가 케이스:

```ts
it("본문이 JSON이 아니면 UNKNOWN", async () => {
  await expect(parsePlanResponse(new Response("oops", { status: 500 })))
    .rejects.toMatchObject({ name: "AiPlanError", code: "UNKNOWN", status: 500 });
});
it("알 수 없는 error 코드는 UNKNOWN", async () => {
  await expect(parsePlanResponse(jsonRes({ error: "WHAT" }, 400))).rejects.toMatchObject({ code: "UNKNOWN" });
});
```

- [ ] **Step 2:** `cd packages/core && npx vitest run src/aiPlan`. Expected: 모듈이 없어 FAIL.
- [ ] **Step 3:** 웹 소스에서 그대로 옮겨 구현한다.
  - `types.ts`의 `KNOWN_CODES`·`EXPECTED_CODES`는 웹 값을 그대로 쓴다.
  - `index.ts`는 `export * from "./types"` 등 4줄이다.
  - **`packages/core/src/index.ts`(루트)에는 aiPlan을 추가하지 않는다.** 하위 경로 전용이다.
- [ ] **Step 4:** `cd packages/core && npx vitest run && npm run build`. Expected: 전부 PASS, `dist/aiPlan/index.js` 생성.
- [ ] **Step 5: Commit** `feat(core): AI 플랜 순수 로직(타입·응답 해석·초안·문구)을 core로 이동` (src + dist).

### Task 2: core `createPlanTodos(db, userId, submission)`

**Files:**
- Create: `packages/core/src/api/planTodoApi.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/api/__tests__/planTodoApi.test.ts`

**Interfaces:**
- Consumes: `PlanSubmission`, `PlanTodoInput` (`../aiPlan/types`), `parseDateKey` (`../insights/date`)
- Produces: `createPlanTodos(db: Firestore, userId: string, submission: PlanSubmission): Promise<{ parentId: string; count: number }>`. 루트 `@tododo/core`와 `@tododo/core/dist/api/planTodoApi.js`에서 export한다. `PlanSubmission`·`PlanTodoInput`은 `planTodoApi.ts`와 루트 양쪽에서 re-export한다(웹이 `planTodoApi.js` 경로로 타입도 가져간다).

- [ ] **Step 1:** 웹 `client/src/features/todo/api/__tests__/planTodoApi.test.ts`를 core로 옮긴다.
  - `@/shared/lib/*` mock을 지우고, `createPlanTodos(fakeDb, "test-user-id", submission)`으로 부른다.
  - 기대값(필드 구성, 부모 order = 기존 루트 최대+1, 자식 order = index, 0개면 throw, 한 번의 batch.commit)은 그대로 둔다.
  - 날짜 키를 ISO로 바꾸는 assert가 로컬 자정 기준인지 확인한다. 기존 테스트가 `new Date(2026, …).toISOString()` 형태면 그대로 둔다.
- [ ] **Step 2:** `npx vitest run src/api/__tests__/planTodoApi.test.ts`. Expected: FAIL(모듈 없음).
- [ ] **Step 3:** 웹 `todoApi.ts:355-431`의 `getNextRootOrder`와 `createPlanTodos`를 옮긴다.
  - `collection(db, "todos")`와 주입받은 `db`·`userId`를 쓴다.
  - 날짜 변환은 파일 안에 `const dateKeyToISO = (key: string | null) => key ? parseDateKey(key).toISOString() : null`로 둔다.
  - 함수 주석(writeBatch를 쓰는 이유 등)도 옮긴다.
- [ ] **Step 4:** 아래 세 명령을 돌린다. Expected: 둘 다 PASS, dist 갱신.
  - `npx vitest run`
  - `TZ=America/New_York npx vitest run src/api`
  - `npm run build`
- [ ] **Step 5: Commit** `feat(core): AI 플랜 일괄 저장 createPlanTodos를 core로 이동`.

### Task 3: 웹을 core로 전환 (동작 불변)

**Files:**
- Modify: `client/src/features/aiPlan/api/aiProxyApi.ts`, `hooks/planDraft.ts`, `utils/aiPlanErrorMessage.ts`, `components/priorityLabels.ts`, `client/src/features/todo/api/todoApi.ts`
- Delete: Task 1·2로 옮긴 웹 테스트 3개

**Interfaces:**
- Consumes: Task 1·2 Produces
- Produces: 웹 모듈의 공개 이름과 시그니처는 바뀌지 않는다. `requestPlan(input)`, `createPlanTodos(submission)`도 그대로다.

- [ ] **Step 1:** 파일별로 core를 쓰게 바꾼다.
  - `aiProxyApi.ts`: 타입·`AiPlanError`·`isExpectedAiPlanError`를 `@tododo/core/dist/aiPlan/index.js`에서 re-export한다. `requestPlan`은 `authorizedFetch(...)` 결과를 `parsePlanResponse(res)`에 넘긴다.
  - `planDraft.ts`, `aiPlanErrorMessage.ts`, `priorityLabels.ts`: core re-export 한 줄로 줄인다.
  - `todoApi.ts`: `createPlanTodos = (submission) => coreCreatePlanTodos(db, getUserId(), submission)`로 바꾼다.
    - 가져오는 위치는 `@tododo/core/dist/api/planTodoApi.js`다. 웹 번들에 루트를 끌어오지 않기 위해서다.
    - `PlanTodoInput`·`PlanSubmission`도 같은 곳에서 re-export한다.
    - plan 전용이던 `getNextRootOrder`가 다른 곳에서 안 쓰이면 지운다(grep으로 확인).
  - 남겨 두는 웹 테스트 `aiProxyApi.test.ts`는 `authorizedFetch` 호출 인자를 검사하는 첫 케이스만 남긴다. 코드 매핑 케이스는 core로 갔으므로 지운다.
- [ ] **Step 2:** 아래 두 명령을 돌린다. Expected: aiPlan·todo·entitlement 포함 전부 PASS, 타입 오류 0. `aiPlanModal.test.tsx`·`useCreatePlanTodos.test.tsx`·`useGeneratePlan.test.tsx`는 수정 없이 통과해야 한다. 고쳐야 통과한다면 동작이 바뀐 것이므로 멈추고 원인을 찾는다.
  - `cd client && VITE_FIREBASE_API_KEY= npx vitest run`
  - `npx tsc -b`
- [ ] **Step 3:** `cd client && npm run lint && npm run build`. Expected: 성공.
- [ ] **Step 4: Commit** `refactor(client): AI 플랜 로직을 core에서 가져오도록 전환`.

### Task 4: 앱 요청·저장 훅 + DateField 최소 날짜

**Files:**
- Create: `mobile/src/aiPlan/{aiProxyApi,useGeneratePlan,useCreatePlanTodos,usePlanDraft,index}.ts`
- Modify: `mobile/src/shared/ui/dateField/DateField.tsx`, `mobile/.env`
- Test: `mobile/src/aiPlan/__tests__/{aiProxyApi,useCreatePlanTodos}.test.ts(x)`, DateField 테스트(기존 파일이 있으면 거기, 없으면 `mobile/src/shared/ui/dateField/__tests__/DateField.test.tsx`)

**Interfaces:**
- Consumes: `parsePlanResponse`, `AiPlanError`, `isExpectedAiPlanError`, `planDraftReducer`, `EMPTY_DRAFT`, 타입(`@tododo/core/dist/aiPlan/index.js`), `createPlanTodos`(`@tododo/core`), `auth`·`db`(`../firebase`), `useAuthState`
- Produces:
  - `requestPlan(input: GeneratePlanInput): Promise<GeneratePlanResult>`
  - `useGeneratePlan()`: `useMutation<GeneratePlanResult, Error, GeneratePlanInput>`
  - `useCreatePlanTodos()`: `useMutation<{ parentId: string; count: number }, Error, PlanSubmission>`
  - `usePlanDraft(): { draft: PlanDraft; dispatch: Dispatch<PlanDraftAction> }`
  - `DateField`에 `minimumDate?: string`("YYYY-MM-DD") 추가

- [ ] **Step 1: 실패 테스트.**
  - `aiProxyApi.test.ts`
    - `process.env.EXPO_PUBLIC_AI_PROXY_URL = "https://ai.example.com"`로 두고 `global.fetch`와 `auth.currentUser.getIdToken`을 mock한다.
    - `fetch`가 `("https://ai.example.com/plan", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer tok" }, body: JSON.stringify(input) })`로 호출되는지 본다.
    - URL이 빈 문자열이면 `AiPlanError` 코드 `UNKNOWN`으로 거절된다.
    - `fetch`가 throw해도(네트워크) `AiPlanError` 코드 `UNKNOWN`으로 거절된다. 그래야 화면이 core 기본 문구를 보여준다.
    - 403 `{error:"PREMIUM_REQUIRED"}`이면 코드 `PREMIUM_REQUIRED`다.
  - `useCreatePlanTodos.test.tsx`
    - 성공하면 `createPlanTodos(db, "uid-1", submission)`이 호출되고 `["todos", "uid-1"]`이 무효화된다.
    - **`scheduleReminder`는 호출되지 않는다**(`jest.mock("../../notifications/scheduleReminder")`로 확인).
  - DateField: `minimumDate="2026-11-20"`을 주고 열면, 피커에 넘어가는 옵션의 `minimumDate`가 `new Date(2026, 10, 20)`이다. 기존 피커 호출부를 mock하는 방식을 따른다.
- [ ] **Step 2:** `cd mobile && npx jest src/aiPlan src/shared/ui/dateField`. Expected: FAIL.
- [ ] **Step 3:** 구현한다.
  - `aiProxyApi.ts`는 `verifyApi.ts` 패턴을 따른다. URL은 함수 안에서 `process.env.EXPO_PUBLIC_AI_PROXY_URL ?? ""`로 읽는다.
    - URL 미설정, 미로그인, fetch 예외는 모두 `new AiPlanError("UNKNOWN", 0)`으로 바꾼다. `console.warn`에는 원인을 남긴다.
    - 응답은 `parsePlanResponse`로 해석한다.
  - `useGeneratePlan`의 `onError`는 `!isExpectedAiPlanError(e)`일 때만 `console.warn("[aiPlan]", e)`를 남긴다. `useCreatePlanTodos`의 `onError`는 항상 warn한다.
  - DateField는 `minimumDate`를 `fromKey`로 바꿔 피커 옵션에 넘긴다. iOS와 Android 경로 둘 다 넘긴다.
  - `mobile/.env`에 운영 ai-proxy URL을 넣는다. 값은 웹 `client/.env`의 `VITE_AI_PROXY_URL`과 같다. 먼저 `git check-ignore -v mobile/.env`로 git에 안 올라가는지 확인한다.
- [ ] **Step 4:** `npx jest src/aiPlan src/shared/ui/dateField && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): AI 플랜 요청·일괄 저장 훅과 DateField 최소 날짜`. `.env`는 커밋하지 않는다.

### Task 5: 앱 `AiPlanScreen` 3단계 화면

**Files:**
- Create: `mobile/src/screens/AiPlanScreen.tsx`, `mobile/src/aiPlan/components/{PlanLockedNotice,PlanGoalStep,PlanPreviewStep,PlanItemRow}.tsx`
- Test: `mobile/src/screens/__tests__/AiPlanScreen.test.tsx`

**Interfaces:**
- Consumes: Task 4 Produces, `useIsPremium()`(`../premium`), `aiPlanErrorMessage`, `checkedCount`, `canSubmit`, `toSubmission`, `PRIORITY_LABELS`, `toDateKey`(`../shared/utils/dateRange`), 기존 `Button`·`DateField`·`PriorityChips`·`Checkbox`
- Produces: `AiPlanScreen`(props 없음, `useNavigation()` 사용). Task 6이 이탈 가드를 이 파일에 더한다. 그래서 화면 상태 `step`, `generate.isPending`, `draft.dirty`, 저장 성공 플래그는 이 컴포넌트 안에 둔다.

화면 상태와 문구 (웹 `aiPlanModal.tsx`와 같다):
- **로딩:** 프리미엄 판정 로딩 중에는 아무것도 그리지 않는다(`null`).
- **잠금** (`!isPremium || serverLocked`)
  - 제목: "AI 할 일 플랜은 프리미엄 기능입니다"
  - 설명: "목표를 적으면 AI가 실행 단계와 날짜를 나눠 제안해요. 프리미엄 구독이 필요합니다"
  - 버튼: "구독 알아보기" → `navigation.navigate("Account")`
- **목표**
  - 제목 "AI로 계획 만들기"
  - 목표 TextInput: `maxLength={200}`, placeholder "예: 다음 달 이사 준비", 라벨 "목표"
  - `DateField`: 라벨 "마감일(선택)", `minimumDate={today}`
  - 안내: "입력한 목표는 계획 생성을 위해 AI(Anthropic)로 전송돼요"
  - 버튼: 평소 "계획 만들기", 생성 중 "계획을 짜는 중…". 비활성 조건: 생성 중이거나 `goal.trim()`이 빈 값.
  - 생성 중에는 입력을 비활성으로 둔다.
  - 요청 값은 `{ goal: goal.trim(), dueDate: dueDate || null, today }`.
- **미리보기**
  - 제목 "AI가 만든 계획" 옆에 `오늘 ${used}/${limit}회`
  - 상위 행: 제목 TextInput(`maxLength=100`) + DateField(min today) + PriorityChips
  - 항목 행: Checkbox(접근성 라벨 `${label} 포함`) + 제목 + DateField + PriorityChips + 삭제 IconButton(`${label} 삭제`). `label`은 `title.trim() || "새 항목"`.
  - "+ 항목 직접 추가"
  - 「다시 만들기」(생성 중 "계획을 짜는 중…")와 `${count}개 추가` 버튼. 추가 버튼은 `!canSubmit(draft) || 저장 중 || 생성 중`이면 비활성.
- **오류:** PREMIUM_REQUIRED면 `serverLocked=true`. 그 밖의 오류는 `Alert.alert(title, message)`로 core 문구를 보여준다. 단계와 입력값은 유지한다.
- **다시 만들기:** dirty면 `Alert.alert("수정한 내용이 사라져요", "다시 만들면 편집한 계획이 새 결과로 바뀌고 사용 횟수가 1회 차감돼요.", [{text:"계속 편집", style:"cancel"}, {text:"다시 만들기", onPress: …}])`. dirty가 아니면 바로 다시 만든다.
- **추가 성공:** `Alert.alert("계획 추가 완료", \`할 일 ${n}개를 추가했어요\`)` 후 `navigation.goBack()`.
- **추가 실패:** `Alert.alert("추가하지 못했어요", "잠시 후 다시 시도해 주세요")`, 화면에 머문다.
- **더블탭:** 생성과 저장 모두 `useRef` 진행 중 플래그로 막는다(TodoFormScreen `submitInFlightRef`와 같은 이유).
- **레이아웃:** `KeyboardAvoidingView` + `ScrollView keyboardShouldPersistTaps="handled"`(TodoFormScreen과 같다). 색은 `theme/colors` 토큰만 쓴다.

- [ ] **Step 1: 실패 테스트** `AiPlanScreen.test.tsx`. `../premium`, `../aiPlan` 훅, `@react-navigation/native`, `Alert.alert`를 mock한다.
  - `무료면 잠금 안내가 보이고 「구독 알아보기」가 Account로 이동`
  - `프리미엄이면 목표 단계, 빈 목표면 「계획 만들기」 비활성`
  - `계획 만들기 → mutate({ goal: "이사 준비", dueDate: null, today: "2026-11-20" })`: 시스템 시간을 2026-11-20으로 mock한다. 절대 날짜를 하드코딩하지 않는다.
  - `생성 성공 → 미리보기에 상위 제목·항목·"오늘 3/20회"가 보이고 「2개 추가」`
  - `생성 실패 DAILY_LIMIT → Alert("오늘 사용 횟수를 다 썼어요", "내일 다시 시도해 주세요"), 목표 입력 유지`
  - `생성 실패 PREMIUM_REQUIRED → 잠금 안내로 전환, 이후 isPremium=true로 다시 렌더해도 잠금 유지`
  - `프리미엄이던 사용자가 isPremium=false로 바뀌면 잠금`
  - `「계획 만들기」 같은 틱 2회 탭 → mutate 1회`
  - `「2개 추가」 2회 탭 → createPlan.mutate 1회`, `성공 → Alert("계획 추가 완료", "할 일 2개를 추가했어요") + goBack`
  - `항목 체크 전부 해제 → 추가 버튼 비활성`
  - `dirty에서 다시 만들기 → 확인 Alert, 「다시 만들기」 선택 시 직전 입력으로 mutate`
  - `AI가 과거 날짜 항목을 줘도 미리보기에 그대로 표시` (Review Focus 5)
- [ ] **Step 2:** `cd mobile && npx jest src/screens/__tests__/AiPlanScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** 구현한다. 단계 컴포넌트 구조는 웹 `planGoalStep`·`planPreviewStep`·`planItemRow`를 따른다. 미리보기 항목 행은 한 줄에 다 넣지 않는다. 체크·제목·삭제를 윗줄에, 날짜·우선순위를 아랫줄에 두는 식으로 폰 폭에 맞춘다.
- [ ] **Step 4:** `npx jest src/screens/__tests__/AiPlanScreen.test.tsx && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): AI 플랜 화면(잠금·목표·미리보기)`.

### Task 6: 라우트·진입 버튼·이탈 가드

**Files:**
- Modify: `mobile/src/navigation/types.ts`, `RootNavigator.tsx`, `mobile/src/screens/TodoListScreen.tsx`, `mobile/src/screens/AiPlanScreen.tsx`
- Test: `mobile/src/screens/__tests__/AiPlanScreen.test.tsx`, `TodoListScreen.test.tsx`, `mobile/src/navigation/__tests__/RootNavigator.test.tsx`

**Interfaces:**
- Consumes: Task 5 `AiPlanScreen`
- Produces: `TodoListStackParamList.AiPlan: undefined`. 다른 스택에는 추가하지 않는다.

- [ ] **Step 1: 실패 테스트.**
  - TodoListScreen
    - 「AI로 계획」 버튼(접근성 라벨 "AI로 계획")이 「할 일 추가」 옆에 보인다. 누르면 `navigate("AiPlan")`.
    - 빈 상태(할 일 0개)에는 진입 버튼을 넣지 않는다. 먼저 웹 `todoList.tsx`가 빈 상태에서 AI 버튼을 숨기는지 확인한다. 웹이 보여주면 앱도 보여준다.
  - AiPlanScreen 가드(`navigation.addListener`를 mock해 `beforeRemove` 핸들러를 잡는다)
    - `생성 중 beforeRemove → e.preventDefault() 호출, Alert 없음`
    - `미리보기 dirty에서 beforeRemove → preventDefault + Alert("수정한 내용이 사라져요", "편집한 계획을 저장하지 않고 닫을까요?", [계속 편집, 닫기])`, 「닫기」면 `navigation.dispatch(e.data.action)`
    - `dirty가 아니면 preventDefault 안 함`
    - **`dirty에서 저장 성공 → goBack 시 beforeRemove가 preventDefault 하지 않음`** (Review Focus 1)
    - `생성 중에는 navigation.setOptions({ gestureEnabled: false, headerBackVisible: false })`, 끝나면 되돌림
  - RootNavigator: 목록 스택에 `AiPlan` 화면이 있고 제목은 "AI로 계획"이다. 기존 테스트 방식을 따른다.
- [ ] **Step 2:** `npx jest src/screens src/navigation`. Expected: FAIL.
- [ ] **Step 3:** 구현한다.
  - 가드는 `useEffect`에서 `navigation.addListener("beforeRemove", …)`로 건다.
  - 저장 성공 플래그는 `useRef`로 두고 `goBack()` 직전에 세운다. state로 두면 같은 틱의 goBack에 반영되지 않는다.
  - Android 하드웨어 뒤로 키도 `beforeRemove`를 거치므로 따로 처리하지 않는다.
  - 진입 버튼은 「할 일 추가」 버튼과 같은 줄에 outline 계열로 둔다. 아이콘은 lucide `Sparkles`.
- [ ] **Step 4:** 아래 명령을 돌린다. Expected: 전부 PASS.
  - `cd mobile && npx jest && npm run typecheck`
  - `cd ../packages/core && npx vitest run`
  - `cd ../../client && VITE_FIREBASE_API_KEY= npx vitest run`
- [ ] **Step 5: Commit** `feat(mobile): 목록 탭에서 AI 플랜 진입 + 생성 중·편집 중 이탈 방지`.

### Task 7: 수동 확인 (시뮬레이터)

코드 변경은 없다. 실기 확인에서 결함이 나오면 해당 태스크로 돌아간다.

- [ ] **Step 1:** 시뮬레이터 빌드를 띄운다.
  - Metro는 새 포트로 띄운다(오래 떠 있던 Metro가 옛 코드를 서빙하는 함정이 있었다).
  - worktree라면 firebase 중복 함정(blockList)부터 확인한다.
- [ ] **Step 2:** 무료 계정과 프리미엄 계정으로 각각 확인한다.
  - 무료 계정: 「AI로 계획」 → 잠금 안내 → 「구독 알아보기」 → 계정 화면.
  - 프리미엄 계정(운영 grant 또는 체험)
    - 목표 입력 → 생성(운영 ai-proxy) → 미리보기 편집 → 추가 → 목록에 상위+하위가 보인다.
    - 웹에서도 같은 데이터로 보인다.
  - 생성 중 스와이프로 뒤로 가도 닫히지 않는다.
  - 편집 후 뒤로 가면 확인창이 나온다.
  - 다크 모드에서도 확인한다.
- [ ] **Step 3:** 결과를 사용자에게 보고한다. 앱 배포용 EAS env에 `EXPO_PUBLIC_AI_PROXY_URL`을 등록해야 한다는 것도 출시 준비 목록에 추가하자고 알린다.
