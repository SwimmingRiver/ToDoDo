# 고객 의견 받은편지함 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹·앱 의견을 새 Worker가 받아 Firestore에 저장하고 운영자 Discord로 내용 없는 알림을 보내며, 운영자는 웹 `/admin/feedback`에서 의견을 보고 상태를 바꾼다.

**Architecture:** 새 Cloudflare Worker `feedback-proxy`(`POST /feedback`)가 Firebase ID 토큰을 검증하고 서비스계정으로 Firestore REST에 문서를 만든 뒤 Discord 웹훅을 부른다. 웹(client/)과 앱(mobile/)은 이 Worker로 제출한다. 운영자 페이지는 `operator` 커스텀 클레임 + Firestore 규칙으로 직접 읽고 `status`만 갱신한다.

**Tech Stack:** Cloudflare Workers(TypeScript, vitest, wrangler 4, ratelimits 바인딩), React+Vite+TanStack Query+styled-components(client), Expo/React Native+jest(mobile), Firestore rules, firebase-admin 스크립트(tsx).

**Spec:** `docs/superpowers/specs/2026-11-23-feedback-inbox-design.md`

## Global Constraints

- Discord 알림 본문에 의견 내용·이메일·uid를 넣지 않는다. 본문은 정확히 `새 의견 1건 (<platform>)\n<CLIENT_APP_URL>/admin/feedback`.
- content: trim 후 1~1000자(`FEEDBACK_CONTENT_MAX_LENGTH = 1000`). platform ∈ `"web" | "ios" | "android"`.
- status ∈ `"new" | "planned" | "done" | "wontfix"`. 문구: 새 의견 / 반영 예정 / 반영함 / 안 함. 필드 없으면 `"new"`, platform 없으면 `"web"`으로 읽는다.
- createdAt은 서버 시각 ISO 문자열(`new Date().toISOString()`), email은 ID 토큰 `email` 클레임 또는 `null`.
- Discord 호출 실패는 제출 실패가 아니다(201 유지, `console.error`). 레이트리밋 바인딩 장애 시 통과(fail-open, ai-proxy와 동일).
- Worker 코드에 Buffer 등 Node 전용 API 금지(btoa/atob). 전역 `fetch`를 기본값으로 담을 땐 `(i, init) => fetch(i, init)`로 감싼다(Illegal invocation 방지).
- `reminder-proxy/` 파일은 수정하지 않는다(다른 세션 작업 중).
- 커밋 시 hooks 우회(`--no-verify`) 금지. 명령은 포그라운드에서 끝나는 것만(watch·dev 서버 금지).
- 클라이언트 테스트는 CI와 같게 `VITE_FIREBASE_API_KEY= npx vitest run …`으로 돌린다.

## Review Focus

1. 이메일 없는 Apple 계정 토큰 → `email: null`로 저장되고 201이어야 한다 (Task 1·4 테스트).
2. 기존 운영 문서(platform·status 없음)가 운영자 페이지에서 "web"/"새 의견"으로 보여야 한다 (Task 9 테스트).
3. 비운영자가 `/admin/feedback`에 들어오면 목록 조회를 시도하지 않고 `/today`로 가야 한다 — 권한 오류 화면이 뜨면 안 된다 (Task 9 테스트).
4. 전역 알림 상한 초과 시 저장은 되고(201) Discord만 생략돼야 한다 (Task 4 테스트).
5. `operator` 클레임 부여가 기존 `premiumUntil` 클레임을 지우면 안 된다 (Task 7 테스트).

---

### Task 1: worker-auth가 email 클레임을 선택적으로 돌려준다

**Files:**
- Modify: `packages/worker-auth/src/auth.ts` (VerifiedToken, payload 타입, return)
- Test: `packages/worker-auth/src/__tests__/` 의 기존 verify 테스트 파일에 케이스 추가

**Interfaces:**
- Produces: `VerifiedToken.email?: string` — 토큰 `email`이 비어 있지 않은 문자열일 때만 존재. 기존 소비처 목(mock)이 깨지지 않도록 **선택 필드**.

- [ ] **Step 1: 실패 테스트** — 기존 테스트의 서명 토큰 헬퍼로 `email: "a@b.com"` 페이로드 → `result.email === "a@b.com"`; email 없음 → `result.email === undefined`; `email: 123` → `undefined`.
- [ ] **Step 2:** `cd packages/worker-auth && npm test` → 새 케이스 FAIL.
- [ ] **Step 3:** payload 타입에 `email?: unknown` 추가, return에 `...(typeof payload.email === "string" && payload.email ? { email: payload.email } : {})`. 파일 상단 LoginProvider 주석("email 등 다른 식별자는 버린다")은 identities 얘기이므로 email 필드 JSDoc에 "의견 저장용, 없을 수 있음(Apple)"만 단다.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5:** `git commit -m "feat(worker-auth): ID 토큰 email 클레임을 선택 필드로 반환"`

### Task 2: feedback-proxy 골격 + Firestore 저장소

**Files:**
- Create: `feedback-proxy/package.json`, `tsconfig.json`, `wrangler.toml`, `README.md`, `src/env.ts`, `src/googleAuth.ts`, `src/feedbackStore.ts`
- Test: `feedback-proxy/src/__tests__/feedbackStore.test.ts`

**Interfaces:**
- Produces:
  - `Env { FIREBASE_PROJECT_ID: string; CLIENT_APP_URL: string; GOOGLE_SERVICE_ACCOUNT: string; DISCORD_WEBHOOK_URL: string; FEEDBACK_SUBMIT_LIMIT?: RateLimit; FEEDBACK_NOTIFY_LIMIT?: RateLimit }`
  - `type Platform = "web" | "ios" | "android"`
  - `interface NewFeedback { userId: string; email: string | null; content: string; platform: Platform; createdAt: string }`
  - `class FeedbackStore { constructor(projectId: string, getToken: () => Promise<string>, fetchFn?: typeof fetch); create(doc: NewFeedback): Promise<void> }` — 실패 시 `Error("Firestore 의견 저장 실패 (<status>)")`.
  - `googleAuth.ts`: billing-proxy `googleAuth.ts`를 **그대로 복사**(`parseServiceAccount`, `GoogleTokenProvider`). 맨 위 주석에 "세 번째 복제본 — 공유 패키지화는 reminder-proxy 작업이 끝난 뒤 기술부채로" 기록.

- [ ] **Step 1: package/tsconfig/wrangler** — package.json·tsconfig는 ai-proxy와 같은 형태(`@anthropic-ai/sdk`·zod 제외, 의존성은 `@tododo/worker-auth: file:../packages/worker-auth`만). `wrangler.toml`:
  ```toml
  name = "tododo-feedback-proxy"
  main = "src/index.ts"
  compatibility_date = "2025-01-01"
  [vars]
  FIREBASE_PROJECT_ID = "tododo-83576"
  CLIENT_APP_URL = "https://tododo-app.com"
  # 같은 uid 제출: 60초 3회. 초과 시 429, 저장 안 함.
  [[ratelimits]]
  name = "FEEDBACK_SUBMIT_LIMIT"
  namespace_id = "1101"
  simple = { limit = 3, period = 60 }
  # 전역 Discord 알림: 60초 10건. 초과 시 저장은 하고 알림만 생략.
  [[ratelimits]]
  name = "FEEDBACK_NOTIFY_LIMIT"
  namespace_id = "1102"
  simple = { limit = 10, period = 60 }
  ```
  `npm install`로 package-lock.json 생성. (`namespace_id`가 계정 내 다른 Worker와 겹치지 않는지 `grep -r namespace_id */wrangler.toml`로 확인.)
- [ ] **Step 2: 실패 테스트** — 가짜 fetch로 `create({userId:"u1", email:null, content:"좋아요", platform:"ios", createdAt:"2026-11-23T00:00:00.000Z"})` 호출 시:
  - URL이 `https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/feedback`, method POST, `Authorization: Bearer tok`.
  - body.fields가 `{ userId:{stringValue:"u1"}, email:{nullValue:null}, content:{stringValue:"좋아요"}, platform:{stringValue:"ios"}, status:{stringValue:"new"}, createdAt:{stringValue:"2026-11-23T00:00:00.000Z"} }`와 같다.
  - email이 문자열이면 `{stringValue}`.
  - 응답 500이면 `"Firestore 의견 저장 실패 (500)"`로 reject.
- [ ] **Step 3:** `npm test` → FAIL. **Step 4:** 구현(status는 항상 `"new"`로 넣는다). `npm test && npm run typecheck` → PASS.
- [ ] **Step 5:** `git commit -m "feat(feedback-proxy): Worker 골격과 Firestore 의견 저장소"`

### Task 3: Discord 알림

**Files:**
- Create: `feedback-proxy/src/discord.ts`
- Test: `feedback-proxy/src/__tests__/discord.test.ts`

**Interfaces:**
- Produces: `notifyDiscord(webhookUrl: string, platform: Platform, appUrl: string, fetchFn?: typeof fetch): Promise<void>` — 2xx가 아니면 throw.

- [ ] **Step 1: 실패 테스트** — 가짜 fetch 호출 인자 검증: POST `webhookUrl`, `Content-Type: application/json`, body가 정확히 `{ content: "새 의견 1건 (ios)\nhttps://tododo-app.com/admin/feedback", allowed_mentions: { parse: [] } }`. 응답 429면 reject. 그리고 body 문자열에 테스트용 의견 내용·이메일이 들어갈 경로가 없음을 시그니처로 보장(인자에 content/email 없음).
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat(feedback-proxy): 내용 없는 Discord 알림"`

### Task 4: POST /feedback 핸들러 + 라우터

**Files:**
- Create: `feedback-proxy/src/http.ts`, `src/handlers/feedback.ts`, `src/index.ts`
- Test: `feedback-proxy/src/__tests__/feedback.test.ts`, `src/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `verifyFirebaseIdToken` (Task 1의 `email?`), `FeedbackStore` (Task 2), `notifyDiscord` (Task 3)
- Produces: `handleFeedback(request: Request, env: Env, deps?: { store?: Pick<FeedbackStore,"create">; notify?: typeof notifyDiscord; now?: () => Date }): Promise<Response>`; 에러 응답 형식 `{ error: "UNAUTHORIZED" | "INVALID_INPUT" | "TOO_FREQUENT" }` (ai-proxy `http.ts` 규약 복사). 성공 201 `{ ok: true }`.

순서: 토큰 검증(401) → 본문 파싱·검증(400) → `FEEDBACK_SUBMIT_LIMIT.limit({key: uid})`(429) → 저장(실패 시 throw → index가 500) → `FEEDBACK_NOTIFY_LIMIT.limit({key:"global"})` 통과 시 Discord(실패는 catch 후 `console.error`) → 201.

- [ ] **Step 1: 실패 테스트** (ai-proxy `plan.test.ts`처럼 `@tododo/worker-auth`를 vi.mock):
  - 토큰 검증 실패 → 401 `UNAUTHORIZED`, store 미호출.
  - content `"   "`, 1001자, 숫자, platform `"mac"`, JSON 아님 → 각각 400 `INVALID_INPUT`.
  - submit 리밋 `success:false` → 429 `TOO_FREQUENT`, store 미호출.
  - 정상(`email:"a@b.com"`) → 201, store에 `{userId:"user-1", email:"a@b.com", content:"좋아요"(trim됨), platform:"web", createdAt:<고정 now ISO>}`, notify가 `(env.DISCORD_WEBHOOK_URL, "web", env.CLIENT_APP_URL)`로 호출.
  - email 없는 토큰 → store에 `email: null`, 201.
  - notify가 reject → 여전히 201.
  - notify 리밋 `success:false` → 201, notify 미호출, store는 호출됨.
  - 리밋 바인딩이 throw → 통과(201).
  - index 테스트: OPTIONS 204 + 허용 Origin이면 `Access-Control-Allow-Origin` 설정; 알 수 없는 경로 404; 핸들러 throw → 500에도 CORS 헤더.
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현 — `index.ts`는 ai-proxy `index.ts`와 같은 구조(경로만 `/feedback`). 기본 deps는 `new FeedbackStore(env.FIREBASE_PROJECT_ID, () => provider.getToken())`, provider는 `new GoogleTokenProvider(parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT))`를 모듈 범위에서 지연 생성해 재사용.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS. 루트 `node_modules`의 @types/node 누수 확인: `npm run typecheck`가 tsconfig `types: ["@cloudflare/workers-types"]`만 쓰는지 확인.
- [ ] **Step 5:** README에 배포 준비 절차 작성: ① 사용자가 자기 터미널에서 `npx wrangler secret put GOOGLE_SERVICE_ACCOUNT`(billing-proxy와 같은 Firestore 쓰기 권한 계정, Cloud Datastore User), `npx wrangler secret put DISCORD_WEBHOOK_URL`(Discord 채널 설정 → 연동 → 웹후크 만들기 → URL 복사) ② `npm run deploy` ③ `curl -X OPTIONS` 204 확인.
- [ ] **Step 6:** `git commit -m "feat(feedback-proxy): POST /feedback — 검증·연타 제한·저장·알림"`

### Task 5: CI job + 웹 빌드 환경변수

**Files:**
- Modify: `.github/workflows/ci.yml` (changes outputs/filters, 새 job `feedback-proxy`, deploy job Build env)

- [ ] **Step 1:** changes에 output `feedbackProxy`와 filter(`feedback-proxy/**`, `packages/worker-auth/**`) 추가.
- [ ] **Step 2:** `ai-proxy` job을 복제해 `feedback-proxy` job 추가(Node 22, 캐시 키·경로 `feedback-proxy`, KV placeholder 검사 줄은 빼고 `npm run deploy`만). main push 항상 실행 조건 동일.
- [ ] **Step 3:** deploy job Build env에 `VITE_FEEDBACK_PROXY_URL: ${{ secrets.VITE_FEEDBACK_PROXY_URL }}` 추가.
- [ ] **Step 4:** `npx --yes @action-validator/cli .github/workflows/ci.yml` 또는 `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/ci.yml'))"`로 YAML 문법 확인 → 에러 없음.
- [ ] **Step 5:** `git commit -m "ci: feedback-proxy 테스트·배포 job과 웹 빌드 env 추가"`

### Task 6: 웹 제출을 Worker로 전환

**Files:**
- Modify: `client/src/features/feedback/api/feedbackApi.ts`, `components/feedbackForm.tsx`, `client/.env.example`(있으면) / `client/src/vite-env.d.ts`(VITE_* 타입 선언이 있으면)
- Test: `client/src/features/feedback/api/__tests__/feedbackApi.test.ts`(재작성), `components/__tests__/feedbackForm.test.tsx`

**Interfaces:**
- Produces: `submitFeedback(content: string): Promise<void>` (시그니처 유지); `class FeedbackError extends Error { constructor(readonly code: "TOO_FREQUENT" | "UNKNOWN") }`.

- [ ] **Step 1: 실패 테스트** — `vi.stubEnv("VITE_FEEDBACK_PROXY_URL","https://fb.example.com")`, `@/shared/lib/authorizedFetch` mock:
  - `submitFeedback("  좋아요  ")` → `authorizedFetch("https://fb.example.com", "/feedback", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({content:"좋아요", platform:"web"}) })`.
  - 빈 내용 → 기존처럼 `"피드백 내용을 입력해주세요"` throw, fetch 미호출.
  - 응답 429 → `FeedbackError` code `TOO_FREQUENT`, Sentry 미캡처(예상된 오류).
  - 응답 500 / fetch reject → `FeedbackError` code `UNKNOWN`, `Sentry.captureException` 1회(tags feature: feedback).
  - 폼 테스트: mutation 에러가 `TOO_FREQUENT`면 "잠시 후 다시 보내주세요. 짧은 시간에 너무 많이 보냈어요." 표시, 그 외는 기존 문구 유지.
- [ ] **Step 2:** `cd client && VITE_FIREBASE_API_KEY= npx vitest run src/features/feedback` → FAIL.
- [ ] **Step 3:** 구현(firestore import 제거). `useSubmitFeedback`은 그대로, 폼은 `error`를 꺼내 분기.
- [ ] **Step 4:** 위 명령 PASS + `npx tsc -b`(client의 타입체크 명령) + `npm run lint` 통과.
- [ ] **Step 5:** `git commit -m "feat(feedback): 웹 의견 제출을 feedback-proxy로 전환"`

### Task 7: 운영자 클레임 부여 스크립트

**Files:**
- Create: `scripts/grantOperator.ts`, `scripts/lib/mergeOperatorClaim.ts`(순수 함수)
- Modify: 루트 `package.json` scripts에 `"grant:operator": "tsx scripts/grantOperator.ts"`
- Test: `scripts/lib/__tests__/mergeOperatorClaim.test.ts` (scripts/lib에 기존 테스트 실행 방식이 있으면 그걸 따른다)

**Interfaces:**
- Produces: `mergeOperatorClaim(existing: Record<string, unknown> | undefined, grant: boolean): Record<string, unknown>` — grant면 `operator: true` 추가, 아니면 `operator` 키 제거. 다른 키(`premiumUntil` 등)는 보존, 레거시 `premium` 키 제거(grantEntitlement와 동일).

- [ ] **Step 1: 실패 테스트** — `({premiumUntil: 99}, true)` → `{premiumUntil:99, operator:true}`; `({premiumUntil:99, operator:true}, false)` → `{premiumUntil:99}`; `(undefined, true)` → `{operator:true}`; `({premium:true}, true)` → `{operator:true}`.
- [ ] **Step 2:** FAIL. **Step 3:** 구현 + 스크립트(`--uid <uid> [--revoke]`, `auth.getUser` → merge → `setCustomUserClaims`, 완료 후 "다시 로그인하거나 1시간 뒤 반영" 출력). 상단 주석에 사용법과 GOOGLE_APPLICATION_CREDENTIALS 안내(grantEntitlement 주석 형식).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat(scripts): 운영자 클레임 부여 스크립트"`

### Task 8: Firestore 규칙 — 운영자 읽기·상태 변경

**Files:**
- Modify: `firestore.rules` (`match /feedback/{feedbackId}`)

**이번 릴리스에서는 클라이언트 `create` 규칙을 그대로 둔다.** 열려 있던 옛 웹 탭이 배포 직후에도 의견을 보낼 수 있게 하기 위함(스펙 3절의 "규칙은 마지막"). create 제거는 Task 11(후속 PR).

- [ ] **Step 1:** 기존 create 규칙 유지 + 추가:
  ```
  function isOperator() { return request.auth != null && request.auth.token.operator == true; }
  allow read: if isOperator();
  allow update: if isOperator()
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status"])
                && request.resource.data.status in ["new", "planned", "done", "wontfix"];
  allow delete: if false;
  ```
  기존 `allow read, update, delete: if false;` 줄은 위로 대체.
- [ ] **Step 2: 에뮬레이터 수동 확인** (JDK 21 + 8080 포트 비어 있어야 함): `npx firebase-tools emulators:exec --only firestore --project demo-test "node <scratchpad 스크립트>"`로 `@firebase/rules-unit-testing` 없이도 되도록, 스크래치 스크립트에서 REST 또는 rules-unit-testing을 임시 설치해 확인: 운영자 read OK, 운영자 status 변경 OK, 운영자 content 변경 DENIED, status `"x"` DENIED, 일반 사용자 read DENIED. 결과를 PR 본문에 적는다(스크립트는 커밋하지 않음 — 프로젝트 관례상 규칙 테스트 스위트 없음).
- [ ] **Step 3:** `git commit -m "feat(rules): 운영자만 의견 읽기·상태 변경 허용"`

### Task 9: 웹 운영자 페이지 `/admin/feedback`

**Files:**
- Create: `client/src/features/feedback/api/feedbackAdminApi.ts`, `hooks/useFeedbackList.ts`, `hooks/useUpdateFeedbackStatus.ts`, `hooks/useIsOperator.ts`, `pages/feedbackAdminPage.tsx`(+ `.styles.tsx`)
- Modify: `client/src/features/feedback/api/index.ts`, `hooks/index.ts`, `client/src/router.tsx`(셸 children에 `{ path: "admin/feedback", element: withSuspense(<FeedbackAdminPage />) }`, lazy import)
- Test: `api/__tests__/feedbackAdminApi.test.ts`, `pages/__tests__/feedbackAdminPage.test.tsx`

**Interfaces:**
- Produces:
  - `type FeedbackStatus = "new" | "planned" | "done" | "wontfix"`; `FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string>` (새 의견/반영 예정/반영함/안 함)
  - `interface FeedbackItem { id: string; email: string | null; content: string; createdAt: string; platform: "web" | "ios" | "android"; status: FeedbackStatus }`
  - `listFeedback(): Promise<FeedbackItem[]>` — `query(collection(db,"feedback"), orderBy("createdAt","desc"), limit(100))`; 누락 필드 기본값(platform "web", status "new", email null).
  - `updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void>` — `updateDoc(doc(db,"feedback",id), { status })`.
  - `useIsOperator(): { isOperator: boolean; isLoading: boolean }` — `auth.currentUser.getIdTokenResult()`의 `claims.operator === true`.
  - 쿼리 키 `["feedback", "admin"]`; 상태 변경 성공 시 이 키 무효화.

- [ ] **Step 1: 실패 테스트(api)** — 문서 `{content:"a", createdAt:"…", userId:"u"}`(platform·status·email 없음) → `{platform:"web", status:"new", email:null}`; `updateFeedbackStatus("id1","done")`이 `updateDoc(_, {status:"done"})` 호출.
- [ ] **Step 2: 실패 테스트(page)** —
  - `useIsOperator` 로딩 중이면 목록 조회 안 함; `isOperator:false`면 `/today`로 이동하고 `listFeedback` 미호출.
  - 운영자: 항목마다 작성 시각(로컬 `yyyy.MM.dd HH:mm`), platform, 이메일(null이면 "이메일 없음"), 내용 전문, 상태 select 표시.
  - 상단 필터 "전체 / 새 의견 / 반영 예정 / 반영함 / 안 함"(기본 "새 의견") — 화면 내 필터, 재조회 없음.
  - select 변경 → `updateFeedbackStatus(id, 새 값)`.
  - 목록 0건 → "의견이 없습니다".
- [ ] **Step 3:** `VITE_FIREBASE_API_KEY= npx vitest run src/features/feedback` → FAIL.
- [ ] **Step 4:** 구현. 레이아웃은 세로 카드 목록(휴대폰 폭 기준), 기존 디자인 토큰·라우트 컨테이너 패턴(`{Feature}Container`+`{Feature}Body`) 사용. 사이드바·드로어에는 링크 추가하지 않음. 비운영자 이동은 `<Navigate to="/today" replace />`.
- [ ] **Step 5:** 테스트 PASS + `npx tsc -b` + `npm run lint`.
- [ ] **Step 6:** `git commit -m "feat(feedback): 운영자 의견 목록·상태 변경 페이지"`

### Task 10: 앱 의견 보내기 (mobile)

**Files:**
- Create: `mobile/src/feedback/feedbackProxyApi.ts`, `mobile/src/feedback/FeedbackModal.tsx`, `mobile/src/feedback/index.ts`
- Modify: `mobile/src/screens/AccountScreen.tsx` (PremiumSection 아래, 로그아웃 위에 `Button title="의견 보내기" variant="outline"`), mobile `.env` 예시 파일이 있으면 `EXPO_PUBLIC_FEEDBACK_PROXY_URL` 추가
- Test: `mobile/src/feedback/__tests__/feedbackProxyApi.test.ts`, `__tests__/FeedbackModal.test.tsx`, `mobile/src/screens/__tests__/AccountScreen.test.tsx`(버튼 → 모달 열림 케이스 추가)

**Interfaces:**
- Produces:
  - `submitFeedback(content: string): Promise<void>` — `process.env.EXPO_PUBLIC_FEEDBACK_PROXY_URL`을 함수 안에서 읽음(aiProxyApi 방식), `Platform.OS === "android" ? "android" : "ios"`. 실패 시 `FeedbackError("TOO_FREQUENT" | "UNKNOWN")`(429 → TOO_FREQUENT, 그 외·미설정·미로그인 → UNKNOWN + `console.warn`).
  - `FeedbackModal({ visible: boolean; onClose: () => void })` — RN `Modal`(화면 이동 대신 모달: 4개 스택에 화면을 추가하지 않기 위해). AccountScreen은 닫혀도 언마운트되지 않으므로 모달을 자식으로 둬도 된다.

- [ ] **Step 1: 실패 테스트(api)** — URL `${base}/feedback`, `Authorization: Bearer <idToken>`, body `{content:"좋아요", platform:"ios"}`(trim); 429 → TOO_FREQUENT; URL 미설정 → UNKNOWN, fetch 미호출.
- [ ] **Step 2: 실패 테스트(modal)** — 빈 입력이면 "보내기" 비활성; 1000자 초과 입력 불가(`maxLength={1000}`), 카운터 `n/1000`; 성공 시 "감사합니다! 의견이 전달되었습니다." 표시 후 1.5초 뒤 `onClose`(fake timers); 실패 시 입력 유지 + TOO_FREQUENT면 "잠시 후 다시 보내주세요. 짧은 시간에 너무 많이 보냈어요.", 그 외 "전송에 실패했습니다. 잠시 후 다시 시도해주세요."; 전송 중 버튼 비활성(더블탭 중복 방지).
- [ ] **Step 3:** `cd mobile && npx jest src/feedback src/screens/__tests__/AccountScreen.test.tsx` → FAIL.
- [ ] **Step 4:** 구현. `KeyboardAvoidingView`(iOS `padding`)로 입력창이 키보드에 가리지 않게. 디자인 토큰은 `mobile/src/theme`, 버튼은 `shared/ui/button`.
- [ ] **Step 5:** 같은 jest 명령 PASS + `npx tsc --noEmit`.
- [ ] **Step 6:** `git commit -m "feat(mobile): 계정 화면에 의견 보내기 추가"`

### Task 11 (후속 PR — 이 브랜치 아님): 클라이언트 직접 create 차단

main 릴리스 후 옛 웹 탭이 충분히 사라진 뒤(1주 이상) 별도 PR로 `firestore.rules`의 feedback `allow create`를 `if false`로 바꾼다. 이 계획 완료 시 후속 할 일로 메모리에 기록만 한다.

---

## 사용자 몫 (코드 밖, 순서대로)

1. Discord: 알림용 채널에 웹후크 생성 → URL 확보.
2. 자기 터미널에서 `cd feedback-proxy && npx wrangler secret put GOOGLE_SERVICE_ACCOUNT` / `DISCORD_WEBHOOK_URL`, `npm run deploy` (Task 4 완료 후, 운영 배포는 확인 후).
3. GitHub Secrets `VITE_FEEDBACK_PROXY_URL`, EAS `eas env:set`로 preview·production에 `EXPO_PUBLIC_FEEDBACK_PROXY_URL`.
4. `GOOGLE_APPLICATION_CREDENTIALS=… npm run grant:operator -- --uid <본인 uid>`.
5. main 릴리스(EAS production 빌드 전). 후속: 처리방침 다음 판에 Cloudflare 행 "의견" 추가, Task 11.
