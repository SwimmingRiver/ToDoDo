# 모바일 구글 캘린더 연동 이식 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱에서 구글 캘린더를 연결·해제하고, 앱만 써도 할 일이 구글에 단방향 동기화되며, 앱 캘린더 탭에 구글 일정이 읽기 전용으로 보이게 한다.

**Architecture:** Worker는 앱이 시작한 OAuth를 고정 딥링크(`tododo://calendar`)로 돌려보내도록만 바뀐다(PR 1, 먼저 main 릴리스). 동기화 판단·응답 해석·오버레이 헬퍼는 순수 함수로 `packages/core/src/calendarSync/`에 두고 웹은 그걸 쓰도록 리팩터링(동작 불변), 앱은 같은 core 위에 AsyncStorage 스냅샷·`expo-web-browser` 연결·Firestore 쓰기를 붙인다(PR 2).

**Tech Stack:** Cloudflare Workers + vitest(calendar-proxy), TypeScript core + vitest, React + TanStack Query(client), Expo 57 + React Native + jest-expo + TanStack Query(mobile), `expo-web-browser`, `@react-native-async-storage/async-storage`.

**Spec:** `docs/superpowers/specs/2026-11-21-mobile-calendar-integration-design.md`

## Global Constraints

- 양방향 연동·가져오기·역동기화 금지. Worker에 Firestore 쓰기 권한 추가 금지. 구글 OAuth 클라이언트·redirect URI·scope 변경 금지.
- 앱 복귀 주소는 Worker 상수 `tododo://calendar`. 클라이언트가 보낸 값으로 리다이렉트 대상을 정하지 않는다(오픈 리다이렉트 금지).
- 딥링크 쿼리: 성공 `calendarConnected=1`, 실패 `calendarError=1`, 동의 취소 `calendarCancelled=1`.
- 앱 스킴 `"scheme": "tododo"`. 앱 env `EXPO_PUBLIC_CALENDAR_PROXY_URL`.
- core 하위 경로 import만: `@tododo/core/dist/calendarSync/index.js` (루트 `@tododo/core`에 re-export 금지 — 다크모드 때 확인된 함정).
- 웹 문구 그대로: 「구글 캘린더 연동」, 「연동 해제」, "연동이 끊겼습니다. 다시 연결해주세요", 잠금 "구글 캘린더 연동 (프리미엄)" / "할 일을 구글 캘린더에 동기화하려면 프리미엄 구독이 필요합니다", 연동 완료 "구글 캘린더 연동이 완료됐습니다", 저장 실패 "구글 캘린더를 다시 연결해주세요", 해제 완료 "구글 캘린더 연동이 해제되었습니다", 부분 실패 "일부 이벤트가 남아있습니다" / "연동은 해제됐지만 일부 이벤트가 구글 캘린더에 그대로 남아있을 수 있습니다. 직접 삭제해주세요", 시트 줄 "구글 캘린더 · {시각|종일|전날부터 이어짐}".
- 앱에 웹 결제로 유도하는 문구·링크 금지(Apple 3.1.1). 구독 경로는 AI 플랜처럼 `navigation.navigate("Account")`.
- 앱 알림은 `Alert.alert`(앱 기존 관례). 앱엔 Sentry 없음 → 예상 못 한 오류는 `console.warn`.
- 테스트에 절대 날짜 하드코딩 대신 시스템 시간 mock. 날짜 키 테스트는 `TZ=America/New_York`로도 실행.
- 서브에이전트 커밋 시 **hooks 우회 금지**(`--no-verify` 금지). pre-commit이 실패하면 고쳐서 다시 커밋.
- 브랜치: PR 1은 `feat/calendar-proxy-app-return`(origin/develop에서), PR 2는 현재 `feat/mobile-calendar-integration`(스펙 커밋 포함).

## Review Focus

1. **AsyncStorage 스냅샷 로드 전 동기화 실행** — 앱 시작 직후 todos가 먼저 오면 빈 스냅샷으로 돌아 삭제 감지를 놓친다. 로드 완료 전엔 아무 요청도 안 보내야 한다 → Task 5 테스트.
2. **구독 직후 403 PREMIUM_REQUIRED** — 캐시된 ID 토큰에 클레임이 없어 연결/동기화가 실패한다. 토큰 강제 갱신 후 1회 재시도 → Task 4 테스트.
3. **연결 성공 후 Firestore `connected:true` 쓰기 실패** — 성공 알림을 띄우면 안 되고 "구글 캘린더를 다시 연결해주세요" → Task 4 테스트.
4. **동의 화면 취소·state 만료 시 웹으로 새는 리다이렉트** — `app.` state면 무조건 앱 주소로 → Task 1 테스트.
5. **해제 순서 역전** — todos 무효화가 연동 상태 무효화보다 먼저면 동기화 훅이 전체 upsert → 409 노이즈. 연동 상태 무효화를 await한 뒤 todos 무효화, 이벤트 캐시 제거 → Task 4 테스트.

---

## PR 1 — calendar-proxy 앱 복귀 경로

### Task 1: Worker가 앱 OAuth를 딥링크로 돌려보낸다

먼저 `git fetch origin && git checkout -b feat/calendar-proxy-app-return origin/develop` (이 태스크만 이 브랜치).

**Files:**
- Modify: `calendar-proxy/src/tokenStore.ts` (`createOAuthState`, `OAuthStateRecord`)
- Modify: `calendar-proxy/src/handlers/oauthStart.ts`
- Modify: `calendar-proxy/src/handlers/oauthCallback.ts`
- Create: `calendar-proxy/src/appReturn.ts`
- Test: `calendar-proxy/src/__tests__/oauthStart.test.ts`, `oauthCallback.test.ts`, `tokenStore.test.ts`

**Interfaces:**
- Produces (`appReturn.ts`): `export const APP_RETURN_URL = "tododo://calendar"`; `export const APP_STATE_PREFIX = "app."`; `export const isAppState = (state: string | null): boolean`; `export const appRedirect = (result: "connected" | "error" | "cancelled"): Response` (302, Location `tododo://calendar?calendarConnected=1` / `?calendarError=1` / `?calendarCancelled=1`).
- Produces (`tokenStore.ts`): `createOAuthState(kv, uid, target: { kind: "web"; returnOrigin: string } | { kind: "app" }): Promise<string>` — app이면 반환 state가 `app.` + UUID. 레코드는 `{ uid, returnOrigin }`(web) / `{ uid, target: "app" }`(app). `consumeOAuthState` 반환 타입에 `target?: "app"` 추가. 옛 레코드(`returnOrigin`만)는 web으로 취급.
- HTTP: `GET /oauth/start?client=app` → 앱 대상 state. 그 외는 기존 web 동작.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `oauthStart.test.ts`: `?client=app` 요청(Origin 헤더 없음)이면 `createOAuthState`가 `{kind:"app"}`로 불리고, 응답 `authUrl`의 `state` 파라미터가 `app.`으로 시작. `client=app`이 없고 Origin이 허용 목록이면 `{kind:"web", returnOrigin: origin}`(기존 동작). 프리미엄 아님 → 403 그대로.
  - `oauthCallback.test.ts` (기존 테스트 유지 + 추가):
    - `consumeOAuthState` → `{uid, target:"app"}`, 교환 성공 → Location `tododo://calendar?calendarConnected=1`.
    - 같은 레코드, 교환 실패(throw) → `tododo://calendar?calendarError=1`.
    - `?error=access_denied&state=app.xxx`(code 없음) → `tododo://calendar?calendarCancelled=1`, `exchangeCodeForTokens` 미호출. state 소비는 시도해 KV에서 지운다.
    - `?code=c&state=app.xxx`에 `consumeOAuthState` → null(만료) → `tododo://calendar?calendarError=1`.
    - `?error=access_denied&state=<uuid, 접두사 없음>` → 기존처럼 `${CLIENT_APP_URL}/calendar?calendarError=1`.
    - 옛 레코드 `{uid, returnOrigin:"http://localhost:5173"}` → `http://localhost:5173/calendar?calendarConnected=1` (기존 테스트가 이미 커버하면 그대로 둠).
  - `tokenStore.test.ts`: app 대상 state가 `app.` 접두사 + 저장 레코드 `target:"app"`; web 대상은 접두사 없음.

- [ ] **Step 2: 실패 확인** — `cd calendar-proxy && npx vitest run src/__tests__/oauthStart.test.ts src/__tests__/oauthCallback.test.ts src/__tests__/tokenStore.test.ts` → 새 케이스 FAIL.

- [ ] **Step 3: 구현** — 콜백 판정 순서: state 없음 → 웹 오류; `error` 파라미터 있거나 code 없음 → state 소비 시도 후, `isAppState(state)`면 `appRedirect("cancelled")`(error=access_denied일 때) 또는 `appRedirect("error")`, 아니면 웹 오류; 소비 실패 → app 접두사면 `appRedirect("error")` 아니면 웹 오류; 성공 경로는 `target === "app"`이면 `appRedirect`, 아니면 기존 `returnOrigin`. 기존 주석 톤 유지, 왜 접두사로 판정하는지(취소·만료 때 레코드가 없을 수 있음, 고정 주소만 고르므로 오픈 리다이렉트 아님) 주석.

- [ ] **Step 4: 통과 확인** — `cd calendar-proxy && npx vitest run && npx tsc --noEmit` → 전부 PASS. 루트 `@types/node` 누수 주의(메모리: Worker엔 Buffer 금지).

- [ ] **Step 5: 커밋 + PR**
```bash
git add calendar-proxy/src
git commit -m "feat(calendar-proxy): 앱에서 시작한 OAuth를 tododo://calendar 딥링크로 복귀"
```
PR 생성(`develop` 대상)까지만. 병합·main 릴리스는 사용자 승인 후(스펙: 이 PR을 먼저 main으로 릴리스해 CI 자동 배포). 이후 `git checkout feat/mobile-calendar-integration`.

---

## PR 2 — core 공유 + 웹 리팩터링 + 앱

### Task 2: core `calendarSync` 모듈

**Files:**
- Create: `packages/core/src/calendarSync/{types.ts,errors.ts,responses.ts,plan.ts,snapshot.ts,overlay.ts,index.ts}`
- Create: `packages/core/src/calendarSync/__tests__/{responses.test.ts,plan.test.ts,snapshot.test.ts,overlay.test.ts}`

**Interfaces (Produces, 모두 `@tododo/core/dist/calendarSync/index.js`):**
- types: `SyncTodoPayload`, `SyncTodoResult`, `GoogleCalendarEvent`, `DisconnectResult` — 웹 `client/src/features/calendarIntegration/api/calendarProxyApi.ts`의 정의를 그대로 이동(주석 포함). `SyncedSnapshotEntry`, `SyncSnapshot = Map<string, SyncedSnapshotEntry>`, `CalendarIntegrationStatus { connected: boolean; status: "active" | "revoked" }`.
- errors: `CalendarRevokedError`, `CalendarNotConnectedError` (웹에서 이동, `name` 유지).
- responses: `parseSyncResponse(res: Response): Promise<SyncTodoResult[]>`, `parseEventsResponse(res: Response): Promise<GoogleCalendarEvent[]>`, `parseDisconnectResponse(res: Response): Promise<DisconnectResult>`, `parseOAuthStartResponse(res: Response): Promise<string>`. 판정 규칙·오류 메시지는 웹 함수와 동일(401 revoked → `CalendarRevokedError`, sync 409 not_connected → `CalendarNotConnectedError`, 그 외 non-ok → `Error("동기화 실패: <status>")` 등 기존 문자열).
- plan: `isSyncEligible(todo: Todo): boolean`; `planCalendarSync(todos: Todo[], snapshot: SyncSnapshot): { upserts: SyncTodoPayload[]; deletes: SyncTodoPayload[]; eligibleById: Map<string, Todo> }`; `applySyncResults(results: SyncTodoResult[], eligibleById: Map<string, Todo>, existingTodoIds: Set<string>, snapshot: SyncSnapshot): { firestoreUpdates: { todoId: string; googleEventId: string | null }[] }` — 스냅샷을 제자리 갱신(웹과 같은 의미), 오류 항목은 스냅샷 불변. 규칙은 웹 `useSyncTodosToCalendar.ts`의 upsert/delete/결과 반영 블록 그대로. `dueAt` 변환은 `../insights/date`의 `toDateKeyFromISO`.
- snapshot: `serializeSnapshot(s: SyncSnapshot): string`, `deserializeSnapshot(raw: string | null): SyncSnapshot`(손상·null → 빈 Map, throw 안 함), `snapshotStorageKey(uid: string): string`(= `calendarSyncSnapshot:${uid}`), `findOrphanGoogleEventIds(snapshot, tracked: Iterable<string>): string[]`(웹에서 이동).
- overlay: `filterUnsyncedEvents(events: GoogleCalendarEvent[], todos: Todo[]): GoogleCalendarEvent[]`, `isDateInGoogleEventRange(dateKey: string, event: {start: string; end: string}): boolean`(웹 `dashboard/utils/calendarUtils.ts`에서 이동), `formatGoogleEventTime(start: string, dateKey: string): string`(웹 `calendar.tsx`에서 이동, "종일"/"전날부터 이어짐"/`toLocaleTimeString("ko-KR",{hour:"numeric",minute:"2-digit"})`), `getGoogleEventDateKeys(event, rangeStartKey, rangeEndKeyExclusive): string[]`(점 표시용, 범위로 잘라냄).

- [ ] **Step 1: 실패하는 테스트 작성** — 웹 `useSyncTodosToCalendar.test.tsx`·`calendarProxyApi.test.ts`·`calendarUtils.test.ts`의 판단 케이스를 순수 함수 테스트로 옮긴다. 최소:
  - `planCalendarSync`: googleEventId 없음 → upsert(googleEventId null); 스냅샷 updatedAt 같고 id 있음 → 제외; updatedAt 다름 → upsert에 **Firestore id**(스냅샷 id 아님); archived·dueAt 없음 → 대상 아님; 스냅샷에만 있고 id 있음 → delete; dueAt `2026-03-01T15:30:00.000Z`가 KST에서 `"2026-03-02"`, New York에서 `"2026-03-01"`(실행 TZ의 로컬 날짜 키와 같은지로 단언).
  - `applySyncResults`: 성공 upsert → 스냅샷 set, id 바뀌면 firestoreUpdates; 오류 항목 → 스냅샷·업데이트 없음; delete 성공 + 문서 존재 → `{todoId, googleEventId:null}`; delete 성공 + 문서 없음 → 스냅샷만 삭제.
  - responses: 401 `{error:"revoked"}` → `CalendarRevokedError`; 409 `{error:"not_connected"}` → `CalendarNotConnectedError`; 500 → `Error`; disconnect 본문 없음 → `{deletedGoogleEventIds: []}`.
  - snapshot: 왕복 직렬화, `"not json"` → 빈 Map, 고아 탐지.
  - overlay: 동기화된 id 제외, 종일·시각·이어짐 문구, 자정 종료 이벤트가 다음 날 포함 안 됨, 여러 날 이벤트 키가 범위로 잘림.
- [ ] **Step 2: 실패 확인** — `cd packages/core && npx vitest run src/calendarSync` → FAIL(모듈 없음).
- [ ] **Step 3: 구현** — 위 시그니처대로. React·Firebase import 금지(순수).
- [ ] **Step 4: 통과 확인** — `cd packages/core && npx vitest run && TZ=America/New_York npx vitest run src/calendarSync && npm run build` → PASS, `dist/calendarSync/index.js` 생성.
- [ ] **Step 5: 커밋** — `git commit -m "feat(core): 캘린더 동기화 판단·응답 해석·오버레이 헬퍼를 core로"`

### Task 3: 웹을 core로 전환 (동작 불변)

**Files:**
- Modify: `client/src/features/calendarIntegration/api/calendarProxyApi.ts`(fetch만 남기고 해석·타입·오류는 core에서 import 후 re-export)
- Modify: `client/src/features/calendarIntegration/hooks/useSyncTodosToCalendar.ts`(판단부를 `planCalendarSync`/`applySyncResults`로; 88~91행 stale 주석을 실제 동작 — Firestore id만 사용, 삭제 이벤트는 tombstone이고 Worker가 `status:"confirmed"`로 복원 — 으로 고침)
- Modify: `client/src/features/calendarIntegration/hooks/syncSnapshot.ts`(localStorage 접근만, 직렬화·키·고아 탐지는 core)
- Modify: `client/src/features/dashboard/utils/calendarUtils.ts`(`isDateInGoogleEventRange` re-export), `client/src/features/dashboard/components/calendar.tsx`(`formatGoogleEventTime`, 오버레이 필터를 core로)

**Interfaces:** Consumes Task 2 전부. 웹 공개 export 이름(`CalendarRevokedError` 등)은 그대로 유지해 다른 import가 안 깨지게.

- [ ] **Step 1: 기존 테스트 기준선** — `cd client && VITE_FIREBASE_API_KEY= npx vitest run src/features/calendarIntegration src/features/dashboard` → PASS(변경 전).
- [ ] **Step 2: 리팩터링** — 위 파일 수정. 이동한 로직의 단위 테스트가 core에 생겼으므로 웹 테스트는 삭제하지 말고 그대로 둔다(통합 동작 검증).
- [ ] **Step 3: 통과 확인** — `cd client && VITE_FIREBASE_API_KEY= npx vitest run && npx tsc -b --noEmit` (또는 프로젝트의 typecheck 스크립트) → 전부 PASS. 로컬 `VITE_BILLING_ENABLED=true`면 aiPlanModal 테스트가 실패하는 기존 함정 — 해당 env를 비우고 실행.
- [ ] **Step 4: 커밋** — `git commit -m "refactor(client): 캘린더 연동 판단 로직을 core calendarSync로 전환"`

### Task 4: 앱 연동 API·상태·연결·해제

**Files:**
- Modify: `mobile/app.json`(`"scheme": "tododo"`, plugins에 `expo-web-browser` 필요 시), `mobile/package.json`(`npx expo install expo-web-browser`)
- Modify: `mobile/.env`(로컬, 커밋 안 됨이면 건드리기만), env 예시/문서가 있으면 `EXPO_PUBLIC_CALENDAR_PROXY_URL` 추가
- Create: `mobile/src/calendarIntegration/{calendarProxyApi.ts,snapshotStorage.ts,markCalendarRevoked.ts,useCalendarIntegration.ts,index.ts}`
- Test: `mobile/src/calendarIntegration/__tests__/{calendarProxyApi.test.ts,useCalendarIntegration.test.tsx,snapshotStorage.test.ts}`

**Interfaces:**
- Consumes: core `calendarSync` 전부; `auth`, `db` from `../firebase`; `useIsPremium` from `../premium`.
- Produces:
  - `calendarProxyApi.ts`: `getOAuthStartUrl(): Promise<string>`(`/oauth/start?client=app`), `syncTodosToCalendar(todos: SyncTodoPayload[]): Promise<SyncTodoResult[]>`, `getGoogleCalendarEvents(range: {timeMin: string; timeMax: string}): Promise<GoogleCalendarEvent[]>`, `disconnectCalendar(ids: string[]): Promise<DisconnectResult>`. 공통 내부 `authorizedFetch(path, init)`: `process.env.EXPO_PUBLIC_CALENDAR_PROXY_URL`을 함수 안에서 읽음(없으면 throw), ID 토큰 Bearer, 403 + `PREMIUM_REQUIRED`면 `getIdToken(true)`로 1회 재시도(`aiProxyApi.ts`의 `isPremiumRequired` 방식).
  - `snapshotStorage.ts`: `loadSnapshot(uid): Promise<SyncSnapshot>`, `saveSnapshot(uid, s): Promise<void>`, `clearSnapshot(uid): Promise<void>` — AsyncStorage, 전부 throw 안 함.
  - `markCalendarRevoked(queryClient): Promise<void>` — 웹과 동일 의미, 절대 throw 안 함(`console.warn`).
  - `useCalendarIntegrationStatus()` — key `["calendarIntegration", uid]`, `enabled: !!uid && isPremium`.
  - `useConnectCalendar(): { connect: () => Promise<"connected" | "cancelled" | "error" | "saveFailed"> }` — `WebBrowser.openAuthSessionAsync(authUrl, "tododo://calendar")`; `type==="success"`면 URL 쿼리로 판정; connected면 Firestore `calendarIntegrations/{uid}`에 `{connected:true, connectedAt: new Date().toISOString(), status:"active"}` merge 후 상태 무효화 — 쓰기 실패면 `"saveFailed"`. `cancel`/`dismiss`/`calendarCancelled` → `"cancelled"`.
  - `useDisconnectCalendar(): { disconnect: (todosWithEvent: {id: string; googleEventId: string}[], orphanIds?: string[]) => Promise<{ allDeleted: boolean }> }` — 웹 `useDisconnectCalendar` 순서 그대로, todos 키는 `["todos", uid]`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - api: URL에 `client=app`; 403 PREMIUM_REQUIRED → 토큰 강제 갱신 후 재시도 1회(두 번째 성공 시 결과 반환, 2회째도 403이면 오류); env 없음 → reject.
  - connect: success+`calendarConnected=1` → setDoc 호출 인자 단언, `"connected"`; success+`calendarError=1` → `"error"`, setDoc 미호출; `{type:"cancel"}` → `"cancelled"`; `calendarCancelled=1` → `"cancelled"`; setDoc reject → `"saveFailed"`.
  - disconnect: 삭제 확인된 id만 `googleEventId:null` batch; `connected:false` 쓰기 → `["calendarIntegration", uid]` 무효화가 **resolve된 뒤에** `["todos", uid]` 무효화(호출 순서 단언); `["googleCalendarEvents"]` removeQueries; 일부만 삭제 → `allDeleted:false`.
  - snapshotStorage: AsyncStorage throw → 빈 Map / 조용히 통과.
- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/calendarIntegration` → FAIL.
- [ ] **Step 3: 구현** — 위 시그니처. `expo-web-browser`는 jest에서 mock.
- [ ] **Step 4: 통과 확인** — `cd mobile && npx jest src/calendarIntegration && npx tsc --noEmit` → PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(mobile): 구글 캘린더 연결·해제·상태 API (딥링크 복귀)"`

### Task 5: 앱 동기화 훅

**Files:**
- Create: `mobile/src/calendarIntegration/useSyncTodosToCalendar.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx`(로그인 분기에 `<CalendarSync />` — `EntitlementSync`와 같은 패턴)
- Test: `mobile/src/calendarIntegration/__tests__/useSyncTodosToCalendar.test.tsx`

**Interfaces:**
- Consumes: Task 2 `planCalendarSync`/`applySyncResults`/오류 타입, Task 4 api·snapshotStorage·`markCalendarRevoked`·`useCalendarIntegrationStatus`, `useTodos`(`["todos", uid]`), `db`/`writeBatch`.
- Produces: `useSyncTodosToCalendar(): void`.

동작은 웹 훅과 같다(재진입 대기 후 1회 재실행, 해제 시 스냅샷·이벤트 캐시 제거, 옛 스냅샷 역저장 가드, revoked → `markCalendarRevoked`, 409 → 상태 재조정 후 여전히 connected면 `connected:false` 기록). 차이: 스냅샷은 `useEffect`에서 `loadSnapshot(uid)` 완료 후 `snapshotReady` 상태를 true로 — **ready 전엔 동기화 안 함**. uid가 바뀌면 다시 로드.

- [ ] **Step 1: 실패하는 테스트 작성**
  - 스냅샷 로드가 pending인 동안 todos·connected가 준비돼도 `syncTodosToCalendar` 미호출; resolve 후 1회 호출.
  - 스냅샷에 있던 할 일이 todos에서 사라지면 delete 페이로드 전송.
  - 결과의 googleEventId를 Firestore batch.update로 기록, 스냅샷 저장.
  - `connected:false` → `clearSnapshot(uid)` + `removeQueries(["googleCalendarEvents"])`, 요청 없음.
  - `CalendarRevokedError` → `markCalendarRevoked` 호출; `CalendarNotConnectedError` → 상태 무효화 후 connected면 setDoc `{connected:false, status:"active"}`.
  - 무료(`isPremium:false`) → 요청 없음.
- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/calendarIntegration/__tests__/useSyncTodosToCalendar.test.tsx` → FAIL.
- [ ] **Step 3: 구현 + RootNavigator 마운트**
- [ ] **Step 4: 통과 확인** — `cd mobile && npx jest && npx tsc --noEmit` → 전부 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(mobile): 할 일을 구글 캘린더에 단방향 동기화"`

### Task 6: 앱 캘린더 화면 — 연결 줄·회색 점·시트

**Files:**
- Create: `mobile/src/calendarIntegration/useGoogleCalendarEvents.ts`, `mobile/src/calendarIntegration/components/CalendarConnectionBar.tsx`
- Modify: `mobile/src/shared/utils/calendarMarkers.ts`(구글 점 병합 함수), `mobile/src/hooks/useCalendarTodos.ts` 또는 `CalendarScreen.tsx`(오버레이 결합), `mobile/src/screens/CalendarScreen.tsx`, `mobile/src/shared/ui/dateTodosSheet/DateTodosSheet.tsx`(`googleEvents` prop)
- Test: `mobile/src/calendarIntegration/__tests__/{useGoogleCalendarEvents.test.tsx,CalendarConnectionBar.test.tsx}`, `mobile/src/shared/utils/__tests__/calendarMarkers.test.ts`(있으면 확장), `mobile/src/screens/__tests__/CalendarScreen.test.tsx`, DateTodosSheet 테스트

**Interfaces:**
- Consumes: Task 2 `filterUnsyncedEvents`/`isDateInGoogleEventRange`/`formatGoogleEventTime`/`getGoogleEventDateKeys`; Task 4 hooks; `markCalendarRevoked`.
- Produces:
  - `useGoogleCalendarEvents(range: { start: string; end: string } | null)` — key `["googleCalendarEvents", start, end]`, `staleTime: 60_000`, revoked면 `markCalendarRevoked` 후 재시도 안 함, `enabled: !!range && connected && status !== "revoked"`(웹 훅과 동일).
  - `addGoogleEventDots(marked: CalendarMarkedDates, eventDateKeys: Iterable<string>): CalendarMarkedDates` — 각 날짜에 `{ key: "google", color: colors.text.tertiary, selectedDotColor: <선택 배경 위 보이는 색> }`를 **한 번만** 추가, 기존 overdue 단일 점 정책과 무관하게 붙음, 불변.
  - `DateTodosSheet`에 `googleEvents?: GoogleCalendarEvent[]` + `dateKey` 필요 시 prop — 할 일 아래 "구글 캘린더 · {formatGoogleEventTime}" 줄, 버튼 역할 아님; 할 일 0개 + 구글 일정 있음이면 빈 상태 대신 목록.
  - `CalendarConnectionBar` — 무료: 잠금 제목/설명(Global Constraints 문구) + 「구독 알아보기」 → `navigate("Account")`; 엔타이틀먼트 로딩 중: 빈 자리(높이 고정, 깜빡임 없음); 미연동: 「구글 캘린더 연동」; 연동: 「연동 해제」; revoked: 안내 문구 + 「연동 해제」. 결과 처리: `connected` → `Alert.alert("연동 완료", "구글 캘린더 연동이 완료됐습니다")`, `error` → `Alert.alert("연동 실패", "구글 캘린더 연동 중 오류가 발생했습니다")`, `saveFailed` → `Alert.alert("연동 상태 저장 실패", "구글 캘린더를 다시 연결해주세요")`, `cancelled` → 무반응. 해제 결과 문구는 Global Constraints. 진행 중 버튼 비활성.
- 범위: `CalendarScreen`이 보이는 달을 상태로 들고(`onMonthChange`, 초기값 오늘이 속한 달), 범위는 그 달 1일 로컬 0시 ~ 다음 달 1일 로컬 0시(ISO, end 배타). 앞뒤 달 회색 날짜엔 점 안 찍음(설계자 판단).
- 오버레이 조회 실패는 화면 오류로 만들지 않는다(점·줄만 없음).

- [ ] **Step 1: 실패하는 테스트 작성**
  - `addGoogleEventDots`: 같은 날 이벤트 3개 → google 점 1개; overdue 날짜에도 google 점 추가; 원본 불변.
  - `CalendarConnectionBar`: 각 상태별 렌더 텍스트, 무료 버튼 → `navigate("Account")`, 각 connect 결과별 Alert 인자, 진행 중 두 번 눌러도 connect 1회.
  - `CalendarScreen`: 연동 + 이벤트(동기화된 id 하나 포함) → 동기화된 건 점·시트에서 제외, 나머지는 `calendar-dot-<date>-google`; 달 이동 시 새 범위로 조회; 이벤트 조회 실패여도 할 일 달력 표시.
  - `DateTodosSheet`: "구글 캘린더 · 종일" 줄, 할 일 0개여도 구글 줄 보임, 줄이 button 역할 아님.
- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/calendarIntegration src/screens/__tests__/CalendarScreen.test.tsx src/shared` → FAIL.
- [ ] **Step 3: 구현** — 연결 줄은 달력 영역 위(`calendarArea` 밖)에 둬서 기존 `onLayout` 높이 측정이 남은 높이를 그대로 재게 한다.
- [ ] **Step 4: 통과 확인** — `cd mobile && npx jest && npx tsc --noEmit` → 전부 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(mobile): 캘린더 화면에 구글 연동 줄과 읽기 전용 일정 표시"`

### Task 7: 실기 확인 (사람 + 메인 세션, 서브에이전트 아님)

전제: PR 1이 main으로 릴리스돼 운영 Worker에 반영됨(CI calendar-proxy job 성공 확인). 스킴·`expo-web-browser` 추가로 dev client 재빌드 필요(IAP 이후 어차피 필요).

- [ ] 운영 Worker에 `curl -sI "<운영 URL>/oauth/callback?error=access_denied&state=app.x"` → `Location: tododo://calendar?calendarCancelled=1`.
- [ ] iOS 시뮬레이터(실행 중인 기기 `ps`로 확인 — 같은 이름 두 대 함정): 무료 계정 잠금 줄 → 계정 화면; 프리미엄 계정 연결 → 앱 복귀 + 완료 알림; 동의 화면 취소 → 조용히 복귀.
- [ ] 앱에서 할 일 생성·마감 변경·보관·삭제 → 구글 캘린더 반영; 구글 일정 회색 점·시트 줄; 달 이동.
- [ ] 웹에서 같은 계정이 연동 상태로 보이고 중복 이벤트 없음.
- [ ] 앱에서 해제 → 구글 이벤트 삭제, 앱 캘린더에 유령 없음.
- [ ] EAS env `EXPO_PUBLIC_CALENDAR_PROXY_URL` 등록(출시 전, 사용자). Android는 IAP 실측 때.
