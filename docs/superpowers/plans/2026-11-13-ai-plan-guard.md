# AI 플랜 비용 가드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ai-proxy `/plan`에 세 가지 가드를 넣고, 웹이 새 오류 코드마다 안내 문구를 보여 주게 한다. 가드는 글자가 없는 입력 거절, uid당 10초 3회 연타 제한, 하루 40회 시도 상한이다. 이렇게 해서 결제를 열기 전에 계정당 AI 비용에 끝을 만든다.

**Architecture:** 규칙 필터와 시도 카운터는 순수 함수로 만든다. 규칙 필터는 `validateInput.ts`, 시도 카운터는 `usage.ts`에 둔다. `handlers/plan.ts`는 이것들을 정해진 순서로 호출한다. 연타 제한은 Cloudflare Workers Rate Limiting 바인딩(`[[ratelimits]]`)이고, 바인딩이 없거나 예외를 던지면 통과시킨다(fail-open). 웹은 에러 코드 목록과 문구만 늘린다.

**Tech Stack:** Cloudflare Workers(wrangler 4.100.0, `@cloudflare/workers-types`의 `RateLimit`), Workers KV, Vitest, React(client).

**Spec:** `docs/superpowers/specs/2026-11-13-ai-plan-guard-design.md`

## Global Constraints

- 처리 순서: 인증(401) → 프리미엄(403) → 입력 검증(400 INVALID_INPUT) → 규칙 필터(400 NOT_A_GOAL) → 연타 제한(429 TOO_FREQUENT) → 성공 20회 한도(429 DAILY_LIMIT) → 시도 상한(429 ATTEMPT_LIMIT) → 시도 +1 → Claude 호출 → 사후 검증 → 성공 +1
- 규칙 필터: trim한 goal에 `\p{L}`이 하나도 없으면 거절한다. 한글 자모는 통과한다. 어떤 카운트도 올리지 않는다.
- 연타 제한: uid당 10초에 3회, `[[ratelimits]]` `limit = 3`, `period = 10`, key = uid.
- 시도 상한: 서울 날짜 기준 하루 40회(`DAILY_ATTEMPT_LIMIT`, 기본값 40). KV 키 `attempts:{uid}:{YYYY-MM-DD}`, TTL은 `USAGE_TTL_SECONDS`. Claude 호출 직전에 +1 하므로 502·503도 센다.
- 응답 본문의 `usage: { used, limit }`는 지금처럼 **성공** 횟수다. 시도 횟수는 노출하지 않는다.
- 새 코드 `NOT_A_GOAL`, `TOO_FREQUENT`, `ATTEMPT_LIMIT`는 웹에서 예상된 실패로 처리해 Sentry로 보내지 않는다.
- `server/`와 `docker-compose.yml`은 건드리지 않는다. 모바일 변경은 없다.
- 커밋할 때 hooks를 우회하지 않는다(`--no-verify` 금지).

## Review Focus

- **전각 숫자·이모지 결합 시퀀스·앞뒤 공백**(예: `" １２３ "`, `"👨‍👩‍👧"`): 글자가 없으므로 NOT_A_GOAL이어야 한다. 반대로 한자나 일본어(`"勉強"`)는 통과해야 한다. → Task 1 테스트
- **`DAILY_ATTEMPT_LIMIT`가 `"abc"`·`"0"`·없음**: 모든 요청을 막지 말고 기본값 40을 써야 한다. → Task 2 테스트
- **Rate Limiting 바인딩이 없거나 `limit()`이 reject할 때**: 요청이 정상 처리돼야 한다. 설정 누락으로 모두 막히면 안 된다. → Task 2 테스트
- **DAILY_LIMIT(성공 20회)에 이미 걸린 요청**: 시도 카운트를 올리지 말아야 한다. 그렇지 않으면 다음 날까지 쓸모없이 소진된다. → Task 2 테스트
- **서울 자정 경계**(UTC 15:00 직후): 시도 카운터가 새 날짜 키로 바뀌어야 한다. → Task 1 테스트

---

### Task 1: 규칙 필터와 시도 카운터 (ai-proxy 순수 함수)

**Files:**
- Modify: `ai-proxy/src/validateInput.ts`
- Modify: `ai-proxy/src/usage.ts`
- Test: `ai-proxy/src/__tests__/validateInput.test.ts`, `ai-proxy/src/__tests__/usage.test.ts`

**Interfaces:**
- Produces: `isNotAGoal(goal: string): boolean` (`validateInput.ts`). 이미 trim·검증된 goal을 받는다. trim을 다시 해도 된다.
- Produces: `getAttempts(kv: KVNamespace, uid: string, now: Date): Promise<number>`, `incrementAttempts(kv: KVNamespace, uid: string, now: Date): Promise<number>` (`usage.ts`). 기존 `getUsage`/`incrementUsage`와 같은 의미이고, 키만 `attempts:{uid}:{seoulDateKey(now)}`다. 중복은 내부 헬퍼로 묶어도 된다. 단 `getUsage`/`incrementUsage`의 시그니처와 동작은 유지한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`validateInput.test.ts`에 `describe("isNotAGoal")`을 추가한다.
- `true`가 나와야 하는 입력: `"123"`, `"🎉🎉"`, `"!!!"`, `"???  ..."`, `" １２３ "`, `"👨‍👩‍👧"`, `"12/25 🎄"`
- `false`가 나와야 하는 입력: `"ㅋㅋㅋ"`, `"토익 800"`, `"운동 🏃"`, `"勉強"`, `"a"`

`usage.test.ts`에는 기존 테스트의 KV 가짜 객체 패턴을 따라 다음을 추가한다.
- `incrementAttempts`를 두 번 부르면 2를 돌려주고 `put`이 키 `"attempts:user-1:2026-09-25"`와 `{ expirationTtl: USAGE_TTL_SECONDS }`로 불린다.
- `getAttempts`는 값이 없거나 숫자가 아니면 0이다.
- `incrementAttempts`는 `usage:` 키를 건드리지 않는다(같은 store에서 `usage:user-1:2026-09-25`가 그대로 남음).
- `now = 2026-09-25T15:00:00Z`(서울 26일 00:00)면 키가 `attempts:user-1:2026-09-26`이다.

- [ ] **Step 2: 실패 확인**

Run: `cd ai-proxy && npx vitest run src/__tests__/validateInput.test.ts src/__tests__/usage.test.ts`
Expected: FAIL (`isNotAGoal`/`getAttempts`/`incrementAttempts` is not exported)

- [ ] **Step 3: 구현**

`isNotAGoal`은 `!/\p{L}/u.test(goal.trim())`이다. 카운터는 `usage.ts`에서 키 생성만 다르게 해서 기존 읽기·쓰기 로직을 재사용한다. 기존 비원자성 주석은 두 카운터 모두에 해당한다고 한 줄 덧붙인다.

- [ ] **Step 4: 통과 확인**

Run: `cd ai-proxy && npx vitest run && npm run typecheck`
Expected: 전부 PASS, 타입 오류 없음

- [ ] **Step 5: Commit**

```bash
git add ai-proxy/src/validateInput.ts ai-proxy/src/usage.ts ai-proxy/src/__tests__/validateInput.test.ts ai-proxy/src/__tests__/usage.test.ts
git commit -m "feat(ai-proxy): 글자 없는 입력 판별과 하루 시도 카운터"
```

---

### Task 2: 핸들러에 가드 연결 + 바인딩·설정

**Files:**
- Modify: `ai-proxy/src/handlers/plan.ts` (상단 주석 포함)
- Modify: `ai-proxy/src/http.ts` (`ErrorCode`)
- Modify: `ai-proxy/src/env.ts`
- Modify: `ai-proxy/wrangler.toml`
- Modify: `ai-proxy/README.md` (환경변수 목록 19행 부근)
- Test: `ai-proxy/src/__tests__/plan.test.ts`

**Interfaces:**
- Consumes: Task 1의 `isNotAGoal`, `getAttempts`, `incrementAttempts`
- Produces: `ErrorCode`에 `"NOT_A_GOAL" | "TOO_FREQUENT" | "ATTEMPT_LIMIT"` 추가. `Env`에 `AI_RATE_LIMIT?: RateLimit`(optional: 없으면 통과)와 `DAILY_ATTEMPT_LIMIT?: string` 추가.

`wrangler.toml`에 추가할 내용(값 고정):

```toml
# 같은 uid의 몰아치기 차단(10초에 3회). 비용 총량은 DAILY_ATTEMPT_LIMIT가 막는다.
# namespace_id는 계정 안에서 고유한 정수 문자열이면 된다.
[[ratelimits]]
name = "AI_RATE_LIMIT"
namespace_id = "1001"
simple = { limit = 3, period = 10 }
```

`[vars]`에는 `DAILY_ATTEMPT_LIMIT = "40"`을 추가한다. 주석은 "Claude까지 간 시도(실패 포함) 하루 상한"으로 단다.

- [ ] **Step 1: 실패하는 테스트 작성**

`plan.test.ts`의 `makeEnv`에 `AI_RATE_LIMIT: { limit: vi.fn(async () => ({ success: true })) }`와 `DAILY_ATTEMPT_LIMIT: "5"`를 기본으로 넣는다(옵션으로 덮어쓸 수 있게). 시도 키는 `const ATTEMPT_KEY = "attempts:user-1:2026-09-25"`이다. 다음 케이스를 추가한다.
- goal `"🎉 123"` → 400 `{ error: "NOT_A_GOAL" }`. `generatePlan`, `AI_RATE_LIMIT.limit`, KV `put`이 모두 호출되지 않는다.
- `limit`이 `{ success: false }` → 429 `{ error: "TOO_FREQUENT" }`, `generatePlan` 미호출. `limit`은 `{ key: "user-1" }`로 불렸다.
- `limit`이 reject → 200 정상 처리.
- `AI_RATE_LIMIT`가 없는 env → 200 정상 처리.
- store에 `ATTEMPT_KEY = "5"` → 429 `{ error: "ATTEMPT_LIMIT" }`, `generatePlan` 미호출.
- 성공 → `ATTEMPT_KEY`가 `"1"`이고 응답 `usage`는 기존 성공 카운트 기준이다(기존 테스트 기대값 유지).
- `generatePlan`이 `PlanGenerationError` → 502이고 `ATTEMPT_KEY`가 `"1"`, 성공 키는 그대로다.
- `generatePlan`이 `Anthropic.APIError` → 503이고 `ATTEMPT_KEY`가 `"1"`.
- 성공 키가 이미 한도(`DAILY_LIMIT: "3"`, store `KEY = "3"`) → 429 DAILY_LIMIT이고 `ATTEMPT_KEY`가 없다.
- `DAILY_ATTEMPT_LIMIT`가 `"abc"`, `"0"`, 없음일 때 store `ATTEMPT_KEY = "39"` → 200(기본 40 적용), `"40"` → 429 ATTEMPT_LIMIT.

- [ ] **Step 2: 실패 확인**

Run: `cd ai-proxy && npx vitest run src/__tests__/plan.test.ts`
Expected: 새 케이스 FAIL, 기존 케이스 PASS

- [ ] **Step 3: 구현**

`handlePlan`을 Global Constraints의 순서대로 바꾼다. `readAttemptLimit(env)`는 기존 `readLimit`과 같은 파싱 방식이고 기본값은 `DEFAULT_DAILY_ATTEMPT_LIMIT = 40`이다. 연타 제한은 `env.AI_RATE_LIMIT`이 없으면 건너뛰고, `limit()` 예외는 `console.error` 후 통과한다. 시도 상한 확인과 `incrementAttempts`는 `generatePlan` 바로 앞에 둔다. 상단 주석의 "결제로 공개 전 반드시 닫아야 한다" 문단은 이렇게 바꾼다: 실패 시도는 `DAILY_ATTEMPT_LIMIT`로, 몰아치기는 `AI_RATE_LIMIT`로 막는다. 남은 한계는 KV 비원자성(소폭 초과)이다. README 환경변수 목록에는 `DAILY_ATTEMPT_LIMIT`와 `AI_RATE_LIMIT` 바인딩 설명을 한 줄씩 추가한다.

- [ ] **Step 4: 통과 확인**

Run: `cd ai-proxy && npx vitest run && npm run typecheck && npx wrangler deploy --dry-run --outdir .wrangler/dry`
Expected: 테스트 전부 PASS, 타입 오류 없음. dry-run 출력의 바인딩 목록에 `AI_RATE_LIMIT`(Rate Limit)와 `DAILY_ATTEMPT_LIMIT`가 보이고 설정 오류가 없다.

- [ ] **Step 5: Commit**

```bash
git add ai-proxy/src/handlers/plan.ts ai-proxy/src/http.ts ai-proxy/src/env.ts ai-proxy/wrangler.toml ai-proxy/README.md ai-proxy/src/__tests__/plan.test.ts
git commit -m "feat(ai-proxy): 연타 제한·하루 시도 상한·글자 없는 입력 거절로 실패 반복 비용을 막음"
```

---

### Task 3: 웹 오류 코드·문구

**Files:**
- Modify: `client/src/features/aiPlan/api/aiProxyApi.ts`
- Modify: `client/src/features/aiPlan/utils/aiPlanErrorMessage.ts`
- Test: `client/src/features/aiPlan/api/__tests__/aiProxyApi.test.ts`, `client/src/features/aiPlan/utils/__tests__/aiPlanErrorMessage.test.ts`

**Interfaces:**
- Consumes: 서버 응답 `{ error: "NOT_A_GOAL" | "TOO_FREQUENT" | "ATTEMPT_LIMIT" }` (Task 2)
- Produces: `AiPlanErrorCode`에 세 코드를 추가하고, `KNOWN_CODES`와 `EXPECTED_CODES`에도 추가한다.

- [ ] **Step 1: 실패하는 테스트 작성**

- `aiProxyApi.test.ts`: 응답 `429 { error: "TOO_FREQUENT" }`면 `AiPlanError`의 code가 `"TOO_FREQUENT"`, status가 429다(나머지 두 코드도 `it.each`로). `isExpectedAiPlanError`는 세 코드에 대해 `true`다.
- `aiPlanErrorMessage.test.ts`(문구 고정):
  - `NOT_A_GOAL` → `{ title: "목표를 글로 적어 주세요", message: "이루고 싶은 일을 문장으로 적어 주세요" }`
  - `TOO_FREQUENT` → `{ title: "잠시 후 다시 시도해 주세요", message: "요청이 너무 잦아요. 10초 뒤에 다시 눌러 주세요" }`
  - `ATTEMPT_LIMIT` → `{ title: "오늘 시도 횟수를 다 썼어요", message: "내일 다시 시도해 주세요" }`

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/aiPlan`
Expected: 새 케이스 FAIL

- [ ] **Step 3: 구현**

목록과 분기만 추가한다.

- [ ] **Step 4: 통과 확인 (CI 등가)**

Run: `cd client && VITE_FIREBASE_API_KEY= VITE_BILLING_ENABLED= npx vitest run && npx tsc -b && npx eslint src/features/aiPlan`
Expected: 전부 PASS, 타입 오류 없음

- [ ] **Step 5: Commit**

```bash
git add client/src/features/aiPlan
git commit -m "feat(aiPlan): 글자 없는 입력·연타·시도 한도 오류 안내 문구"
```

---

## 배포 메모 (구현 범위 밖, PR 본문에 기록)

- Worker를 먼저 배포한다. main push CI 또는 사용자 터미널의 `!` 수동 배포를 쓴다. Node 22가 필요하다.
- 배포 후 `wrangler versions view --json`으로 placement가 `aws:us-east-1`로 유지되는지 확인한다.
- 운영 실검증: 테스트 계정으로 ① `"123"` 입력 시 NOT_A_GOAL 문구, ② 4회를 빠르게 요청하면 4번째에 TOO_FREQUENT, ③ 생성 → 바로 "다시 만들기"는 정상 동작.
