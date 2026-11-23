# Sign in with Apple Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹과 iOS 앱에 Apple 로그인을 넣고, 자동 연결 안내·한국어 이름 보정·Apple 사용자 탈퇴 시 토큰 해지를 구현한다.

**Architecture:** 판단 로직(이름 만들기, 오류 판정, 연결 안내 여부)은 `packages/core/src/auth`에 순수 함수로 두고 웹·앱이 `dist` 하위 경로로 가져다 쓴다. 웹은 로그인 호출을 `features/auth/api/signIn.ts`로 모으고, 시행일(2026-12-28) 전에는 Apple 버튼을 숨긴다. 같은 이메일 계정 연결은 Firebase가 서버에서 자동으로 하므로 우리 코드는 안내만 한다.

**Tech Stack:** Firebase JS SDK 12(auth), React 19 + styled-components + vitest(client), Expo 57 + React Native + jest(mobile), `expo-apple-authentication`, `expo-crypto`.

**Spec:** `docs/superpowers/specs/2026-10-25-sign-in-with-apple-design.md`

## Global Constraints

- 브랜치 `feat/apple-login`. 커밋은 태스크마다. **git hooks 우회(`--no-verify` 등) 금지.**
- 웹에서 팝업을 여는 모든 호출에 세 번째 인자 `browserPopupRedirectResolver`를 넘긴다(`auth`가 `initializeAuth`로 처리기 없이 만들어짐, #195).
- client와 mobile은 `@tododo/core` 루트에서 import하지 않는다 — `@tododo/core/dist/auth/index.js`처럼 하위 경로로(기존 `dist/entitlement/index.js` 패턴). core를 바꾸면 `cd packages/core && npm run build` 후 `dist`도 커밋.
- 웹 Apple 로그인 공개 시각: `2026-12-28T00:00:00+09:00`(약관 4판 시행일). 그 전엔 버튼·안내 한 줄 모두 안 보임.
- 문구(그대로 사용):
  - 연결 안내: `이제 Google·Apple 둘 다로 로그인할 수 있어요`
  - 충돌 오류: `이미 다른 방법으로 가입된 이메일이에요. 그 방법으로 로그인해 주세요.`
  - 이메일 가리기 안내: `이전에 Google로 가입했다면 Google로 로그인해 주세요.`
  - 탈퇴 창 Apple 안내: `Apple 계정 확인 창이 한 번 더 열려요.`
- Apple 버튼: 검정 바탕 + 흰 Apple 로고 + 흰 글자 `Apple로 로그인`, 구글 버튼과 같은 너비·높이. 브랜드 고정색은 기존 구글 로고처럼 `eslint-disable-next-line no-restricted-syntax -- Apple 브랜드 고정색`.
- 팝업/네이티브 창을 사용자가 닫은 경우(`auth/popup-closed-by-user`, `auth/cancelled-popup-request`, 앱 `ERR_REQUEST_CANCELED`)는 오류 문구를 띄우지 않는다.
- client 테스트는 CI 등가로 `VITE_FIREBASE_API_KEY= npx vitest run`도 통과해야 한다.

## Review Focus

1. **웹 탈퇴 팝업 차단:** `reauthenticateWithPopup` 앞에 `await`가 하나라도 있으면 브라우저가 팝업을 막는다 → Task 4에 "다른 어떤 비동기 호출보다 먼저 불린다" 테스트.
2. **`_tokenResponse`가 없거나 모양이 다름**(SDK 업데이트) → 로그인은 성공하고 `updateProfile`은 안 불린다 → Task 2 테스트.
3. **`updateProfile`·저장소 실패**(Safari 사생활 모드 localStorage 예외 포함) → 로그인은 그대로 성공, 안내만 생략 → Task 2·3 테스트.
4. **탈퇴 중 Apple 재인증 창을 닫음** → 아무것도 지워지지 않고 실패 문구 없이 창이 원래 상태로 → Task 4·6 테스트.
5. **Apple 해지 실패** → 1~3단계(캘린더·알림·계정)를 하나도 부르지 않는다 → Task 4·6 테스트.

---

### Task 1: core 인증 헬퍼

**Files:**
- Create: `packages/core/src/auth/appleName.ts`, `packages/core/src/auth/authErrors.ts`, `packages/core/src/auth/linkedNotice.ts`, `packages/core/src/auth/index.ts`
- Create: `packages/core/src/auth/__tests__/appleName.test.ts`, `packages/core/src/auth/__tests__/authErrors.test.ts`, `packages/core/src/auth/__tests__/linkedNotice.test.ts`
- Modify: `packages/core/dist/**`(빌드 산출물)

**Interfaces:**
- Produces:
  - `formatAppleDisplayName(givenName: string | null | undefined, familyName: string | null | undefined): string | null`
  - `isAccountExistsError(code: unknown): boolean`
  - `isUserCancelledSignIn(code: unknown): boolean` — `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, `ERR_REQUEST_CANCELED`
  - `linkedNoticeKey(providerIds: readonly string[]): string | null` — 중복 제거·정렬 후 2개 이상이면 `","`로 이은 값, 아니면 `null`
  - `linkedNoticeStorageKey(uid: string): string` — `` `tododo:linkedNotice:${uid}` ``
  - `index.ts`는 `export * from "./appleName.js"` 식으로 세 파일을 다시 내보낸다(`aiPlan/index.ts`와 같은 모양). 루트 `src/index.ts`에는 추가하지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// appleName.test.ts
expect(formatAppleDisplayName("수영", "강")).toBe("강수영");
expect(formatAppleDisplayName(" 수영 ", " 강 ")).toBe("강수영");
expect(formatAppleDisplayName("Swim", "Kang")).toBe("Swim Kang");
expect(formatAppleDisplayName("수영", "Kang")).toBe("Kang수영"); // 한쪽이라도 한글이면 성+이름
expect(formatAppleDisplayName("수영", null)).toBe("수영");
expect(formatAppleDisplayName(undefined, "Kang")).toBe("Kang");
expect(formatAppleDisplayName("", "  ")).toBeNull();
expect(formatAppleDisplayName(null, undefined)).toBeNull();

// authErrors.test.ts
expect(isAccountExistsError("auth/account-exists-with-different-credential")).toBe(true);
expect(isAccountExistsError("auth/popup-closed-by-user")).toBe(false);
expect(isAccountExistsError(undefined)).toBe(false);
expect(isUserCancelledSignIn("auth/popup-closed-by-user")).toBe(true);
expect(isUserCancelledSignIn("auth/cancelled-popup-request")).toBe(true);
expect(isUserCancelledSignIn("ERR_REQUEST_CANCELED")).toBe(true);
expect(isUserCancelledSignIn("auth/network-request-failed")).toBe(false);

// linkedNotice.test.ts
expect(linkedNoticeKey(["google.com"])).toBeNull();
expect(linkedNoticeKey([])).toBeNull();
expect(linkedNoticeKey(["google.com", "apple.com"])).toBe("apple.com,google.com");
expect(linkedNoticeKey(["apple.com", "google.com"])).toBe("apple.com,google.com"); // 순서 무관
expect(linkedNoticeKey(["google.com", "google.com"])).toBeNull(); // 중복 제거
expect(linkedNoticeStorageKey("u1")).toBe("tododo:linkedNotice:u1");
```

한글 판정은 `/[가-힣ㄱ-ㆎ]/`(완성형+자모).

- [ ] **Step 2:** `cd packages/core && npx vitest run src/auth` → FAIL(모듈 없음)
- [ ] **Step 3:** 네 파일 구현
- [ ] **Step 4:** `npx vitest run src/auth` → PASS, `npm run build` → `dist/auth/index.js`·`.d.ts` 생성 확인
- [ ] **Step 5: 커밋** — `feat(core): Apple 로그인용 이름·오류·연결 안내 헬퍼`

---

### Task 2: 웹 로그인 API와 이름 보정

**Files:**
- Create: `client/src/features/auth/api/signIn.ts`, `client/src/features/auth/api/__tests__/signIn.test.ts`
- Modify: `client/src/shared/lib/firebase.ts`(`appleProvider` 추가)
- Modify: `client/src/features/auth/context/authContext.ts`, `authProvider.tsx`(`refreshUser` 추가)
- Modify: `client/src/features/auth/pages/__tests__/loginPage.test.tsx`, 기존 `AuthContext` mock들(`refreshUser: vi.fn()` 추가 — `grep -rn "logout: vi.fn" client/src`로 찾기)

**Interfaces:**
- Consumes: `formatAppleDisplayName`, `linkedNoticeKey`, `linkedNoticeStorageKey` (Task 1)
- Produces:
  - `firebase.ts`: `export const appleProvider: OAuthProvider` — `new OAuthProvider("apple.com")`, `addScope("email")`, `addScope("name")`
  - `AuthContextType.refreshUser: () => void` — `useReducer`로 렌더를 한 번 더 일으켜 `user`(같은 객체, 필드만 바뀜)를 다시 읽게 한다
  - `signInWithGoogle(): Promise<UserCredential>`
  - `signInWithApple(): Promise<UserCredential>` — 성공 후 `applyAppleName(result)` 실행
  - `applyAppleName(result: UserCredential): Promise<boolean>` — `_tokenResponse.firstName/lastName`(문자열일 때만)으로 이름을 만들어 현재 `displayName`과 다르면 `updateProfile`. 바꿨으면 true. 어떤 예외도 밖으로 내지 않는다(`console.error`만)
  - `consumeLinkedNotice(user: User): boolean` — `linkedNoticeKey(user.providerData.map(p => p.providerId))`가 있고 localStorage의 `linkedNoticeStorageKey(uid)` 값과 다르면 저장하고 true. localStorage 예외 시 false

`_tokenResponse` 읽기는 `signIn.ts` 안 한 곳에서만, 좁은 타입으로: `(result as unknown as { _tokenResponse?: { firstName?: unknown; lastName?: unknown } })._tokenResponse`. 주석으로 "SDK 내부 필드 — 공개 API(getAdditionalUserInfo)에 이름 없음, 실측 2026-11-23, spec 참고" 명시.

- [ ] **Step 1: 실패하는 테스트 작성** (`firebase/auth` mock은 기존 `loginPage.test.tsx` 방식)
  - `signInWithApple`이 `signInWithPopup(auth, appleProvider, browserPopupRedirectResolver)`로 호출
  - `signInWithGoogle`도 세 번째 인자로 `browserPopupRedirectResolver`
  - `_tokenResponse: { firstName: "수영", lastName: "강" }`, `user.displayName: "수영 강"` → `updateProfile(user, { displayName: "강수영" })`, 반환 true
  - `_tokenResponse` 없음 → `updateProfile` 미호출, `signInWithApple`은 정상 resolve
  - `_tokenResponse: { firstName: 1, lastName: {} }` → 미호출
  - 이미 `displayName === "강수영"` → 미호출
  - `updateProfile` reject → `signInWithApple`은 정상 resolve
  - `consumeLinkedNotice`: 제공자 `["google.com","apple.com"]` 첫 호출 true, 두 번째 false; 제공자 1개 false; `localStorage.getItem`이 throw → false
  - `AuthProvider`: `refreshUser()` 후 소비 컴포넌트가 바뀐 `user.displayName`을 다시 그림(`authProvider` 기존 테스트 파일에 추가)
- [ ] **Step 2:** `cd client && npx vitest run src/features/auth` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npx vitest run src/features/auth` → PASS, `npx tsc --noEmit -p .` 통과
- [ ] **Step 5: 커밋** — `feat(auth): 웹 로그인 API 분리, Apple 이름 순서 보정·연결 안내 기록`

---

### Task 3: 웹 로그인 화면

**Files:**
- Create: `client/src/features/auth/config.ts`, `client/src/features/auth/__tests__/config.test.ts`
- Modify: `client/src/features/auth/pages/loginPage.tsx`, `loginPage.styles.tsx`, `pages/__tests__/loginPage.test.tsx`

**Interfaces:**
- Consumes: `signInWithGoogle`, `signInWithApple`, `consumeLinkedNotice`, `refreshUser`(Task 2), `isAccountExistsError`, `isUserCancelledSignIn`(Task 1), `useToast().info`(`@/shared`)
- Produces: `APPLE_LOGIN_OPENS_AT = "2026-12-28T00:00:00+09:00"`, `isAppleLoginOpen(now: Date = new Date()): boolean` — 시각 이후이거나 `import.meta.env.VITE_APPLE_LOGIN_PREVIEW === "true"`면 true(로컬 실기 확인용, 운영 env에는 넣지 않음 — 함수 위 주석에 명시)

로그인 성공 흐름(두 버튼 공통): 로그인 → Apple이면 `applyAppleName` 결과가 true일 때 `refreshUser()` → `consumeLinkedNotice(result.user)`가 true면 `toast.info("이제 Google·Apple 둘 다로 로그인할 수 있어요")` → `navigate("/")`. 오류: 취소면 무시, `isAccountExistsError`면 충돌 문구, 그 밖엔 기존 `"로그인 중 오류가 발생했습니다. 다시 시도해주세요."`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `config.test.ts`: `isAppleLoginOpen(new Date("2026-12-27T14:59:59Z"))` false, `new Date("2026-12-27T15:00:00Z")` true, `vi.stubEnv("VITE_APPLE_LOGIN_PREVIEW","true")`면 이전 시각도 true
  - `loginPage.test.tsx`(시각은 `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime` — 절대 날짜를 실제 시계에 의존하지 말 것):
    - 공개 전: "Apple로 로그인" 버튼과 이메일 가리기 안내 문구가 없다
    - 공개 후: 버튼과 안내 문구가 있고, 클릭 시 `signInWithApple` 호출
    - `signInWithApple`이 `{ code: "auth/account-exists-with-different-credential" }`로 reject → 충돌 문구
    - `{ code: "auth/popup-closed-by-user" }` → 오류 문구 없음
    - `consumeLinkedNotice`가 true → `toast.info`가 연결 안내 문구로 1번
    - `applyAppleName`이 true → `refreshUser` 호출
- [ ] **Step 2:** `npx vitest run src/features/auth` → FAIL
- [ ] **Step 3:** 구현(Apple 로고 SVG는 인라인, `aria-hidden`)
- [ ] **Step 4:** `npx vitest run src/features/auth` → PASS
- [ ] **Step 5: 커밋** — `feat(auth): 웹 로그인 화면에 Apple 로그인(12-28 공개)·충돌/연결 안내`

---

### Task 4: 웹 탈퇴 0단계(Apple 해지)

**Files:**
- Modify: `client/src/features/account/api/deleteAccount.ts`, `api/__tests__/deleteAccount.test.ts`
- Modify: `client/src/features/account/components/accountDeletionDialog.tsx`, `components/__tests__/` 해당 테스트

**Interfaces:**
- Consumes: `appleProvider`(Task 2), `isUserCancelledSignIn`(Task 1)
- Produces: `AccountDeletionStep`에 `"apple"` 추가, `STEP_LABEL.apple = "Apple 연결 해제 중…"`

`deleteAccount` 맨 앞: `auth.currentUser.providerData`에 `apple.com`이 있으면 `onStep?.("apple")` → `reauthenticateWithPopup(user, appleProvider, browserPopupRedirectResolver)` → `OAuthProvider.credentialFromResult(r)?.accessToken`(없으면 `throw new Error("Apple 토큰을 받지 못했습니다")`) → `revokeAccessToken(auth, token)`. 그 다음 기존 단계. 재인증 전에 다른 `await`를 두지 않는다(Review Focus 1).

대화상자: Apple 사용자면 본문에 `Apple 계정 확인 창이 한 번 더 열려요.`를 기존 구독 안내들과 같은 방식으로 추가. 오류의 `code`가 `isUserCancelledSignIn`이면 실패 문구 없이 `status`를 `"idle"`로.

- [ ] **Step 1: 실패하는 테스트 작성**
  - Apple 사용자: `reauthenticateWithPopup`이 `getDocs`·`disconnectCalendar`보다 먼저, 다른 비동기 호출 없이 첫 번째로 불림(호출 순서 배열로 검증), 처리기 인자 포함, `revokeAccessToken(auth, "apple-access-token")`
  - 구글 사용자: `reauthenticateWithPopup`·`revokeAccessToken` 미호출, 기존 순서 그대로
  - `revokeAccessToken` reject → `disconnectCalendar`·`deleteReminderAccount`·`deleteAccountOnServer` 모두 미호출, `deleteAccount` reject
  - `credentialFromResult`가 `null` → 같은 결과(뒤 단계 미호출)
  - 대화상자: Apple 사용자에게 안내 문구 노출, 구글 사용자에겐 없음; 재인증 취소 오류 → 실패 문구 없음
- [ ] **Step 2:** `npx vitest run src/features/account` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npx vitest run src/features/account` → PASS
- [ ] **Step 5: 커밋** — `feat(account): Apple 사용자 탈퇴 시 재인증 후 토큰 해지`

---

### Task 5: 웹 이름·사진 대체 표시

**Files:**
- Create: `client/src/layouts/userAvatar/userAvatar.tsx`, `client/src/layouts/userAvatar/userLabel.ts`, `client/src/layouts/userAvatar/__tests__/userAvatar.test.tsx`
- Modify: `client/src/layouts/header/header.tsx:33-34`, `client/src/layouts/mobileHeader/mobileHeader.tsx:34`, `client/src/layouts/snb/mobileDrawer.tsx:82-84`, `client/src/layouts/profileMenu/profileMenu.tsx:51`

**Interfaces:**
- Produces:
  - `userLabel(user: Pick<User, "displayName" | "email"> | null): string` — `displayName`(trim) → 이메일 `@` 앞부분 → `"사용자"`
  - `<UserAvatar user={user} size={number} />` — `photoURL`이 있으면 `<img alt="">`, 없거나 로드 실패(`onError`)면 `userLabel`의 첫 글자를 원 안에 표시(배경 `brand.tint`, 글자 `brand.strong`)

세 곳의 기존 이미지 컴포넌트를 `UserAvatar`로 바꾸되 각자 지금 크기를 `size`로 넘긴다. 이름 텍스트 자리(`header.tsx:33`, `mobileDrawer.tsx:84`, `profileMenu.tsx:51`의 `?? "메뉴"`)는 `userLabel(user)`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `userLabel({displayName:"강수영", email:"a@b.com"})` → `"강수영"`, `{displayName:"  ", email:"swim@x.com"}` → `"swim"`, `{displayName:null, email:null}` → `"사용자"`, `null` → `"사용자"`
  - `photoURL` 없음 → `img` 없음, `"강"` 표시; `photoURL` 있음 → `img`; `img`에 `error` 이벤트 → 이니셜로 바뀜
- [ ] **Step 2:** `npx vitest run src/layouts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npx vitest run src/layouts` → PASS(기존 header·drawer 테스트 포함)
- [ ] **Step 5: 커밋** — `feat(layout): 사진·이름 없는 사용자용 이니셜 아바타와 이름 대체`

---

### Task 6: 앱 Apple 로그인과 탈퇴

**Files:**
- Modify: `mobile/package.json`(`npx expo install expo-apple-authentication expo-crypto`), `mobile/app.json`(`ios.usesAppleSignIn: true`, plugins에 `"expo-apple-authentication"`)
- Create: `mobile/src/auth/appleSignIn.ts`, `mobile/src/auth/linkedNotice.ts`, `mobile/src/auth/__tests__/appleSignIn.test.ts`, `mobile/src/auth/__tests__/linkedNotice.test.ts`
- Modify: `mobile/src/screens/LoginScreen.tsx`, `mobile/src/screens/__tests__/`에 `LoginScreen.test.tsx` 생성
- Modify: `mobile/src/account/deleteAccount.ts`, `src/account/__tests__/deleteAccount.test.ts`, `src/screens/AccountScreen.tsx`, `src/screens/__tests__/AccountScreen.test.tsx`

**Interfaces:**
- Consumes: Task 1 전부
- Produces:
  - `signInWithApple(): Promise<UserCredential>` — `Crypto.randomUUID()`로 rawNonce → `Crypto.digestStringAsync(SHA256, rawNonce)` → `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce: hashed })` → `identityToken` 없으면 throw → `new OAuthProvider("apple.com").credential({ idToken, rawNonce })` → `signInWithCredential` → `formatAppleDisplayName(fullName?.givenName, fullName?.familyName)`가 있고 다르면 `updateProfile`(예외 삼킴)
  - `isAppleSignInAvailable(): Promise<boolean>` — `Platform.OS === "ios" && await AppleAuthentication.isAvailableAsync()`
  - `revokeAppleSignIn(): Promise<void>` — `signInAsync({ requestedScopes: [] })`의 `authorizationCode`(없으면 throw)로 `revokeAccessToken(auth, code)`
  - `consumeLinkedNotice(user: User): Promise<boolean>` — 웹과 같은 규칙, AsyncStorage, 예외 시 false

로그인 화면: Apple 버튼은 `AppleAuthentication.AppleAuthenticationButton`(BLACK, SIGN_IN, 구글 버튼과 같은 너비·`MIN_TOUCH_TARGET` 높이), `isAppleSignInAvailable()`이 true일 때만 버튼과 이메일 가리기 안내 한 줄. 성공 후 `consumeLinkedNotice`가 true면 `Alert.alert("로그인 방법 연결", "이제 Google·Apple 둘 다로 로그인할 수 있어요")`(구글 로그인 성공에도 동일). 오류 처리 규칙은 웹과 같음. 앱엔 이름 표시 화면이 없어 `refreshUser` 불필요.

탈퇴: `readProxyUrls()` 바로 다음, `getIdToken`보다 앞에서 Apple 사용자면 `revokeAppleSignIn()`. `AccountScreen` 확인 Alert 본문에 Apple 사용자면 `Apple 계정 확인 창이 한 번 더 열려요.` 추가, 취소 오류(`isUserCancelledSignIn`)면 "탈퇴 실패" Alert 없이 대기 상태 해제.

`revokeAccessToken`에 넘기는 값(인증 코드)과 RN 동작은 mock으로 확인 못 한다 — 네이티브 빌드 실측 항목(spec "구현 전 확인할 것" 2번). 코드 주석에 남긴다.

- [ ] **Step 1:** `cd mobile && npx expo install expo-apple-authentication expo-crypto`, `app.json` 수정, `npx expo config --type public | grep -i apple`로 반영 확인
- [ ] **Step 2: 실패하는 테스트 작성**(`expo-apple-authentication`·`expo-crypto`는 `jest.mock`)
  - `signInAsync`에 SHA-256 해시 nonce, `credential`에 원본 rawNonce
  - `fullName {givenName:"수영", familyName:"강"}` → `updateProfile(..., {displayName:"강수영"})`; `fullName` null → 미호출; `updateProfile` reject → 로그인 resolve
  - `identityToken` null → reject
  - `LoginScreen`: Android(`Platform.OS="android"`) 또는 `isAvailableAsync` false → Apple 버튼·안내 없음; iOS+가능 → 있음; `ERR_REQUEST_CANCELED` → 오류 문구 없음; 충돌 코드 → 충돌 문구; 연결 안내 true → `Alert.alert` 1번
  - `consumeLinkedNotice`: 첫 true, 두 번째 false, AsyncStorage reject → false
  - `deleteAccount`: Apple 사용자면 `revokeAccessToken(auth, "auth-code")`가 첫 `fetch`보다 먼저; 해지 reject → `fetch` 0번; 구글 사용자 → `signInAsync` 미호출
  - `AccountScreen`: Apple 사용자 확인 Alert에 안내 문구; 취소 오류 → "탈퇴 실패" Alert 없음
- [ ] **Step 3:** `npx jest src/auth src/account src/screens/__tests__/LoginScreen.test.tsx src/screens/__tests__/AccountScreen.test.tsx` → FAIL
- [ ] **Step 4:** 구현
- [ ] **Step 5:** 같은 명령 → PASS, `npx tsc --noEmit` 통과
- [ ] **Step 6: 커밋** — `feat(mobile): iOS Apple 로그인·연결 안내·탈퇴 시 토큰 해지`

---

### Task 7: 전체 검증과 실기 확인

- [ ] **Step 1:** `cd packages/core && npx vitest run && npm run build && git status --short dist` → 테스트 PASS, dist 변경 없음(이미 커밋됨)
- [ ] **Step 2:** `cd client && npx vitest run && VITE_FIREBASE_API_KEY= npx vitest run && npx tsc --noEmit -p . && npm run lint && npm run build` → 전부 성공
- [ ] **Step 3:** `cd mobile && npx jest && npx tsc --noEmit` → 성공
- [ ] **Step 4: 웹 실기 확인**(사용자와 함께, `client/.env.local`에 `VITE_APPLE_LOGIN_PREVIEW=true`, 끝나면 삭제) — 테스트 Gmail로:
  - Apple 새 가입 → 헤더에 "강수영"·이니셜 아바타
  - 구글로 가입한 계정에 Apple 처음 연결 → 이름 "강수영" 유지 + 연결 안내 토스트 1번, 다시 로그인하면 안 뜸
  - Apple 사용자 탈퇴 → Apple 확인 창 → 완료 → iPhone 설정 "Apple로 로그인"에서 ToDoDo 사라짐
  - 테스트 계정 정리(콘솔 삭제, iPhone 사용 중단)
- [ ] **Step 5:** 앱 실기 확인은 IAP 실측용 네이티브 빌드에서(spec "사용자 할 일" 3번) — 이 PR 범위에서는 하지 않음. PR 본문 "남은 확인"에 iOS 가입·이름 저장·탈퇴 해지(토큰 형태) 3건 명시
