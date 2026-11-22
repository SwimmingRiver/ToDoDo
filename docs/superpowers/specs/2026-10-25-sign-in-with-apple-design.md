# Sign in with Apple 설계

- 날짜: 2026-10-25 (2026-11-22 개정: 10-25 이후 코드 변경 반영 — 아래 "개정 내역")
- 브랜치: `docs/sign-in-with-apple-spec` (develop 기반)
- 선행: 회원 탈퇴(`2026-10-09-account-deletion-design.md`), 모바일 로그아웃(PR #144)
- 근거: Notion ADR "경쟁 할 일·플래너 앱 비교 분석과 스토어 출시 전 우선순위 (2026-10-25)" — 출시 차단 요인 1번

## 목적

- 스토어 심사 요건: App Store 심사 지침 4.8. 구글 같은 제3자 로그인을 쓰는 앱은 개인정보 보호 기능(이름·이메일만 수집, 이메일 숨기기, 광고 추적 없음)을 갖춘 동등한 로그인 옵션을 함께 제공해야 한다. 지금 앱은 구글 로그인만 있다.
- ToDoDo는 계정 하나로 웹과 앱을 같이 쓴다. iOS에서 Apple로 가입한 사용자가 웹(본 서비스, Paddle 결제 위치)에도 들어올 수 있어야 하므로 웹에도 넣는다.

**성공 기준**

- 웹과 iOS 앱에서 Apple로 가입·로그인할 수 있다.
- 같은 Apple 계정이면 웹과 iOS에서 같은 데이터가 보인다.
- 구글로 가입된 이메일로 Apple 로그인을 시도하면(또는 그 반대) 계정이 둘로 갈라지지 않고 연결된다.
- Apple 사용자가 탈퇴하면 Apple 쪽 토큰도 해지되어, iPhone 설정의 "Apple로 로그인" 목록에서 ToDoDo가 사라진다.
- 구글 사용자의 로그인·탈퇴 동작은 지금과 같다.

## 결정 사항

| 항목 | 결정 |
| --- | --- |
| 플랫폼 | 웹 + iOS. Android는 다음 단계(넣기로 함) — 진입점을 분리해 나중에 웹 방식으로 붙일 수 있게 둔다 |
| 기존 로그인 | 구글 로그인 유지 |
| 같은 이메일 충돌 | 연결 유도. `account-exists-with-different-credential` 오류 시 기존 방법으로 로그인하게 안내한 뒤 `linkWithCredential`로 붙인다. 이메일 가리기(대리 주소) 사용자는 별도 계정이 되는 것을 받아들인다 |
| 탈퇴 시 Apple 해지 | 탈퇴할 때 Apple 재인증을 한 번 더 받아 `revokeAccessToken`. 서버에 Apple 토큰·비밀키를 저장하지 않는다 |
| iOS 로그인 방식 | `expo-apple-authentication`(네이티브 창). 앱 안 웹 팝업은 쓰지 않음 |
| 웹 로그인 방식 | 기존과 같은 팝업(`signInWithPopup`). 팝업 처리기 `browserPopupRedirectResolver`를 호출마다 넘긴다(아래 "웹 팝업 처리기") |
| Services ID 도메인 | `tododo-app.com`(운영 authDomain)과 `tododo-83576.firebaseapp.com` 둘 다 등록 |
| 개인정보처리방침 | 약관 4판(탈퇴 후 체험 재지급 방지)과 묶어 한 번에 개정·공지. 웹 Apple 로그인 공개는 그 시행일 이후 |

회원 탈퇴 설계의 "재인증 하지 않음"은 구글 사용자에게는 그대로다. Apple 사용자만 토큰 해지를 위해 재인증한다(Auth 계정 삭제 자체는 여전히 서버가 한다).

## 범위 밖

- Android의 Apple 로그인
- 대리 이메일(`@privaterelay.appleid.com`)로 우리가 직접 메일 보내기 — 지금 직접 발송하는 메일이 없다. 나중에 생기면 Apple Developer의 "Sign in with Apple for Email Communication"에 발신 도메인 등록이 필요하다. Paddle 결제창은 사용자가 이메일을 따로 입력하므로 영향 없음
- 탈퇴 후 체험 재지급 방지 구현 — 별도 작업. 단 그 설계의 식별자 HMAC 대상에 Apple `sub`도 포함해야 한다(Apple 사용자도 같은 구멍)
- 계정 화면의 "로그인 수단 연결" 메뉴(로그인 상태에서 다른 방법을 직접 붙이기)
- 이미 갈라진 두 계정의 데이터 병합

## 구조

### 공유 (`packages/core`)

- 계정 연결 판단 로직을 순수 함수로 둔다. Firebase에 의존하지 않고 오류 코드·이메일 같은 값만 받는다. 웹과 앱이 같이 쓴다.
  - 어떤 오류가 연결 안내 대상인지 판정
  - 연결 직전 이메일 일치 확인(다른 계정을 고르면 거부)
  - 오류 이메일 마스킹(`a***@gmail.com`)

### 웹 (`client`)

| 파일 | 변경 |
| --- | --- |
| `src/shared/lib/firebase.ts` | `appleProvider = new OAuthProvider("apple.com")`, scope `email`·`name`. `initializeAuth`(팝업 처리기 없이 초기화)는 그대로 둔다 |
| `src/features/auth/api/` (신규) | 로그인·연결 처리. 지금 `loginPage.tsx` 안에 있는 `signInWithPopup` 호출을 옮긴다. 구글·Apple 두 방향의 연결 처리를 한곳에서 |
| `src/features/auth/pages/loginPage.tsx` | 구글 버튼 아래 "Apple로 로그인" 버튼. 연결 안내 창 |
| `src/features/account/api/deleteAccount.ts` | 0단계(Apple 해지) 추가 |
| 탈퇴 창(`accountDeletionDialog`) | Apple 사용자에게 "Apple 확인 창이 한 번 더 뜬다" 안내. 기존 App Store 구독 경고와 함께 |
| 헤더(`layouts/header/header.tsx`)·모바일 헤더(`layouts/mobileHeader/mobileHeader.tsx`)·드로어(`layouts/snb/mobileDrawer.tsx`) | 이름·사진 대체 표시. 지금은 셋 다 `photoURL \|\| ""`라 사진 없으면 깨진 이미지 |

#### 웹 팝업 처리기

첫 화면 성능 때문에 `auth`는 `initializeAuth`로 팝업 처리기 없이 만든다(#195). 그래서 팝업을 여는 **모든** 호출에 `browserPopupRedirectResolver`를 세 번째 인자로 넘겨야 한다 — 빠뜨리면 런타임 오류다. 해당 호출: Apple 로그인, 연결 안내 뒤 기존 방법 로그인(구글·Apple), 탈퇴 0단계 `reauthenticateWithPopup`. 테스트로 "처리기를 넘겼는지"를 확인한다.

Apple 버튼은 Apple 디자인 가이드를 따른다: 검정 바탕 + 흰 Apple 로고, 구글 버튼과 같은 크기·비중. 로그인 수단 간 동등한 노출도 심사 기준이다.

### iOS 앱 (`mobile`)

| 파일 | 변경 |
| --- | --- |
| `package.json` | `expo-apple-authentication`, `expo-crypto`(nonce SHA-256) 추가 — `npx expo install`로 Expo 57 호환 버전 |
| `app.json` | `ios.usesAppleSignIn: true`, plugins에 `expo-apple-authentication`. Sentry(#208)·출시 빌드 설정(Task 8)도 이 파일을 건드리므로 그 뒤에 작업 |
| `src/auth/appleSignIn.ts` (신규) | 네이티브 로그인 → `OAuthProvider("apple.com").credential({ idToken, rawNonce })` → `signInWithCredential`. 기존 `googleSignIn.ts`와 같은 모양. 첫 가입 시 받은 이름을 `updateProfile`로 저장 |
| 로그인 화면 | Apple 버튼(iOS에서만, `AppleAuthentication.isAvailableAsync()`로 확인). 연결 안내는 Alert |
| `src/account/deleteAccount.ts` | 0단계(Apple 해지) 추가. 지금 흐름(캘린더 묶음 해제 → reminder-proxy → billing-proxy `/account/delete`(Google Play 구독 해지 포함)) 앞에 둔다 |
| 계정 화면 탈퇴 확인 | Apple 사용자 안내 문구(웹과 같은 내용) |

nonce: 재생 공격 방지를 위해 무작위 nonce를 만들어 SHA-256 해시를 Apple에 넘기고, 원본은 Firebase credential에 넘긴다.

### 이름·프로필 사진

웹 헤더(`layouts/header/header.tsx`)·모바일 헤더·드로어·프로필 메뉴는 지금 구글이 주는 `displayName`·`photoURL`을 그대로 쓴다. Apple은 사진을 주지 않고, 이름은 첫 가입 때 한 번만 준다(웹 팝업에서는 Firebase가 이름을 채우지 않을 수 있음 — 실측).

- iOS 첫 가입 시 받은 이름은 `updateProfile`로 저장한다.
- 사진이 없으면 이니셜 아바타.
- 이름이 없으면 이메일 앞부분, 그것도 없으면 "사용자".

### 바뀌지 않는 것

- Firestore 데이터 구조와 `firestore.rules` — 모두 uid 기준
- Worker 4개 — Firebase ID 토큰만 검증
- 프리미엄 판단(`premiumUntil` 클레임)과 결제 흐름

## 흐름

### 계정 연결

웹:

1. Apple(또는 구글)로 로그인 → `auth/account-exists-with-different-credential`. `OAuthProvider.credentialFromError`(구글이면 `GoogleAuthProvider.credentialFromError`)로 방금 받은 인증 정보를, `error.customData.email`로 이메일을 꺼내 기억한다.
2. 안내 창: "이미 Google로 가입된 이메일(a***@gmail.com)이에요. Google로 로그인하면 Apple 로그인이 연결됩니다." [Google로 계속] 버튼.
   - 버튼을 따로 누르게 하는 이유: 브라우저는 사용자 클릭 직후에만 팝업을 허용한다. 오류 직후 코드에서 바로 팝업을 열면 차단된다.
3. 기존 방법으로 로그인 완료 → 이메일이 1번과 같으면 `linkWithCredential(user, 기억한 인증)`.
4. 다른 계정을 고르면 로그아웃하고 "다른 계정이에요" 안내. 안내 창을 닫으면 로그인하지 않은 상태로 둔다. 어느 쪽이든 새 계정은 만들어지지 않는다.

iOS: 같은 순서. 안내는 Alert, 기존 방법 로그인은 기존 네이티브 구글 로그인.

### 탈퇴

기존 3단계(캘린더 해제 → 알림 삭제 → 결제 서버에서 구독 해지·계정 삭제) 앞에 0단계를 넣는다. 결제 서버 단계는 IAP 도입(#188) 뒤 Google Play 구독 서버 해지까지 하고, 실패하면 502로 멈춘다 — 0단계가 앞에 있어도 이 원칙과 충돌하지 않는다(0단계는 되풀이해도 안전). `providerData`에 `apple.com`이 있는 계정만 해당한다.

0. Apple 재인증 → `revokeAccessToken(auth, token)`
   - 웹: `reauthenticateWithPopup(user, appleProvider)`
   - iOS: `AppleAuthentication.signInAsync()`로 `authorizationCode`를 받음

0단계를 맨 앞에 두는 이유:

- 웹 팝업은 클릭 직후에 열려야 한다. 서버 호출을 기다린 뒤 열면 차단된다.
- 사용자가 취소해도 아직 아무것도 지워지지 않았다.
- 계정이 삭제된 뒤에는 해지를 요청할 수 없다.

해지에 실패하면 1~3단계를 진행하지 않고 "다시 시도해 주세요". 기존 원칙(일부만 지운 채 성공으로 끝내지 않는다)과 같다. 재시도하면 재인증·해지를 처음부터 하므로 여러 번 해도 안전하다.

## 구현 전 확인할 것 (공식 문서 + 실측)

1. 이메일 열거 보호가 켜진 프로젝트에서도 `account-exists-with-different-credential`과 이메일이 넘어오는지. 이메일이 없으면 안내 문구에서 이메일 표시만 뺀다.
2. Firebase JS SDK `revokeAccessToken`이 Apple 해지에 받는 토큰 형태(웹: 접근 토큰 / iOS: 인증 코드로 알고 있음). React Native에서 JS SDK로 동작하는지.
3. Apple로 먼저 가입한 계정에 같은 Gmail로 구글 로그인 시, 구글이 Gmail의 신뢰 제공자라 기존 Apple 연결을 덮어쓰는지.
4. 웹 팝업 Apple 로그인에서 이름이 `displayName`에 채워지는지.

계정 가입이 끝났으므로(2026-11-22) 구현 계획의 첫 태스크로 이 4건을 실측하고, 결과에 따라 연결·탈퇴 설계를 확정한 뒤 나머지를 구현한다.

## 테스트

| 대상 | 위치 | 확인 |
| --- | --- | --- |
| 연결 판단 로직 | `packages/core` | 연결 대상 오류 판정, 이메일 불일치 거부, 마스킹 |
| 웹 로그인·연결 | client vitest | Apple 클릭 → 오류 → 안내 → 구글 로그인 → 연결. 팝업 닫기 시 오류 메시지 없음 |
| 웹 탈퇴 | client vitest(기존 `deleteAccount` 테스트 확장) | Apple 사용자만 0단계, 해지 실패 시 1~3단계 미호출, 구글 사용자는 기존과 동일 |
| 앱 로그인·탈퇴 | mobile jest | 웹과 같은 경우 + Apple 버튼이 iOS에서만 보임 |
| 이름·사진 대체 | client vitest | 이니셜 아바타, 이메일 앞부분 → "사용자" |

위 "구현 전 확인할 것"은 mock으로 검증할 수 없으므로(가짜는 가정대로만 동작) 실기 확인으로 한다.

### 실기 확인

- [ ] 웹: Apple로 새로 가입 → 로그인 → 헤더 표시
- [ ] iOS: Apple로 새로 가입 → 이름 저장 → 같은 Apple 계정으로 웹 로그인 시 같은 데이터
- [ ] 구글로 가입된 이메일로 Apple 로그인 → 연결 안내 → 연결 → 이후 Apple로 바로 로그인
- [ ] 반대 방향: Apple 먼저 가입 → 같은 Gmail로 구글 로그인(덮어쓰기 여부)
- [ ] 이메일 가리기로 가입 → 별도 계정으로 정상 동작
- [ ] Apple 사용자 탈퇴 → iPhone 설정 "Apple로 로그인" 목록에서 ToDoDo 사라짐

## 사용자 할 일 (콘솔)

0. ~~Apple Developer Program 가입~~ — 2026-11-22 완료.
1. Apple Developer
   - App ID `com.swimmingriver.tododo`에 Sign in with Apple 기능 켜기
   - 웹용 Services ID 생성. 도메인·return URL을 둘 다 등록:
     - `tododo-app.com` → `https://tododo-app.com/__/auth/handler` (운영 authDomain, #158)
     - `tododo-83576.firebaseapp.com` → `https://tododo-83576.firebaseapp.com/__/auth/handler` (authDomain이 다른 환경용)
   - 키(.p8) 발급, 키 ID·Team ID 확인
2. Firebase 콘솔 → Authentication → Apple 제공자 사용 설정, Services ID·Team ID·키 입력(`revokeAccessToken`에 필요)
3. EAS: `usesAppleSignIn`이 들어간 개발 빌드 새로 만들기(기존 빌드에는 기능 없음). IAP 실측용 네이티브 빌드와 한 번에 묶는다(개인 Mac 디스크 여유가 적어 재빌드 횟수를 줄인다)
4. 약관 4판 개정·공지(아래)

## 개인정보처리방침 개정

지금 방침(2026-11-27 판)은 "Google 로그인 시 Google로부터 이메일, 이름, 프로필 사진을 받습니다"만 적혀 있다. Apple 로그인으로 받는 정보(이메일 또는 Apple 대리 주소, 첫 가입 때 이름)와 Apple을 정보 제공 주체로 추가해야 한다.

- 탈퇴 후 체험 재지급 방지(식별자 HMAC 보관)도 방침 개정이 필요하므로 **약관 4판으로 묶어 한 번에 개정·공지**한다(사용자 결정 2026-11-22).
- 판 구조는 `client/src/features/legal/content/index.ts`의 `LEGAL_EDITIONS`(시행일별 본문). 시행일 7일 전 공지.
- **웹에서 Apple 로그인을 여는 배포는 4판 시행일 이후.** iOS 앱은 스토어 출시 전이므로 앱 쪽 구현·실측은 먼저 해도 된다.

## 개정 내역 (2026-11-22)

10-25 이후 바뀐 코드 기준으로 고쳤다.

- authDomain이 `tododo-app.com`으로 바뀜(#158) → Services ID에 두 도메인 등록. 10-25판의 "자체 도메인으로 바꿔도 Services ID는 그대로"는 틀린 내용이라 삭제
- 웹 `auth`가 `initializeAuth`로 바뀌고 팝업 처리기를 호출마다 넘기게 됨(#195) → "웹 팝업 처리기" 절 추가
- 탈퇴 결제 단계가 Google Play 구독 해지까지 하게 됨(IAP #188) → 0단계와의 관계 명시, 탈퇴 창 안내 추가
- 앱 `app.json`을 Sentry(#208)·출시 빌드 설정과 같이 건드림 → 작업 순서 명시. `expo-crypto` 의존성 추가
- 개인정보처리방침 개정을 약관 4판과 묶음, 체험 재지급 방지 식별자에 Apple `sub` 포함, 대리 이메일 발송은 범위 밖
