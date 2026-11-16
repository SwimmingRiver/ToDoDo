# AI 플랜 "목표 아님" 판단 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목표가 아닌 입력에 계획 대신 `NOT_A_GOAL` 안내를 보여 준다. 자모만 있는 입력은 규칙으로 거르고, 나머지는 모델이 판단한다.

**Architecture:** 자모만 있는 입력은 `isNotAGoal`에 규칙을 추가해 Claude 호출 전에 거른다. 그 밖의 입력은 `PlanSchema` 맨 앞에 `isGoal` 불리언을 추가하고 프롬프트에 판단 기준을 넣는다. 핸들러는 `isGoal === false`이면 시도는 이미 센 상태 그대로 두고, 성공은 세지 않은 채 400 `NOT_A_GOAL`을 돌려준다. 웹은 문구만 바꾼다.

**Tech Stack:** Cloudflare Workers, TypeScript, `@anthropic-ai/sdk` `messages.parse` + `zodOutputFormat`, zod, Vitest. 웹은 React와 Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-ai-plan-goal-judgment-design.md`

## Global Constraints

- 브랜치: `feat/ai-plan-goal-judgment`(origin/develop 기준). base는 `develop`.
- 응답 코드: 거절은 `400 { error: "NOT_A_GOAL" }` 하나다. 새 에러 코드는 없다.
- 횟수: 규칙 거절은 시도·성공 모두 안 센다. 모델 거절은 시도 +1, 성공은 안 센다.
- 클라이언트 응답의 `plan` 형태(`title/dueDate/items`)는 바꾸지 않는다. `isGoal`은 응답에 넣지 않는다.
- 자모 범위: U+3131–U+318E, U+1100–U+11FF.
- 프롬프트는 "애매하면 true"를 명시한다.
- ai-proxy 테스트: `cd ai-proxy && npx vitest run`, 타입체크 `npm run typecheck`.
- client 테스트(CI 등가): `cd client && VITE_FIREBASE_API_KEY= VITE_BILLING_ENABLED= npx vitest run`.
- 실제 Anthropic API 호출(Task 4)은 사용자 승인 후에만 한다.
- hooks를 우회하지 않는다(`--no-verify` 금지).

## Review Focus

1. **완성 글자가 섞인 자모**: "ㅋㅋ 토익 공부", "ㅎㅇ 운동"은 통과해야 한다(Task 1 테스트).
2. **`isGoal: false`인데 items가 차 있는 응답**: 계획이 새어 나가지 않고 `NOT_A_GOAL`이어야 한다(Task 2 테스트).
3. **`isGoal: true`인데 items가 비어 있는 응답**: 기존대로 502 `PLAN_INVALID`(Task 2 테스트).
4. **성공 응답에 `isGoal`이 새어 나가는 경우**: 응답 `plan`에 `isGoal` 키가 없어야 한다(Task 2 테스트).
5. **질문 형태와 막연한 상태 입력의 오판**: 단위 테스트로 잡을 수 없고 Task 4 실측이 맡는다.

---

### Task 1: 자모만 있는 입력 규칙 거절

**Files:**
- Modify: `ai-proxy/src/validateInput.ts` (`isNotAGoal`와 doc 주석)
- Test: `ai-proxy/src/__tests__/validateInput.test.ts:49-60`

**Interfaces:**
- Produces: `isNotAGoal(goal: string): boolean`. 시그니처는 그대로이고, 자모만 있으면 true를 돌려주는 동작이 추가된다.

- [ ] **Step 1: 테스트 수정과 추가.** 기존 통과 목록에서 `"ㅋㅋㅋ"`를 빼고 아래 두 묶음을 추가한다.

```ts
it.each(["ㅋㅋㅋ", "ㅎㅎ", "ㅠㅠ 123", "ㅋ", "ㅁㄴㅇㄹ!!", "가"])("자모만 있는 %j는 목표가 아니다", (goal) => {
  expect(isNotAGoal(goal)).toBe(true);
});
it.each(["ㅋㅋ 토익 공부", "ㅎㅇ 운동", "asdf", "토익 800"])("완성 글자나 다른 문자가 있는 %j는 통과한다", (goal) => {
  expect(isNotAGoal(goal)).toBe(false);
});
```

- [ ] **Step 2: 실행해서 실패 확인.** `cd ai-proxy && npx vitest run src/__tests__/validateInput.test.ts`
  Expected: "자모만 있는" 케이스들이 FAIL(false 반환).
- [ ] **Step 3: 구현.** `\p{L}` 문자들을 모아 하나도 없으면 true, 모두 자모 범위면 true를 돌려준다. "자모는 통과"라고 쓴 doc 주석은 새 규칙과 11-14 결정으로 고친다.
- [ ] **Step 4: 실행해서 통과 확인.** 같은 명령. Expected: PASS.
- [ ] **Step 5: 핸들러에 회귀 테스트 추가.** `plan.test.ts`의 "비용 가드" describe에 `goal: "ㅋㅋ"`인 요청 테스트를 넣는다. 400 `NOT_A_GOAL`이고, `generatePlan`, rate limit, KV `put`이 모두 호출되지 않아야 한다. 기존 "글자가 없는 goal" 테스트를 본뜬다. 실행해서 PASS를 확인한다.
- [ ] **Step 6: 커밋.** `fix(ai-proxy): 한글 자모만 있는 입력은 Claude 호출 전에 NOT_A_GOAL`

### Task 2: 모델 판단 (`isGoal`)

**Files:**
- Modify: `ai-proxy/src/planSchema.ts`, `ai-proxy/src/prompt.ts`, `ai-proxy/src/handlers/plan.ts`
- Test: `ai-proxy/src/__tests__/plan.test.ts`, `ai-proxy/src/__tests__/generatePlan.test.ts`(필요 시 픽스처만)

**Interfaces:**
- Produces: `PlanSchema` 최상위 첫 필드 `isGoal: z.boolean()`. `RawPlan`에 `isGoal: boolean`이 생긴다. `Plan`(클라이언트 응답)은 변경 없음.
- Consumes: Task 1의 `isNotAGoal`(변경 없음).

- [ ] **Step 1: 픽스처 갱신과 새 테스트.** `plan.test.ts`의 `rawPlan`에 `isGoal: true`를 추가한다. 응답 비교는 `isGoal`을 뺀 기대값(`expectedPlan`)으로 바꾼다. 아래 테스트를 "비용 가드" 근처에 추가한다.

```ts
it("모델이 목표 아님(isGoal:false)으로 판단하면 400 NOT_A_GOAL, 시도 +1, 성공 불변", async () => {
  vi.mocked(generatePlan).mockResolvedValueOnce({ isGoal: false, title: "", dueDate: null, items: [] });
  const store = new Map([[KEY, "1"]]);
  const res = await handlePlan(request(), makeEnv(store));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "NOT_A_GOAL" });
  expect(store.get(ATTEMPT_KEY)).toBe("1");
  expect(store.get(KEY)).toBe("1");
});
it("isGoal:false인데 items가 차 있어도 계획을 내보내지 않는다", async () => {
  vi.mocked(generatePlan).mockResolvedValueOnce({ ...rawPlan, isGoal: false });
  const res = await handlePlan(request(), makeEnv(new Map()));
  expect(await res.json()).toEqual({ error: "NOT_A_GOAL" });
});
it("성공 응답 plan에는 isGoal이 없다", async () => {
  const res = await handlePlan(request(), makeEnv(new Map()));
  const body = (await res.json()) as { plan: Record<string, unknown> };
  expect(body.plan).not.toHaveProperty("isGoal");
});
```

  `isGoal: true`이고 items가 비어 있으면 502 `PLAN_INVALID`인 기존 테스트(123행)는 픽스처에 `isGoal`이 생긴 뒤에도 통과해야 한다.
- [ ] **Step 2: 실행해서 실패 확인.** `cd ai-proxy && npx vitest run src/__tests__/plan.test.ts`
  Expected: 새 테스트 1·2가 FAIL(200과 plan 반환). 타입 에러가 나면 Step 3의 스키마 변경과 함께 해소한다.
- [ ] **Step 3: 스키마.** `PlanSchema`에 `isGoal: z.boolean()`을 **첫 필드**로 추가하고, 이유(판단 먼저)를 doc 주석에 한 줄 적는다.
- [ ] **Step 4: 핸들러.** `generatePlan` 성공 직후, `sanitizePlan` 전에 `if (!rawPlan.isGoal) return errorResponse("NOT_A_GOAL", 400);`를 넣는다. 상단 docstring의 순서 설명에 모델 거절 경로를 추가한다. `sanitizePlan`은 `Plan`의 필드만 골라내므로 `isGoal`은 응답에 들어가지 않는다(테스트 3이 고정).
- [ ] **Step 5: 프롬프트.** `SYSTEM_PROMPT`에 판단 규칙을 추가한다. 맨 마지막 규칙("나누기 어려운 내용이면 첫 단계만")은 isGoal true인 경우의 규칙으로 정리한다. 담을 내용:
  - `isGoal`: 넉넉하게 읽어도 할 일로 쪼갤 만한 목표나 상황이 있으면 true. 질문 형태의 목표("~하려면 어떻게 해?")와 막연한 상태("심심해", "무기력해")는 true.
  - 잡담, 정보·사실 질문, 의미 없는 문자열이면 false. 예: "날씨 어때", "너 누구야", "1+1은?", "asdf".
  - 애매하면 true.
  - false면 title은 빈 문자열, dueDate는 null, items는 빈 배열로 둔다.
- [ ] **Step 6: 실행해서 통과 확인.** `cd ai-proxy && npx vitest run && npm run typecheck`
  Expected: 전체 PASS, 타입 에러 없음.
- [ ] **Step 7: 커밋.** `feat(ai-proxy): 모델이 목표 아님을 판단하면 NOT_A_GOAL(성공 미차감)`

### Task 3: 웹 안내 문구

**Files:**
- Modify: `client/src/features/aiPlan/utils/aiPlanErrorMessage.ts`
- Test: `client/src/features/aiPlan/utils/__tests__/aiPlanErrorMessage.test.ts:27-30`

- [ ] **Step 1: 테스트 기대값 변경.** `NOT_A_GOAL` → `{ title: "이루고 싶은 목표를 적어 주세요", message: "예: 다음 달까지 토익 800점 받기" }`
- [ ] **Step 2: 실행해서 실패 확인.** `cd client && npx vitest run src/features/aiPlan/utils` → FAIL
- [ ] **Step 3: 문구 변경.**
- [ ] **Step 4: 실행해서 통과 확인.** 같은 명령으로 PASS를 본 뒤, client 전체를 CI 등가로 실행하고 `npx tsc -b`도 통과시킨다.
- [ ] **Step 5: 커밋.** `feat(aiPlan): 목표 아님 안내 문구를 넓은 의미로`

### Task 4: 오판 실측 (사용자 승인 필요)

**Files:**
- Create(커밋 안 함): 스크래치패드 디렉터리의 실측 스크립트

- [ ] **Step 1: 입력 목록 확정.**
  - 통과 15개: 스펙 예시(질문 형태 3개, 막연한 상태 2개, "운동", "독서") + 일반 목표 8개
  - 거절 10개: "날씨 어때", "너 누구야", "1+1은?", "asdf", "qwer", "오늘 점심 뭐 먹었게", "ㅋㅋ 웃기다" 등
- [ ] **Step 2: 사용자 승인.** 호출 수(25)와 예상 비용(수십 센트 이하)을 알리고 승인을 받는다. API 키는 사용자가 자기 터미널 환경에 둔다. 키를 출력하거나 기록하지 않는다.
- [ ] **Step 3: 실행.** 현재 `SYSTEM_PROMPT`와 `PlanSchema`, `buildUserMessage`로 `claude-haiku-4-5`를 호출하고, 입력별 `isGoal`을 표로 만든다.
- [ ] **Step 4: 판정.** 통과 목록 중 하나라도 false면 프롬프트를 고쳐 Task 2 Step 6을 다시 돌리고, Step 3을 다시 실행한다(재실행도 승인 범위 안에서). 거절 목록의 일부가 true인 것은 허용한다.
- [ ] **Step 5: 결과 표를 PR 본문에 넣을 수 있게 저장한다.**
