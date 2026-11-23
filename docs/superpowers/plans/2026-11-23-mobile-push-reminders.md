# 앱(iOS) 서버 푸시 마감 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPhone 앱이 FCM 토큰을 reminder-proxy에 등록하게 해서 웹과 같은 서버 예약으로 마감 알림 푸시를 받게 한다. 앱 안에 기본값 설정, 할 일별 알림 시점, 알림 기록 화면을 웹과 동일하게 만들고, 기존 로컬 알림은 제거한다.

**Architecture:** 앱에 `@react-native-firebase/messaging`(토큰·수신·탭 처리 전용)을 추가한다. 데이터는 기존 Firebase JS SDK를 그대로 쓴다. Worker는 `ios` 플랫폼을 허용하고 모든 FCM 메시지에 `apns` 블록을 붙이는 것만 바꾼다. 웹과 공유할 순수 로직(예약 지문, 선택지 변환, 상대 시각)은 `@tododo/core/reminders`로 옮긴다. 앱 쪽 코드는 `mobile/src/reminders/`에 웹 `features/reminders`와 같은 구조로 둔다.

**Tech Stack:** Expo 57 / React Native, `@react-native-firebase/app`·`messaging`(modular API), TanStack Query, React Navigation native-stack, Jest(mobile) / Vitest(core·client·reminder-proxy), Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-11-23-mobile-push-reminders-design.md`

## Global Constraints

- 브랜치는 `feat/mobile-push-reminders`이고 기준은 origin/develop(aecb80f)다. PR 대상은 `develop`이다.
- 커밋에 `--no-verify` 등 hooks 우회를 쓰지 않는다. 명령은 포그라운드에서 끝나는 것만 쓴다(watch·dev 서버 금지).
- 알림 선택지·문구는 core 상수를 그대로 쓴다: `REMINDER_OFFSETS = [0,10,30,60,1440]`, `DEFAULT_REMINDER_SETTING = 30`, `reminderSettingLabel`, `reminderBody`. 앱에서 새 문구를 만들지 않는다.
- 사용자 기본값 저장 위치는 `userSettings/{uid}.reminderDefaultOffsetMinutes`, 할 일별 값은 `todos/{id}.reminderOffsetMinutes`(`ReminderSetting | null`, null = 기본값 따름)다.
- Worker 플랫폼 값은 앱이 `Platform.OS`를 보내고, Worker는 `"web"`과 `"ios"`만 허용한다(`"android"`는 이번 범위 밖).
- 앱의 reminder-proxy 주소는 기존 `EXPO_PUBLIC_REMINDER_PROXY_URL`이다. 비어 있으면 등록·refresh·기록 호출을 조용히 건너뛴다(웹과 같다). 탈퇴 경로만 예외로 던진다(기존 동작 유지).
- 앱 지원 기기는 iPhone 전용이다. iPad는 대상이 아니다.
- 웹 동작은 바꾸지 않는다. 웹 코드 변경은 core로 옮긴 함수의 import 경로 수정뿐이다.
- 테스트 시간은 고정한다. 절대 날짜를 하드코딩하지 말고 시스템 시간을 mock한다. 커밋 전에 core·client는 `TZ=America/New_York`로도 한 번 돌린다.
- client 테스트는 CI와 같게 `VITE_FIREBASE_API_KEY= npx vitest run`으로 확인한다.
- Worker 타입체크는 루트 `@types/node`가 섞일 수 있다. Worker 코드에 `Buffer`를 쓰지 않는다(`btoa`/`atob` 사용).

## Review Focus

1. **오프라인 로그아웃 → 다른 계정 로그인**: 앞 계정 토큰이 새 계정에 등록되면 안 된다. 기기 토큰을 지우기 전에는 등록하지 않아야 한다. (Task 5 `pushClient.test.ts` "pending device delete blocks register")
2. **알림 탭이 로그인·네비게이션 준비 전에 들어옴**(앱 종료 상태에서 탭): 준비된 뒤 상세로 한 번 이동해야 하고, 무시되거나 두 번 이동하면 안 된다. (Task 6 `useNotificationNavigation.test.tsx` "queues until ready")
3. **권한이 없거나 거절된 기기**: 토큰 동기화·포그라운드 구독은 아무것도 하지 않는다. refresh 신호는 계속 보낸다(다른 기기가 받을 수 있다). (Task 5·6 테스트)
4. **기존 로컬 예약이 남은 개발 빌드**: 업데이트 후 첫 실행에서 한 번 모두 취소해서 푸시와 이중으로 울리지 않아야 한다. (Task 7 `legacyLocalReminders.test.ts`)
5. **할 일 수정에서 알림 선택만 바꿈**: 지문이 바뀌어 refresh가 가야 하고, 반복 시리즈 수정에도 값이 전달돼야 한다. (Task 3 지문 테스트, Task 9 폼/상세 테스트)

---

## File Structure

| 파일 | 책임 |
|---|---|
| `mobile/app.json`, `mobile/package.json`, `mobile/jest.setup.js` | RNFirebase 설치·plugin·static frameworks, jest 목 |
| `reminder-proxy/src/router.ts`, `fcm.ts` | ios 허용, apns 블록 |
| `packages/core/src/reminders/index.ts` | 지문·선택지·상대시각 공용 함수 추가 |
| `packages/core/src/types/todo.ts` | `TodoFields.reminderOffsetMinutes` 추가 |
| `client/src/features/reminders/**` | core 함수 import로 교체(동작 무변경) |
| `mobile/src/reminders/api/reminderProxyApi.ts` | Worker 호출 |
| `mobile/src/reminders/api/reminderSettingsApi.ts` | 기본값 Firestore 읽기·쓰기 |
| `mobile/src/reminders/hooks/useReminderSettings.ts`, `useReminderHistory.ts` | 쿼리 훅 |
| `mobile/src/reminders/push/pushClient.ts`, `releasePending.ts` | 권한·토큰·해제 대기 |
| `mobile/src/reminders/hooks/usePushTokenSync.ts`, `useReminderRefresh.ts`, `useForegroundReminders.ts`, `useNotificationNavigation.ts` | 앱 수준 훅 |
| `mobile/src/reminders/components/ReminderBanner.tsx` | 포그라운드 배너 |
| `mobile/src/reminders/components/ReminderPromptProvider.tsx` | 권한 안내 |
| `mobile/src/reminders/legacyLocalReminders.ts` | 옛 로컬 예약 1회 취소 |
| `mobile/src/reminders/index.ts` | 배럴 |
| `mobile/src/screens/NotificationsScreen.tsx` | 알림 화면 |
| `mobile/src/navigation/RootNavigator.tsx`, `types.ts`, `navigationRef.ts` | 벨 헤더, Notifications 라우트, 훅 마운트 |
| `mobile/src/shared/ui/reminderField/ReminderField.tsx` | 폼용 알림 선택 |
| `mobile/src/screens/TodoFormScreen.tsx`, `TodoDetailScreen.tsx`, `AccountScreen.tsx` | 필드 연결, 계정 링크 |
| `mobile/src/auth/signOut.ts`, `mobile/src/account/deleteAccount.ts` | 토큰 해제 |
| 삭제: `mobile/src/notifications/**` | 로컬 알림 제거 |

---

### Task 1: 네이티브 구성(RNFirebase) + 빌드 게이트

**Files:**
- Modify: `mobile/package.json`, `mobile/package-lock.json`, `mobile/app.json`, `mobile/jest.setup.js`

**Interfaces:**
- Produces: `@react-native-firebase/messaging` modular API(`getMessaging`, `getToken`, `deleteToken`, `onTokenRefresh`, `onMessage`, `onNotificationOpenedApp`, `getInitialNotification`, `requestPermission`, `hasPermission`, `AuthorizationStatus`)를 앱 코드와 jest에서 import할 수 있다. jest 목은 각 함수를 `jest.fn()`으로 노출한다. 테스트는 `jest.requireMock("@react-native-firebase/messaging")`로 꺼낸다.

- [ ] **Step 1:** `cd mobile && npx expo install @react-native-firebase/app @react-native-firebase/messaging`를 실행한다. Expo 57과 호환되는 버전이 고정된다.
- [ ] **Step 2:** `app.json`의 `plugins`에 `"@react-native-firebase/app"`과 `"@react-native-firebase/messaging"`을 추가한다. 기존 `expo-build-properties` 항목의 `ios`에는 `"useFrameworks": "static"`을 추가한다(`enableSceneSupport`는 유지). RNFirebase 문서가 Expo에서 요구하는 추가 iOS 설정이 있으면(예: `forceStaticLinking`, `buildReactNativeFromSource`) 문서에 맞춰 같은 항목에 넣고, 커밋 메시지에 근거 링크를 적는다.
- [ ] **Step 3:** `jest.setup.js`에 `@react-native-firebase/app`과 `@react-native-firebase/messaging` 전역 목을 추가한다(위 Interfaces의 함수 전부, `AuthorizationStatus = { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2, EPHEMERAL: 3 }`). 기존 Sentry 목과 같은 주석 스타일로 쓴다.
- [ ] **Step 4:** `cd mobile && npx expo config --type introspect > /dev/null && echo OK`를 실행한다. 기대 결과: `OK`(plugin 해석 오류 없음).
- [ ] **Step 5:** `cd mobile && npx jest && npx tsc --noEmit`를 실행한다. 기대 결과: 모두 통과.
- [ ] **Step 6:** 커밋한다: `chore(mobile): RNFirebase messaging 추가 및 iOS static frameworks 설정`
- [ ] **Step 7: 게이트(사람 확인).** 컨트롤러가 사용자에게 EAS development-device 재빌드 동의를 받는다. 빌드가 실패하거나(정적 프레임워크 충돌 등) 앱이 실행 즉시 종료되면, 여기서 멈추고 원인을 보고한다. 이 게이트가 통과될 때까지 Task 5~9의 실기 검증은 보류한다(단위 테스트 작업은 진행 가능).

### Task 2: Worker — ios 허용 + APNs 블록

**Files:**
- Modify: `reminder-proxy/src/router.ts`, `reminder-proxy/src/fcm.ts`
- Test: `reminder-proxy/src/__tests__/router.test.ts`, `reminder-proxy/src/__tests__/fcm.test.ts`

**Interfaces:**
- Consumes: 기존 `PushMessage`(`ttlSeconds` 포함), `sendPush(projectId, accessToken, message, fetchFn?)`
- Produces: 등록 API가 `platform: "ios"`를 받아들인다. FCM 요청 본문의 `message.apns`가 `{ headers: { "apns-expiration": String(<epoch 초>), "apns-priority": "10" }, payload: { aps: { sound: "default" } } }` 모양이 된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.**
  - `router.test.ts`: `"registers ios token"`: POST `/push-tokens` `{token:"t", platform:"ios"}` → 204, scheduler.registerToken이 `(uid,"t","ios")`로 불린다. `"rejects android"`: `platform:"android"` → 400.
  - `fcm.test.ts`: `"includes apns block with expiration from ttl"`: 시스템 시간을 `vi.setSystemTime(1_800_000_000_000)`으로 두고 `ttlSeconds: 600`이면 `apns.headers["apns-expiration"] === "1800000600"`, `apns-priority === "10"`, `apns.payload.aps.sound === "default"`, `webpush` 블록은 그대로 있다.
- [ ] **Step 2:** `cd reminder-proxy && npx vitest run src/__tests__/router.test.ts src/__tests__/fcm.test.ts`를 실행한다. 새 테스트가 FAIL해야 한다.
- [ ] **Step 3:** `PLATFORMS`에 `"ios"`를 추가한다. `sendPush` 본문에 `apns` 블록을 추가한다. expiration은 `Math.floor(Date.now() / 1000) + message.ttlSeconds`다. 주석으로 "FCM은 해당 플랫폼 블록만 쓴다 — 메시지 하나로 웹·iOS 모두 보낸다"를 남긴다.
- [ ] **Step 4:** `cd reminder-proxy && npx vitest run && npx tsc --noEmit`를 실행한다. 기대 결과: 전부 PASS.
- [ ] **Step 5:** 커밋한다: `feat(reminder-proxy): iOS 토큰 등록 허용 및 APNs 만료 헤더 추가`

### Task 3: core — 공용 함수 이동 + TodoFields

**Files:**
- Modify: `packages/core/src/reminders/index.ts`, `packages/core/src/types/todo.ts`
- Modify: `client/src/features/reminders/hooks/useReminderRefresh.ts`, `client/src/features/reminders/utils/reminderChoice.ts`, `client/src/features/reminders/utils/timeAgo.ts`(core에서 재노출하거나 import로 교체. 기존 client 테스트는 남겨서 동작 무변경을 보장한다)
- Test: `packages/core/src/reminders/__tests__/` (기존 파일에 추가)

**Interfaces:**
- Produces (from `@tododo/core/dist/reminders/index.js`):
  - `buildReminderFingerprint(todos: ReminderFingerprintTodo[]): string`. 여기서 `ReminderFingerprintTodo = { id: string; dueAt: string | null; status: string; archived?: boolean; reminderOffsetMinutes?: unknown }`
  - `REMINDER_SETTING_OPTIONS: { value: string; label: string }[]`
  - `toReminderChoice(value: unknown): string`
  - `parseReminderSetting(value: string | undefined): ReminderSetting | null`
  - `formatTimeAgo(sentAt: number, now: number): string`
- Produces (core types): `TodoFields`에 `reminderOffsetMinutes?: ReminderSetting | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다.** client의 기존 `reminderChoice`/`timeAgo`/지문 테스트 케이스를 core 테스트로 복사한다. 지문에는 추가 케이스를 넣는다: `"changes when only reminderOffsetMinutes changes"`(30 → "off"면 다른 문자열), `"ignores todos without dueAt"`, `"order independent"`.
- [ ] **Step 2:** `cd packages/core && npx vitest run src/reminders`를 실행한다. FAIL해야 한다.
- [ ] **Step 3:** 함수를 core로 옮기고(로직은 client 그대로), client 파일은 core에서 재노출하거나 import로 바꾼다. `TodoFields`에 필드를 추가한다.
- [ ] **Step 4:** `cd packages/core && npm run build && npx vitest run && TZ=America/New_York npx vitest run`, 이어서 `cd client && VITE_FIREBASE_API_KEY= npx vitest run src/features/reminders && npx tsc --noEmit -p .`를 실행한다. 기대 결과: 전부 PASS.
- [ ] **Step 5:** 커밋한다: `refactor(core): 알림 지문·선택지·상대시각을 core로 이동(웹 동작 무변경)`

### Task 4: 앱 API·설정·기록 훅

**Files:**
- Create: `mobile/src/reminders/api/reminderProxyApi.ts`, `mobile/src/reminders/api/reminderSettingsApi.ts`, `mobile/src/reminders/hooks/useReminderSettings.ts`, `mobile/src/reminders/hooks/useReminderHistory.ts`, `mobile/src/reminders/index.ts`
- Test: `mobile/src/reminders/__tests__/reminderProxyApi.test.ts`, `mobile/src/reminders/__tests__/useReminderSettings.test.tsx`, `mobile/src/reminders/__tests__/useReminderHistory.test.tsx`

**Interfaces:**
- Consumes: `auth`, `db` from `../firebase`, core `ReminderSetting`, `isReminderSetting`, `DEFAULT_REMINDER_SETTING`
- Produces:
  - `registerPushToken(token: string, platform: string): Promise<void>`
  - `unregisterPushToken(token: string): Promise<void>`
  - `requestReminderRefresh(): Promise<void>`
  - `fetchReminderHistory(): Promise<ReminderHistory>`
  - `markReminderHistorySeen(seenUntil: number): Promise<void>`
  - `ReminderHistory = { items: ReminderHistoryItem[]; lastSeenAt: number }`, `ReminderHistoryItem = { todoId; title; offsetMinutes; dueAt; sentAt }`(웹과 같은 모양)
  - `getReminderDefault(uid: string): Promise<ReminderSetting>`(없거나 이상한 값이면 `DEFAULT_REMINDER_SETTING`)
  - `setReminderDefault(uid: string, value: ReminderSetting): Promise<void>`(`setDoc` merge)
  - 훅: `useReminderDefault()`(키 `["reminderDefault", uid]`), `useSetReminderDefault()`, `useReminderHistory()`(키 `["reminderHistory", uid]`), `useMarkHistorySeen()`, `hasUnreadReminders(history: ReminderHistory | undefined): boolean`(`items.some(i => i.sentAt > lastSeenAt)`)
  - 상수 `REMINDER_HISTORY_KEY = "reminderHistory"`

- [ ] **Step 1: 실패하는 테스트를 쓴다.**
  - `reminderProxyApi.test.ts`: `"register posts token and platform with bearer"`(fetch 목: URL `${EXPO_PUBLIC_REMINDER_PROXY_URL}/push-tokens`, body `{token:"t",platform:"ios"}`, Authorization `Bearer <idToken>`). `"skips silently when url empty"`(fetch 미호출). `"throws on non-ok"`(500 → reject).
  - `useReminderSettings.test.tsx`: `"defaults to 30 when doc missing"`. `"set writes reminderDefaultOffsetMinutes and invalidates"`.
  - `useReminderHistory.test.tsx`: `"hasUnreadReminders true when sentAt > lastSeenAt"`, `"false when empty"`.
- [ ] **Step 2:** `cd mobile && npx jest src/reminders`를 실행한다. FAIL해야 한다.
- [ ] **Step 3:** 구현한다. 인증 fetch는 `calendarProxyApi.ts`의 `authorizedFetch` 패턴을 따른다(프리미엄 재시도는 불필요). URL은 함수 안에서 `process.env.EXPO_PUBLIC_REMINDER_PROXY_URL`로 읽는다.
- [ ] **Step 4:** `cd mobile && npx jest src/reminders && npx tsc --noEmit`를 실행한다. 기대 결과: PASS.
- [ ] **Step 5:** 커밋한다: `feat(mobile): reminder-proxy API·알림 기본값·기록 훅`

### Task 5: 앱 푸시 클라이언트 + 로그아웃/탈퇴 해제

**Files:**
- Create: `mobile/src/reminders/push/pushClient.ts`, `mobile/src/reminders/push/releasePending.ts`
- Modify: `mobile/src/auth/signOut.ts`, `mobile/src/account/deleteAccount.ts`
- Test: `mobile/src/reminders/__tests__/pushClient.test.ts`, 기존 `mobile/src/auth/__tests__/signOut*`, `mobile/src/account/__tests__/deleteAccount*`

**Interfaces:**
- Consumes: Task 4 `registerPushToken`, `unregisterPushToken`, Task 1 messaging 목
- Produces:
  - `type PushPermission = "granted" | "denied" | "undetermined"`
  - `getPushPermission(): Promise<PushPermission>`(`hasPermission`: AUTHORIZED·PROVISIONAL → granted, DENIED → denied, 나머지 → undetermined)
  - `enablePushOnThisDevice(uid: string): Promise<PushPermission>`(`requestPermission` 후 granted면 `syncPushToken(uid)`)
  - `syncPushToken(uid: string): Promise<void>`
  - `disablePushOnThisDevice(uid: string): Promise<void>`
  - `subscribePushPermissionChanged(listener: () => void): () => void` / `notifyPushPermissionChanged(): void`(같은 세션 안 상태 갱신용)
  - `releasePending.ts`: `type ReleasePending = { token: string; uid: string; serverDeleted: boolean; deviceDeleted: boolean }`, `loadReleasePending(): Promise<ReleasePending | null>`, `saveReleasePending(p: ReleasePending): Promise<void>`, `clearReleasePending(): Promise<void>`(AsyncStorage 키 `"tododo:pushReleasePending"`)

`syncPushToken(uid)` 순서(스펙 §5.6):
1. 권한이 granted가 아니면 종료한다.
2. pending이 있으면:
   - `deviceDeleted`가 false면 `deleteToken()`을 호출한다. 실패하면 던진다(등록하지 않는다). 성공하면 `deviceDeleted=true`로 저장한다.
   - 그다음 `serverDeleted`가 false이고 `pending.uid === uid`면 `unregisterPushToken(pending.token)`을 호출한다. 실패하면 던진다.
   - 위 단계가 끝나거나 uid가 다르면 `clearReleasePending()`을 호출한다.
3. `getToken()`으로 토큰을 받아 `registerPushToken(token, Platform.OS)`를 호출한다.

`disablePushOnThisDevice(uid)` 순서:
1. 권한이 granted가 아니면 종료한다.
2. `getToken()`으로 토큰을 받고, `{token, uid, serverDeleted:false, deviceDeleted:false}`를 먼저 저장한다.
3. `unregisterPushToken`을 시도해 성공하면 `serverDeleted=true`로 저장한다.
4. 3단계 결과와 관계없이 `deleteToken`을 시도해 성공하면 `deviceDeleted=true`로 저장한다.
5. 둘 다 true면 clear한다.
6. 첫 에러는 다시 던진다(호출부가 로그만 남긴다).

- [ ] **Step 1: 실패하는 테스트를 쓴다(`pushClient.test.ts`).**
  - `"sync does nothing without permission"`
  - `"sync registers token with Platform.OS"`
  - `"pending device delete blocks register"`(deleteToken reject → registerPushToken 미호출, 에러 전파)
  - `"pending other uid: device delete then clear without server delete"`
  - `"pending same uid: retries server delete then registers new token"`
  - `"disable offline keeps pending with flags"`(unregister reject, deleteToken resolve → 저장값 `{serverDeleted:false, deviceDeleted:true}`)
  - `"disable success clears pending"`
- [ ] **Step 2:** `cd mobile && npx jest src/reminders/__tests__/pushClient.test.ts`를 실행한다. FAIL해야 한다.
- [ ] **Step 3:** 구현한다. `signOut.ts`는 firebase signOut **전에** `disablePushOnThisDevice(uid)`를 try/catch로 감싸 호출하고 `reportError(error, "reminder")`로 남긴다. 이 단계 실패가 로그아웃을 막지 않는다. 기존 `cancelAllScheduledNotificationsAsync` 블록은 Task 7에서 지운다. `deleteAccount.ts`는 기존 `DELETE /account` 성공 후 `deleteToken()`을 try/catch로 감싸 호출한다(실패해도 탈퇴는 진행).
- [ ] **Step 4:** `signOut`/`deleteAccount` 테스트에 `"signOut releases push token before firebase signOut"`(호출 순서 검증)와 `"signOut proceeds when release fails"`를 추가하고, 탈퇴 테스트에 `"deleteAccount deletes device token"`을 추가한다.
- [ ] **Step 5:** `cd mobile && npx jest && npx tsc --noEmit`를 실행한다. 기대 결과: PASS.
- [ ] **Step 6:** 커밋한다: `feat(mobile): FCM 토큰 등록·해제 대기 처리 및 로그아웃/탈퇴 연동`

### Task 6: 앱 수준 훅 — 토큰 동기화, refresh, 포그라운드, 탭 이동

**Files:**
- Create: `mobile/src/reminders/hooks/usePushTokenSync.ts`, `useReminderRefresh.ts`, `useForegroundReminders.ts`, `useNotificationNavigation.ts`, `mobile/src/reminders/components/ReminderBanner.tsx`, `mobile/src/navigation/navigationRef.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx`(로그인 분기에 `<ReminderSync />` 마운트, `NavigationContainer`에 `ref={navigationRef}`·`onReady`)
- Test: `mobile/src/reminders/__tests__/usePushTokenSync.test.tsx`, `useReminderRefresh.test.tsx`, `useForegroundReminders.test.tsx`, `useNotificationNavigation.test.tsx`

**Interfaces:**
- Consumes: Task 3 `buildReminderFingerprint`, Task 4 `requestReminderRefresh`/`REMINDER_HISTORY_KEY`, Task 5 `syncPushToken`/`getPushPermission`/`subscribePushPermissionChanged`, 기존 `useTodos`(`["todos", uid]` 캐시)
- Produces:
  - `navigationRef = createNavigationContainerRef()`, `openTodoDetail(todoId: string): void`(`navigationRef.navigate("오늘", { screen: "TodoDetail", params: { id } })`)
  - `useReminderBanner()` 컨텍스트: `{ show(title: string, body: string): void }`. `ReminderBannerProvider`는 화면 상단에 4초 동안 표시하고, 누르면 닫힌다.
  - 상수 `REFRESH_DEBOUNCE_MS = 2000`, `HISTORY_REFETCH_DELAY_MS = 3000`(웹과 동일)

- [ ] **Step 1: 실패하는 테스트를 쓴다.**
  - `usePushTokenSync`: `"syncs on mount and on token refresh"`(onTokenRefresh 콜백 호출 시 다시 sync). `"resyncs when permission changes to granted"`. 에러는 `reportError`로 남긴다.
  - `useReminderRefresh`: fake timers. `"sends once after 2s debounce when fingerprint changes"`. `"no resend when unrelated field (title) changes"`. `"sends regardless of permission"`.
  - `useForegroundReminders`: `"onMessage shows banner and refetches history after 3s"`. `"no subscribe without permission"`.
  - `useNotificationNavigation`: `"background tap navigates to TodoDetail"`(onNotificationOpenedApp에 `data.todoId:"a"` → `openTodoDetail("a")`). `"queues until ready"`(getInitialNotification이 navigationRef 준비 전에 resolve → `isReady()`가 true가 된 뒤 한 번만 navigate). `"ignores message without todoId"`.
- [ ] **Step 2:** `cd mobile && npx jest src/reminders/__tests__`를 실행한다. 새 테스트가 FAIL해야 한다.
- [ ] **Step 3:** 구현한다. `ReminderSync` 컴포넌트는 기존 `CalendarSync`처럼 RootNavigator 안에 두고 네 훅을 호출한다. `ReminderBannerProvider`는 `NavigationContainer` 안, MainTabs를 감싸는 위치에 둔다. 준비 전 탭 보류는 `NavigationContainer onReady`에서 보류 중인 id를 비우는 방식으로 한다.
- [ ] **Step 4:** `cd mobile && npx jest && npx tsc --noEmit`를 실행한다. 기대 결과: PASS.
- [ ] **Step 5:** 커밋한다: `feat(mobile): 푸시 토큰 동기화·예약 갱신 신호·포그라운드 배너·알림 탭 이동`

### Task 7: 로컬 알림 제거 + 옛 예약 1회 취소

**Files:**
- Delete: `mobile/src/notifications/scheduleReminder.ts`, `reminderTime.ts`, `mobile/src/notifications/__tests__/*`
- Modify: `mobile/src/hooks/useCreateTodo.ts`, `useUpdateTodo.ts`, `useCreateRecurringTodo.ts`(호출 제거), 해당 훅 테스트, `mobile/src/auth/signOut.ts`(cancelAll 블록 제거), `mobile/src/design/spec.md`(로컬 알림 언급 갱신)
- Create: `mobile/src/reminders/legacyLocalReminders.ts`
- Test: `mobile/src/reminders/__tests__/legacyLocalReminders.test.ts`

**Interfaces:**
- Produces: `cancelLegacyLocalRemindersOnce(): Promise<void>`. AsyncStorage 키 `"tododo:legacyLocalRemindersCleared"`가 없으면 `Notifications.cancelAllScheduledNotificationsAsync()` 후 키를 기록한다. 실패하면 키를 남기지 않는다(다음 실행에 재시도). `ReminderSync` 마운트 시 1회 호출한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `"cancels once and records flag"`, `"skips when flag present"`, `"does not record flag on failure"`. 기존 `useCreateTodo`/`useUpdateTodo` 테스트의 scheduleReminder 단언은 `"does not schedule local notification"`으로 바꾼다.
- [ ] **Step 2:** `cd mobile && npx jest src/reminders/__tests__/legacyLocalReminders.test.ts src/hooks`를 실행한다. FAIL해야 한다.
- [ ] **Step 3:** 구현하고 지운다. 삭제 후 `grep -rn "scheduleReminder\|cancelReminder" mobile/src` 결과가 없어야 한다. `expo-notifications`는 이 파일에서 계속 쓰므로 패키지는 남긴다.
- [ ] **Step 4:** `cd mobile && npx jest && npx tsc --noEmit`를 실행한다. 기대 결과: PASS.
- [ ] **Step 5:** 커밋한다: `refactor(mobile): 로컬 마감 알림 제거, 옛 예약은 첫 실행에 1회 취소`

### Task 8: 알림 화면 + 벨 헤더 + 계정 링크

**Files:**
- Create: `mobile/src/screens/NotificationsScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`(네 스택에 `Notifications` 라우트 추가, 헤더 오른쪽을 벨+계정 두 버튼으로), `mobile/src/navigation/types.ts`(네 ParamList에 `Notifications: undefined`), `mobile/src/screens/AccountScreen.tsx`(“알림 설정” 행 → Notifications)
- Test: `mobile/src/screens/__tests__/NotificationsScreen.test.tsx`, `mobile/src/navigation/__tests__/`(헤더 벨 배지), `AccountScreen.test.tsx`

**Interfaces:**
- Consumes: Task 4 훅들과 `hasUnreadReminders`, Task 3 `REMINDER_SETTING_OPTIONS`·`formatTimeAgo`, Task 5 `getPushPermission`/`enablePushOnThisDevice`/`subscribePushPermissionChanged`, core `reminderBody`
- Produces: 라우트 이름 `"Notifications"`(title `"알림"`). 알림 화면에서는 벨을 숨긴다(계정 화면처럼).

화면 구성(스펙 §5.4):
- 권한 상태 줄: granted면 "알림 켜짐", undetermined면 [켜기] 버튼, denied면 [iOS 설정 열기] 버튼(`Linking.openSettings()`).
- "기본 알림 시점" 선택: `REMINDER_SETTING_OPTIONS`. 선택 UI는 기존 `bottomSheet` 또는 `priorityChips` 패턴 중 맞는 것을 재사용한다.
- 기록 목록: 제목, `reminderBody(offsetMinutes)`, `formatTimeAgo(sentAt, now)`. 미읽음 점은 `sentAt > lastSeenAt`인 항목에 표시한다. 항목을 누르면 같은 스택의 `TodoDetail`로 간다.
- 화면에 들어오면 목록이 있을 때 `markReminderHistorySeen(max sentAt)`를 호출하고 기록 쿼리를 무효화한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.**
  - `"shows enable button when undetermined and calls enablePushOnThisDevice"`
  - `"denied shows open settings"`
  - `"changing default calls setReminderDefault with 'off'"`
  - `"renders history with body text '30분 후 마감이에요'"`
  - `"marks seen with max sentAt on focus"`
  - `"tapping item navigates to TodoDetail"`
  - 헤더: `"bell shows badge when unread"`
  - 계정: `"account has link to notifications"`
- [ ] **Step 2:** `cd mobile && npx jest src/screens src/navigation`를 실행한다. FAIL해야 한다.
- [ ] **Step 3:** 구현한다. 색상·간격은 `mobile/src/theme` 토큰만 쓰고, 빈 상태는 `shared/ui/emptyState`를 쓴다.
- [ ] **Step 4:** `cd mobile && npx jest && npx tsc --noEmit`를 실행한다. 기대 결과: PASS.
- [ ] **Step 5:** 커밋한다: `feat(mobile): 알림 화면(권한·기본값·기록)과 헤더 벨`

### Task 9: 할 일 폼/상세의 알림 선택 + 권한 안내

**Files:**
- Create: `mobile/src/shared/ui/reminderField/ReminderField.tsx`, `mobile/src/reminders/components/ReminderPromptProvider.tsx`
- Modify: `mobile/src/screens/TodoFormScreen.tsx`, `mobile/src/screens/TodoDetailScreen.tsx`, `mobile/src/hooks/useCreateTodo.ts`·`useUpdateTodo.ts`(필드 타입만 받도록, 필요 시), `mobile/src/navigation/RootNavigator.tsx`(Provider 마운트)
- Test: `TodoFormScreen.test.tsx`, `TodoDetailScreen.test.tsx`, `mobile/src/reminders/__tests__/ReminderPromptProvider.test.tsx`

**Interfaces:**
- Consumes: Task 3 `toReminderChoice`/`parseReminderSetting`/`REMINDER_SETTING_OPTIONS`, Task 4 `useReminderDefault`, Task 5 `getPushPermission`/`enablePushOnThisDevice`
- Produces:
  - `<ReminderField value={choice: string} onChange={(choice: string) => void} defaultSetting={ReminderSetting} />`. 첫 선택지는 `"default"`이고 라벨은 `` `기본값(${reminderSettingLabel(defaultSetting)})` ``이다.
  - `useReminderPrompt(): { maybePrompt(): void }`. 마감 있는 할 일 저장 성공 직후 호출한다. 권한이 undetermined이고 스누즈가 아닐 때만 안내를 띄운다. 스누즈 키는 `"tododo:reminderPromptSnoozedAt"`이고 기간은 웹 `PROMPT_SNOOZE_MS`와 같은 값을 쓴다(웹 `reminderPromptContext.ts`에서 확인해 같은 숫자로 쓴다).
  - 안내 문구: 제목 "마감 전에 알려드릴까요?", 본문은 `` `마감 ${reminderSettingLabel(기본값)}에 알림을 보내요. 기본값은 알림 화면에서 바꿀 수 있어요.` ``, 버튼 "켜기" / "나중에". 웹 `reminderPrompt.tsx` 문구가 다르면 웹 문구를 그대로 따른다.

저장 규칙(웹 `todoForm`과 동일): 마감이 있거나 반복이면 `reminderOffsetMinutes = parseReminderSetting(choice)`, 아니면 `null`이다. 필드는 마감이 있거나 반복일 때만 보인다. 이 값을 전달해야 하는 경로는 다섯 가지다.
1. 일반 추가
2. 반복 생성
3. 상세 일반 수정(`updateTodo` fields)
4. 상세 반복 시리즈 수정(`editRecurringSeries` 입력)
5. 비반복 → 반복 전환(`createRecurringTodo` 입력)

- [ ] **Step 1: 실패하는 테스트를 쓴다.**
  - 폼: `"hides reminder field without dueAt"`, `"saves reminderOffsetMinutes 10 when chosen"`, `"saves null for default choice"`, `"recurring create passes reminderOffsetMinutes"`, `"calls maybePrompt after save with dueAt"`
  - 상세: `"prefills choice from todo.reminderOffsetMinutes"`, `"plain edit passes reminderOffsetMinutes"`, `"series edit passes reminderOffsetMinutes"`
  - 안내: `"shows when undetermined"`, `"not when granted"`, `"later snoozes"`, `"enable calls enablePushOnThisDevice"`
- [ ] **Step 2:** `cd mobile && npx jest src/screens src/reminders`를 실행한다. FAIL해야 한다.
- [ ] **Step 3:** 구현한다. 안내 Provider는 폼 화면의 자식이 아니라 RootNavigator 로그인 분기에 둔다(스펙 §5.3, 화면이 닫혀도 유지).
- [ ] **Step 4:** `cd mobile && npx jest && npx tsc --noEmit`를 실행한다. 기대 결과: PASS.
- [ ] **Step 5:** 커밋한다: `feat(mobile): 할 일 알림 시점 선택과 권한 안내`

### Task 10: 전체 검증 + 실기 체크리스트

- [ ] **Step 1:** 전체 테스트를 실행한다. 기대 결과: 전부 PASS.
  - `cd packages/core && npm run build && npx vitest run`
  - `cd reminder-proxy && npx vitest run && npx tsc --noEmit`
  - `cd client && VITE_FIREBASE_API_KEY= npx vitest run && npx tsc --noEmit -p .`
  - `cd mobile && npx jest && npx tsc --noEmit`
- [ ] **Step 2:** 컨트롤러가 사용자와 함께 실기기(Task 1 게이트에서 만든 dev 빌드, Worker는 프리뷰 업로드 또는 로컬 VITE/EXPO 오버라이드)로 스펙 §7 체크리스트를 확인하고 결과를 PR 본문에 적는다. 사용자 작업(§6: APNs 키 업로드)이 끝나지 않았으면 이 단계는 보류로 표시한다.
