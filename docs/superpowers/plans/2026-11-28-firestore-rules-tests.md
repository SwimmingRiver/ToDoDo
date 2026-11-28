# Firestore rules 테스트 스위트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `firestore.rules`의 허용·거부 표 테스트와, core Firestore 함수를 실제 rules 위에서 돌리는 계약 테스트를 `packages/core`에 추가하고 CI에 연결한다.

**Architecture:** `packages/core/src/__rules__/`에 `*.rules.test.ts`를 둔다. 기본 `vitest run`은 이 폴더를 제외하고, `vitest.rules.config.ts`가 이 폴더만 포함한다. `npm run test:rules`는 `firebase emulators:exec`로 Firestore 에뮬레이터를 띄운 뒤 이 설정으로 vitest를 돌린다. 두 종류의 테스트 모두 `@firebase/rules-unit-testing` 컨텍스트의 `firestore()`를 쓴다. 계약 테스트는 그 인스턴스를 core 함수에 `Firestore`로 넘긴다. 모듈러 함수는 compat 인스턴스도 받는다.

**Tech Stack:** vitest 4, firebase 12.18(모듈러), `@firebase/rules-unit-testing@^5`(peer firebase ^12 — 6.x는 firebase 13이 필요해서 쓰지 않는다), `firebase-tools@^15.25.0`, Java 21

**Spec:** `docs/superpowers/specs/2026-11-28-firestore-rules-tests-design.md`

## Global Constraints

- 프로젝트 ID는 `demo-tododo-rules`만 쓴다(`demo-` 접두사라 운영에 닿지 않음). 운영 프로젝트 ID `tododo-83576`이 테스트 코드에 나오면 안 된다
- 기존 `npm test`(packages/core)는 에뮬레이터 없이 지금처럼 통과해야 하고, `src/__rules__/**`를 실행하지 않는다
- rules 파일은 루트 `firestore.rules`를 읽는다(복사본 금지). 에뮬레이터 설정은 루트 `firebase.json`(firestore 8080)을 쓴다
- `firestore.rules`는 수정하지 않는다. 테스트가 rules 버그를 드러내면 해당 테스트를 `it.fails`로 두지 말고 멈추고 보고한다
- 시간에 의존하는 테스트는 `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)`으로 고정한다. 타이머 전체를 가짜로 바꾸면 Firestore SDK가 멈춘다. 프리미엄 클레임은 `Date.now()` 기준 상대값으로 만든다
- `tsconfig.json`의 exclude(`src/**/*.test.ts`)가 이미 rules 테스트를 빌드에서 뺀다. dist는 바뀌면 안 된다(CI "Check dist is up to date")
- hooks 우회(`--no-verify`) 금지

## Review Focus

1. **테스트 파일 병렬 실행이 같은 에뮬레이터 데이터를 지움**: 파일 A의 `clearFirestore()`가 파일 B의 사전 데이터를 날려 간헐 실패가 난다. 그래서 rules 설정은 `fileParallelism: false`로 둔다(Task 1). 확인은 Task 4 Step 4에서 전체 연속 3회 실행으로 한다.
2. **main push에서 Rules job이 skip돼 배포까지 skip됨**: `deploy.needs`에 rules를 넣으면 skip이 배포를 막는다. 그래서 조건에 main push 항상 실행을 넣는다(Task 5 Step 2 검증).
3. **rules 파일 경로가 실행 위치에 따라 달라짐**: 경로는 `import.meta.url` 기준으로 푼다(Task 1 `env.ts`). 확인은 루트와 core 양쪽에서 실행해 본다(Task 1 Step 6).
4. **31개 이상 회차 시리즈 삭제의 `in` 쿼리 분할**: `PARENT_ID_IN_LIMIT` 30을 넘는 두 번째 청크도 userId 조건과 함께 rules를 통과해야 한다(Task 4 테스트).
5. **다른 사용자 데이터가 섞인 상태**: 본인 함수가 남의 문서 때문에 거부되거나 남의 문서를 바꾸면 안 된다. 그래서 모든 계약 테스트의 사전 데이터에 다른 사용자 문서를 섞는다(Task 3·4).

---

### Task 1: 실행 기반 + todos 컬렉션 표 테스트

**Files:**
- Modify: `packages/core/package.json` (devDependencies, scripts)
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/vitest.rules.config.ts`
- Create: `packages/core/src/__rules__/env.ts`
- Create: `packages/core/src/__rules__/todos.rules.test.ts`

**Interfaces:**
- Produces (`src/__rules__/env.ts`):
  - `PROJECT_ID = "demo-tododo-rules"`
  - `createEnv(): Promise<RulesTestEnvironment>`: `initializeTestEnvironment({ projectId, firestore: { rules: <루트 firestore.rules 내용> } })`. host·port는 `emulators:exec`가 설정하는 `FIRESTORE_EMULATOR_HOST`를 따른다
  - `dbAs(env, uid: string | null, claims?: Record<string, unknown>): Firestore`: uid가 null이면 `unauthenticatedContext`, 아니면 `authenticatedContext(uid, claims)`. `.firestore()`를 모듈러 `Firestore` 타입으로 반환한다
  - `seed(env, path: string, data: Record<string, unknown>): Promise<void>`: `withSecurityRulesDisabled`로 `setDoc`
  - `todoDoc(overrides?: Record<string, unknown>): Record<string, unknown>`: 저장 형태의 할 일 문서(userId "alice", title, status "todo", priority "medium", startAt/dueAt/doneAt null, parentId null, order 0, archived false, createdAt/updatedAt 고정 ISO)
- 각 테스트 파일은 `beforeAll(createEnv)`, `beforeEach(env.clearFirestore)`, `afterAll(env.cleanup)` 패턴을 쓴다

- [ ] **Step 1: 의존성과 스크립트 추가**

`packages/core`에서 `npm i -D @firebase/rules-unit-testing@^5 firebase-tools@^15.25.0`을 실행한다. 스크립트는 다음과 같다:
`"test:rules": "firebase emulators:exec --only firestore --project demo-tododo-rules --config ../../firebase.json \"vitest run --config vitest.rules.config.ts\""`

- [ ] **Step 2: vitest 설정 두 개 작성**

`vitest.config.ts`: `test.exclude`에 vitest 기본 exclude와 `src/__rules__/**`를 둔다.
`vitest.rules.config.ts`: `test.include: ["src/__rules__/**/*.rules.test.ts"]`, `fileParallelism: false`, `testTimeout: 20000`.

- [ ] **Step 3: 기존 단위 테스트가 그대로인지 확인**

Run: `cd packages/core && npm test`
Expected: PASS. 테스트 파일 수가 이 작업 전과 같다(전후 출력의 "Test Files" 수를 비교한다).

- [ ] **Step 4: `env.ts`와 todos 표 테스트 작성**

`assertSucceeds`/`assertFails`로 확인할 사례는 다음과 같다(`describe("todos")`):
- read: 본인 문서 getDoc 성공 / 남의 문서 실패 / 비로그인 실패
- query: `where("userId","==","alice")` 성공 / userId 조건 없는 `collection("todos")` 전체 조회 실패 / `where("parentId","==","p1")`만 있는 조회는 결과가 0건이어도 실패(G1의 원인)
- create: userId=본인 성공 / userId=남 실패 / 비로그인 실패 / description 2000자 성공 / 2001자 실패 / description 숫자 실패 / description null 성공
- update: 본인 문서 title 변경 성공 / 남의 문서 실패 / userId를 남으로 바꾸기 실패 / 2001자 description을 가진 기존 문서(rules 끄고 seed)의 status만 변경 성공 / 그 문서의 description을 2001자 다른 값으로 바꾸기 실패
- delete: 본인 성공 / 남 실패 / 없는 문서 삭제 실패(resource가 null)

- [ ] **Step 5: 실행해서 통과 확인**

Run: `cd packages/core && npm run test:rules`
Expected: PASS. 에뮬레이터가 뜨고 내려가며, todos 사례 전부 통과한다. 사전 조건: `java -version`이 21이고 8080 포트가 비어 있어야 한다(`lsof -i :8080`).

- [ ] **Step 6: 실행 위치가 달라도 되는지 확인**

Run: `npm --prefix packages/core run test:rules`(레포 루트에서)
Expected: PASS(Review Focus 3)

- [ ] **Step 7: Commit**

```bash
git add packages/core/package.json packages/core/package-lock.json packages/core/vitest.config.ts packages/core/vitest.rules.config.ts packages/core/src/__rules__
git commit -m "test(rules): 에뮬레이터 rules 테스트 기반과 todos 허용·거부 표"
```

### Task 2: 나머지 6개 컬렉션 표 테스트

**Files:**
- Create: `packages/core/src/__rules__/collections.rules.test.ts`

**Interfaces:**
- Consumes: Task 1 `createEnv`, `dbAs`, `seed`

- [ ] **Step 1: 표 테스트 작성**

- feedback: 운영자(`{ operator: true }`) read 성공 / 일반 사용자 read 실패 / 누구든 create 실패(운영자 포함) / 운영자 status "done"으로 update 성공 / 운영자 status "bogus" 실패 / 운영자 status와 message 함께 update 실패 / 일반 사용자 update 실패 / 운영자 delete 실패
- calendarIntegrations/{uid}: 본인 + `premiumUntil: Math.floor(Date.now()/1000)+3600` read·write 성공 / 본인 + 만료(`-3600`) 실패 / 본인 + 클레임 없음 실패 / premiumUntil이 문자열이면 실패 / 남의 문서(유효 프리미엄) 실패
- userSettings/{uid}: 본인 `{ reminderDefaultOffsetMinutes: 30 }` set 성공 / `"off"` 성공 / `15` 실패 / 다른 키 추가 실패 / 본인 read·delete 성공 / 남 read 실패
- entitlements/{uid}: 본인 read 성공 / 남 read 실패 / 본인 write(`plan: "premium"`) 실패
- storeLinks, trialHistory: 본인 포함 누구든 read·write 실패

- [ ] **Step 2: 실행**

Run: `cd packages/core && npm run test:rules`
Expected: PASS(todos + collections)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/__rules__/collections.rules.test.ts
git commit -m "test(rules): feedback·캘린더·알림설정·entitlements·서버전용 컬렉션 표"
```

### Task 3: core 할 일 api 계약 테스트 + G1 실증

**Files:**
- Create: `packages/core/src/__rules__/todoApi.contract.rules.test.ts`

**Interfaces:**
- Consumes: Task 1 `createEnv`, `dbAs`, `seed`, `todoDoc`. core: `getTodos(db, userId)`, `fetchAllUserTodos(db, userId)`, `createTodo(db, userId, fields)`, `updateTodo(db, id, fields, allTodos)`, `deleteTodo(db, userId, id)`, `getNextRootOrder(db, userId)` (`src/api/todoApi.ts`, `src/api/todoDocs.ts`)

- [ ] **Step 1: 계약 테스트 작성**

모든 테스트의 사전 데이터에는 bob의 할 일 2개(상위 1개, 하위 1개)를 rules를 끄고 넣는다. 실행 주체는 `dbAs(env, "alice")`다.
- `getTodos`·`fetchAllUserTodos`: alice 문서만 반환하고 거부되지 않는다(bob 문서 id가 결과에 없음)
- `getNextRootOrder`: 성공하고 alice 상위 개수 기준 값을 반환한다
- `createTodo`: 성공, 만든 문서의 userId가 "alice"
- `updateTodo`: 하위 status를 "done"으로 바꾸면 상위 재계산 batch까지 성공(상위 status 변경 확인)
- `deleteTodo`: 하위 없는 상위 삭제 성공 / 하위 2개 있는 상위 삭제 성공(하위까지 사라짐) / bob 문서는 그대로
- bob의 문서 id로 `deleteTodo(aliceDb, "alice", bobId)` 호출 시 reject

- [ ] **Step 2: 실행**

Run: `cd packages/core && npm run test:rules`
Expected: PASS

- [ ] **Step 3: G1 실증(커밋하지 않음)**

`src/api/todoApi.ts:128`의 `where("userId", "==", userId),`를 임시로 지우고 다시 실행한다.
Expected: `deleteTodo` 사례가 permission-denied로 FAIL한다. 실패 출력 요약을 PR 설명용으로 기록한 뒤 `git checkout -- src/api/todoApi.ts`로 되돌리고 다시 PASS를 확인한다.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/__rules__/todoApi.contract.rules.test.ts
git commit -m "test(rules): core 할 일 api를 실제 rules 위에서 검증"
```

### Task 4: 반복·AI 플랜·앱 진입 정리 계약 테스트

**Files:**
- Create: `packages/core/src/__rules__/recurring.contract.rules.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers. core: `createRecurringTodo(db, userId, todo, horizonEnd?)`, `editRecurringSeries(db, userId, seriesTodo, horizonEnd?)`, `deleteRecurringSeries(db, userId, recurrenceId)` (`src/recurring/seriesApi.ts`), `runStartupMaintenance(db, userId, options?)` (`src/recurring/startupMaintenanceApi.ts`), `createPlanTodos(db, userId, submission)` (`src/api/planTodoApi.ts`)

- [ ] **Step 1: 계약 테스트 작성**

`beforeEach`에서 `vi.useFakeTimers({ toFake: ["Date"] })`와 `vi.setSystemTime(new Date(2026, 0, 5, 9, 0))`(로컬 시각)을 설정하고, `afterEach`에서 `vi.useRealTimers()`. bob의 반복 회차 문서도 섞는다.
- `createRecurringTodo`: 매일 규칙 + horizonEnd 7일 뒤로 성공하고 회차 문서 모두 userId "alice"
- `editRecurringSeries`: 위 시리즈 제목 변경 성공
- `deleteRecurringSeries`: 회차 하위가 있는 시리즈 삭제 성공(하위도 삭제)
- `deleteRecurringSeries` 31회차: 회차 31개 각각 하위 1개를 rules를 끄고 seed한 뒤 삭제 성공, 하위 31개 모두 사라짐(Review Focus 4)
- `runStartupMaintenance`: 31일 지난 done 상위 1개 + 지난 dueAt 반복 회차가 있는 상태에서 reject 없이 `failedSweeps`가 빈 배열
- `createPlanTodos`: 상위 1 + 하위 2 성공, 모두 userId "alice"

- [ ] **Step 2: 실행**

Run: `cd packages/core && npm run test:rules`
Expected: PASS

- [ ] **Step 3: 시간대 바꿔 실행**

Run: `cd packages/core && TZ=America/New_York npm run test:rules`
Expected: PASS

- [ ] **Step 4: 간헐 실패 확인**

Run: `cd packages/core && for i in 1 2 3; do npm run test:rules || break; done`
Expected: 3회 모두 PASS(Review Focus 1)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/__rules__/recurring.contract.rules.test.ts
git commit -m "test(rules): 반복 시리즈·AI 플랜·앱 진입 정리를 실제 rules 위에서 검증"
```

### Task 5: CI job + 배포 연결 + 로컬 안내

**Files:**
- Modify: `.github/workflows/ci.yml` (changes outputs·filters, 새 `rules` job, `deploy.needs`)
- Modify: `packages/core/vitest.rules.config.ts` 상단 주석(로컬 함정 안내)

**Interfaces:**
- Produces: CI job id `rules`, name `Firestore Rules`

- [ ] **Step 1: CI 수정**

- changes job `outputs`에 `rules: ${{ steps.filter.outputs.rules }}`를 추가하고, filter에 `rules:` 항목(`firestore.rules`, `firebase.json`, `packages/core/**`, `.github/workflows/ci.yml`)을 넣는다
- `rules` job: `needs: changes`, `if`는 client job과 같은 3조건 + `!cancelled()`를 `needs.changes.outputs.rules`로 바꾼 것. working-directory는 `packages/core`. 단계는 checkout → Node 20 → `actions/setup-java@v4`(temurin 21) → core node_modules 캐시(core job과 같은 key) → `npm ci`(캐시 미스 시) → 에뮬레이터 캐시(`~/.cache/firebase/emulators`, key에 `packages/core/package-lock.json` 해시) → `npm run test:rules`
- `deploy.needs`를 `[client, e2e, feedback-proxy, rules]`로 바꾼다

- [ ] **Step 2: 조건 검증**

Run: `grep -n -A8 '^  rules:' .github/workflows/ci.yml` 그리고 `grep -n 'needs: \[client, e2e, feedback-proxy, rules\]' .github/workflows/ci.yml`
Expected: if에 `refs/heads/main`과 `needs.changes.result != 'success'`가 있고, deploy needs에 rules가 있다. `actionlint`가 설치돼 있으면 `actionlint .github/workflows/ci.yml`도 오류 0.

- [ ] **Step 3: 로컬 안내 주석**

`vitest.rules.config.ts` 상단에 3줄을 쓴다: 실행은 `npm run test:rules`, JAVA_HOME은 JDK 21, 8080에 고아 에뮬레이터가 있으면 E2E와 같은 "port taken" 오류가 나므로 `lsof -i :8080`으로 확인한다.

- [ ] **Step 4: Commit 후 PR CI 확인**

```bash
git add .github/workflows/ci.yml packages/core/vitest.rules.config.ts
git commit -m "ci: Firestore Rules job 추가, 배포가 rules 테스트 통과를 기다리게"
```
push 후 PR에서 "Firestore Rules" job이 실행되고 성공하는지 확인한다. 기존 Core Package job도 성공해야 한다(dist 불변).
