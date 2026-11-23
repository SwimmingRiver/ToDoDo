# Sign in with Apple 설계

- 날짜: 2026-10-25 (2026-11-22 개정: 10-25 이후 코드 변경 반영 / 2026-11-23 개정: 웹 실측 결과 반영 — 아래 "개정 내역")
- 브랜치: `feat/apple-login` (develop 기반)
- 선행: 회원 탈퇴(`2026-10-09-account-deletion-design.md`), 모바일 로그아웃(PR #144)
- 근거: Notion ADR "경쟁 할 일·플래너 앱 비교 분석과 스토어 출시 전 우선순위 (2026-10-25)" — 출시 차단 요인 1번

## 목적

- 스토어 심사 요건: App Store 심사 지침 4.8. 구글 같은 제3자 로그인을 쓰는 앱은 개인정보 보호 기능(이름·이메일만 수집, 이메일 숨기기, 광고 추적 없음)을 갖춘 동등한 로그인 옵션을 함께 제공해야 한다. 지금 앱은 구글 로그인만 있다.
- ToDoDo는 계정 하나로 웹과 앱을 같이 쓴다. iOS에서 Apple로 가입한 사용자가 웹(본 서비스, Paddle 결제 위치)에도 들어올 수 있어야 하므로 웹에도 넣는다.

**성공 기준**

- 웹과 iOS 앱에서 Apple로 가입·로그인할 수 있다.
- 같은 Apple 계정이면 웹과 iOS에서 같은 데이터가 보인다.
- 구글로 가입된 이메일로 Apple 로그인을 시도하면(또는 그 반대) 계정이 둘로 갈라지지 않는다 — Firebase가 자동으로 연결한다(실측 2026-11-23).
- 한국어 이름은 "성이름"(예: 강수영) 순서로 보인다. Apple을 나중에 연결해도 구글에서 받은 이름 순서가 뒤집히지 않는다.
- Apple 사용자가 탈퇴하면 Apple 쪽 토큰도 해지되어, iPhone 설정의 "Apple로 로그인" 목록에서 ToDoDo가 사라진다.
- 구글 사용자의 로그인·탈퇴 동작은 지금과 같다.

## 결정 사항

| 항목 | 결정 |
| --- | --- |
| 플랫폼 | 웹 + iOS. Android는 다음 단계(넣기로 함) — 진입점을 분리해 나중에 웹 방식으로 붙일 수 있게 둔다 |
| 기존 로그인 | 구글 로그인 유지 |
| 같은 이메일 충돌 | **자동 연결에 맡긴다.** Firebase 계정 연결 설정("동일한 이메일을 사용하는 계정 연결")에서 Apple·구글 둘 다 인증된 이메일을 넘기므로 양방향 모두 오류 없이 같은 uid에 붙는다(실측). 연결 안내 창·`linkWithCredential` 흐름은 만들지 않는다. 막기(연결 후 `unlink`)는 연결이 이미 서버에서 끝난 뒤라 불안정하고, 설정을 "제공자별 계정"으로 바꾸면 계정이 갈라지므로 택하지 않는다. 대신 **연결된 사실을 한 번 알린다**(아래 "연결 안내 토스트", 사용자 결정 2026-11-23). 혹시 `account-exists-with-different-credential`이 오면(설정 변경 등) "이미 다른 방법으로 가입된 이메일이에요. 그 방법으로 로그인해 주세요" 안내만 띄운다(사용자 결정 2026-11-23). 이메일 가리기(대리 주소) 사용자는 별도 계정이 되는 것을 받아들인다 |
| 이메일 가리기 안내 | 로그인 버튼 아래 한 줄: "전에 Google로 가입했다면 Google로 로그인해 주세요"(문구는 구현 때 다듬음). 구글 가입자가 Apple "이메일 가리기"로 새 빈 계정을 만드는 사고 예방(사용자 결정 2026-11-23). 웹·앱 공통 |
| 이름 순서 | Apple이 성·이름을 준 로그인에서는 우리가 직접 이름을 만들어 `updateProfile`로 저장한다. 한글이 들어 있으면 "성이름"(공백 없음), 아니면 "이름 성". Firebase가 만든 값("이름 성")을 그대로 두지 않는다(사용자 결정 2026-11-23) |
| 탈퇴 시 Apple 해지 | 탈퇴할 때 Apple 재인증을 한 번 더 받아 `revokeAccessToken`. 서버에 Apple 토큰·비밀키를 저장하지 않는다 |
| iOS 로그인 방식 | `expo-apple-authentication`(네이티브 창). 앱 안 웹 팝업은 쓰지 않음 |
| 웹 로그인 방식 | 기존과 같은 팝업(`signInWithPopup`). 팝업 처리기 `browserPopupRedirectResolver`를 호출마다 넘긴다(아래 "웹 팝업 처리기") |
| Services ID 도메인 | `tododo-app.com`(운영 authDomain)과 `tododo-83576.firebaseapp.com` 둘 다 등록 |
| 개인정보처리방침 | 약관 4판(탈퇴 후 체험 재지급 방지)과 묶어 한 번에 개정·공지 — 4판(2026-12-28 시행)에 Apple 항목 반영·배포 완료(#217). 웹 Apple 로그인 공개는 그 시행일 이후 |

회원 탈퇴 설계의 "재인증 하지 않음"은 구글 사용자에게는 그대로다. Apple 사용자만 토큰 해지를 위해 재인증한다(Auth 계정 삭제 자체는 여전히 서버가 한다).

## 범위 밖

- Android의 Apple 로그인
- 대리 이메일(`@privaterelay.appleid.com`)로 우리가 직접 메일 보내기 — 지금 직접 발송하는 메일이 없다. 나중에 생기면 Apple Developer의 "Sign in with Apple for Email Communication"에 발신 도메인 등록이 필요하다. Paddle 결제창은 사용자가 이메일을 따로 입력하므로 영향 없음
- 계정 화면의 "로그인 수단 연결" 메뉴(로그인 상태에서 다른 방법을 직접 붙이기)
- 이미 갈라진 두 계정의 데이터 병합
- 수동 계정 연결 흐름(연결 안내 창, `linkWithCredential`) — 자동 연결로 필요 없어짐

## 구조

### 공유 (`packages/core`)

순수 함수로 두고 웹과 앱이 같이 쓴다. Firebase에 의존하지 않는다.

- `formatAppleDisplayName(givenName, familyName)`: 둘 중 하나에 한글이 있으면 `familyName + givenName`, 아니면 `"givenName familyName"`. 한쪽만 있으면 그 값, 둘 다 비면 `null`(이름을 바꾸지 않음). 앞뒤 공백 정리.
- `isAccountExistsError(code)`: `auth/account-exists-with-different-credential` 판정(웹·앱 오류 문구 분기용).
- `shouldShowLinkedNotice(providerIds, seenKey)`: 로그인 제공자가 2개 이상이고 이 조합(정렬한 제공자 목록)을 아직 안내하지 않았으면 true. 저장소는 웹 localStorage / 앱 AsyncStorage를 각자 주입.

### 웹 (`client`)

| 파일 | 변경 |
| --- | --- |
| `src/shared/lib/firebase.ts` | `appleProvider = new OAuthProvider("apple.com")`, scope `email`·`name`. `initializeAuth`(팝업 처리기 없이 초기화)는 그대로 둔다 |
| `src/features/auth/api/` (신규) | 로그인 처리. 지금 `loginPage.tsx` 안에 있는 `signInWithPopup` 호출을 옮긴다. Apple 로그인 뒤 이름 보정(아래 "이름·프로필 사진") |
| `src/features/auth/pages/loginPage.tsx` | 구글 버튼 아래 "Apple로 로그인" 버튼과 이메일 가리기 안내 한 줄. `account-exists` 오류면 전용 안내 문구 |
| 연결 안내 토스트 | 로그인 직후 `shouldShowLinkedNotice`가 true면 기존 토스트로 "이제 Google·Apple 둘 다로 로그인할 수 있어요" 한 번. 키는 uid별 |
| `src/features/account/api/deleteAccount.ts` | 0단계(Apple 해지) 추가 |
| 탈퇴 창(`accountDeletionDialog`) | Apple 사용자에게 "Apple 확인 창이 한 번 더 뜬다" 안내. 기존 App Store 구독 경고와 함께 |
| 헤더(`layouts/header/header.tsx`)·모바일 헤더(`layouts/mobileHeader/mobileHeader.tsx`)·드로어(`layouts/snb/mobileDrawer.tsx`) | 이름·사진 대체 표시. 지금은 셋 다 `photoURL \|\| ""`라 사진 없으면 깨진 이미지 |

#### 웹 팝업 처리기

첫 화면 성능 때문에 `auth`는 `initializeAuth`로 팝업 처리기 없이 만든다(#195). 그래서 팝업을 여는 **모든** 호출에 `browserPopupRedirectResolver`를 세 번째 인자로 넘겨야 한다 — 빠뜨리면 런타임 오류다. 해당 호출: 구글 로그인(기존), Apple 로그인, 탈퇴 0단계 `reauthenticateWithPopup`. 테스트로 "처리기를 넘겼는지"를 확인한다.

Apple 버튼은 Apple 디자인 가이드를 따른다: 검정 바탕 + 흰 Apple 로고, 구글 버튼과 같은 크기·비중. 로그인 수단 간 동등한 노출도 심사 기준이다.

### iOS 앱 (`mobile`)

| 파일 | 변경 |
| --- | --- |
| `package.json` | `expo-apple-authentication`, `expo-crypto`(nonce SHA-256) 추가 — `npx expo install`로 Expo 57 호환 버전 |
| `app.json` | `ios.usesAppleSignIn: true`, plugins에 `expo-apple-authentication`. Sentry(#208)·출시 빌드 설정(#211)은 이미 병합됨 |
| `src/auth/appleSignIn.ts` (신규) | 네이티브 로그인 → `OAuthProvider("apple.com").credential({ idToken, rawNonce })` → `signInWithCredential`. 기존 `googleSignIn.ts`와 같은 모양. 네이티브 결과의 `fullName.givenName`·`familyName`이 있으면 `formatAppleDisplayName`으로 만들어 `updateProfile` |
| 로그인 화면 | Apple 버튼(iOS에서만, `AppleAuthentication.isAvailableAsync()`로 확인)과 이메일 가리기 안내 한 줄. `account-exists` 오류면 웹과 같은 안내 문구 |
| 연결 안내 | 웹과 같은 조건·문구, 앱 토스트(없으면 Alert)로 한 번 |
| `src/account/deleteAccount.ts` | 0단계(Apple 해지) 추가. 지금 흐름(캘린더 묶음 해제 → reminder-proxy → billing-proxy `/account/delete`(Google Play 구독 해지 포함)) 앞에 둔다 |
| 계정 화면 탈퇴 확인 | Apple 사용자 안내 문구(웹과 같은 내용) |

nonce: 재생 공격 방지를 위해 무작위 nonce를 만들어 SHA-256 해시를 Apple에 넘기고, 원본은 Firebase credential에 넘긴다.

### 이름·프로필 사진

웹 헤더(`layouts/header/header.tsx`)·모바일 헤더·드로어·프로필 메뉴는 지금 구글이 주는 `displayName`·`photoURL`을 그대로 쓴다. Apple은 사진을 주지 않고, 이름은 처음 승인할 때 한 번만 준다.

실측(2026-11-23)으로 확인한 것:

- 웹 팝업에서도 첫 승인 때 Firebase가 `displayName`을 채운다. 단 `firstName + " " + lastName` 순서라 한국어 이름이 "수영 강"처럼 뒤집힌다.
- 구글로 가입한 계정에 Apple을 처음 연결해도 Firebase가 `displayName`을 이 뒤집힌 값으로 **덮어쓴다**(구글의 "강수영" → "수영 강").
- 공개 API `getAdditionalUserInfo(result).profile`에는 이름이 없다(Apple ID 토큰에 이름이 없다). 성·이름이 따로 들어 있는 곳은 SDK 내부 필드 `result._tokenResponse.firstName`·`lastName`뿐이다.

처리:

- **웹:** Apple 로그인 성공 뒤 `_tokenResponse`에서 `firstName`·`lastName`을 읽어 `formatAppleDisplayName` 결과가 있으면 `updateProfile`. 내부 필드라 타입을 좁게 정의해 한곳에서만 읽고, 값이 없거나 모양이 바뀌면 아무것도 하지 않는다(Firebase 값 유지 — 최악이어도 지금과 같음). 두 번째 로그인부터는 Apple이 이름을 안 주므로 보정도 일어나지 않는다.
- **iOS:** 네이티브 결과의 `fullName`(공개 필드)을 쓴다. 이 경로는 `signInWithCredential`이라 Firebase가 이름을 채우지 않을 수 있으니 같은 함수로 저장한다.
- `updateProfile`은 `auth.currentUser`만 바꾸고 `onAuthStateChanged`를 다시 부르지 않는다. 헤더가 바로 새 이름을 보이도록 AuthProvider의 사용자 상태를 갱신하는 방법을 구현 계획에서 정한다.
- 사진이 없으면 이니셜 아바타.
- 이름이 없으면 이메일 앞부분, 그것도 없으면 "사용자".

### 바뀌지 않는 것

- Firestore 데이터 구조와 `firestore.rules` — 모두 uid 기준
- Worker 4개 — Firebase ID 토큰만 검증
- 프리미엄 판단(`premiumUntil` 클레임)과 결제 흐름

## 흐름

### 같은 이메일 (자동 연결)

실측(2026-11-23, 운영 프로젝트, 테스트 Gmail):

| 순서 | 결과 |
| --- | --- |
| Apple로 가입(Gmail 공유) → 같은 Gmail로 구글 로그인 | 같은 uid, `isNewUser: false`, 제공자 `apple.com`+`google.com`. 덮어쓰기 없음 |
| 구글로 가입 → Apple 로그인(같은 Gmail 공유) | 오류 없이 같은 uid, 제공자 `google.com`+`apple.com` |
| Apple 이메일 가리기 | 대리 주소로 별도 계정(예상대로) |

전제: Firebase 콘솔 Authentication → 설정 → 사용자 계정 연결이 "동일한 이메일을 사용하는 계정 연결"이어야 한다. 이 설정을 바꾸면 이 설계의 전제가 깨진다.

우리 코드가 할 일:

1. **연결 안내 토스트.** 로그인 직후 `providerData`의 제공자가 2개 이상이고, 이 기기에서 이 uid의 그 조합을 아직 안내하지 않았으면 "이제 Google·Apple 둘 다로 로그인할 수 있어요"를 한 번 보여 주고 기록한다. 기기별 기록이라 다른 기기에서도 한 번씩 뜰 수 있으므로 문구는 사건("연결됐어요")이 아니라 상태("둘 다로 로그인할 수 있어요")로 쓴다. 이유: 사용자가 다른 버튼으로 들어왔는데 기존 할 일이 보이는 까닭을 알고, 탈퇴 때 Apple 확인 창이 뜨는 것도 덜 놀랍다.
2. **`account-exists-with-different-credential` 방어 문구.** 지금 설정에서는 실측상 나오지 않는다(웹·앱 같음).

### 탈퇴

기존 3단계(캘린더 해제 → 알림 삭제 → 결제 서버에서 구독 해지·계정 삭제) 앞에 0단계를 넣는다. 결제 서버 단계는 IAP 도입(#188) 뒤 Google Play 구독 서버 해지까지 하고, 실패하면 502로 멈춘다 — 0단계가 앞에 있어도 이 원칙과 충돌하지 않는다(0단계는 되풀이해도 안전). `providerData`에 `apple.com`이 있는 계정만 해당한다.

0. Apple 재인증 → `revokeAccessToken(auth, token)`
   - 웹: `reauthenticateWithPopup(user, appleProvider, browserPopupRedirectResolver)` → `OAuthProvider.credentialFromResult(result).accessToken`(실측: 웹 팝업 결과에 접근 토큰이 들어옴)
   - iOS: `AppleAuthentication.signInAsync()`로 `authorizationCode`를 받아 Identity Toolkit `v2/accounts:revokeToken`에 `tokenType: "CODE"`로 직접 보낸다. JS SDK `revokeAccessToken`은 `tokenType`을 `ACCESS_TOKEN`으로 고정해 인증 코드를 넘기면 종류가 틀린다(SDK 소스 확인, 2026-11-23). 실제 해지 여부는 네이티브 빌드 때 실측
   - Android: Apple 창을 띄울 수 없어 해지를 건너뛰고 탈퇴를 진행한다(Apple ID의 "Apple로 로그인" 목록에 남을 수 있음, 웹에서 탈퇴하면 해지됨)
   - Apple 단계에서 실패하면(취소 제외) "Apple 확인에 실패해 아무것도 삭제되지 않았어요. 다시 시도해 주세요." — 뒤 단계 실패는 기존 문구

0단계를 맨 앞에 두는 이유:

- 웹 팝업은 클릭 직후에 열려야 한다. 서버 호출을 기다린 뒤 열면 차단된다.
- 사용자가 취소해도 아직 아무것도 지워지지 않았다.
- 계정이 삭제된 뒤에는 해지를 요청할 수 없다.

해지에 실패하면 1~3단계를 진행하지 않고 "다시 시도해 주세요". 기존 원칙(일부만 지운 채 성공으로 끝내지 않는다)과 같다. 재시도하면 재인증·해지를 처음부터 하므로 여러 번 해도 안전하다.

## 구현 전 확인할 것 — 결과

1. ~~충돌 오류와 이메일이 넘어오는지~~ → 충돌 오류 자체가 나지 않고 자동 연결(2026-11-23 웹 실측). 수동 연결 흐름 삭제.
2. **남음:** `revokeAccessToken`의 iOS 토큰 형태(인증 코드로 알고 있음)와 React Native에서 JS SDK로 동작하는지. 웹은 접근 토큰을 받는 것까지 확인. IAP 실측용 네이티브 빌드에서 확인한다.
3. ~~Apple 먼저 가입 후 구글 로그인 시 덮어쓰기~~ → 덮어쓰지 않고 자동 연결(실측).
4. ~~웹 팝업에서 이름이 채워지는지~~ → 채워지지만 순서가 뒤집힘 → "이름 순서" 결정으로 처리.

## 테스트

| 대상 | 위치 | 확인 |
| --- | --- | --- |
| 이름 만들기·오류 판정·연결 안내 | `packages/core` | 한글 → 성이름(공백 없음), 영문 → 이름 성, 한쪽만, 둘 다 빔 → null, 공백 정리. `account-exists` 판정. 연결 안내: 제공자 1개 → false, 2개 처음 → true, 같은 조합 두 번째 → false, 순서만 다른 조합 → false |
| 웹 로그인 | client vitest | Apple 버튼 → 팝업 처리기 전달, `_tokenResponse`에 이름 있으면 `updateProfile`(한글 순서), 없으면 호출 안 함. `account-exists` 오류 → 전용 문구. 팝업 닫기 시 오류 메시지 없음. 제공자 2개 첫 로그인 → 토스트 1번, 재로그인 → 없음 |
| 웹 탈퇴 | client vitest(기존 `deleteAccount` 테스트 확장) | Apple 사용자만 0단계, 해지 실패 시 1~3단계 미호출, 구글 사용자는 기존과 동일 |
| 앱 로그인·탈퇴 | mobile jest | 웹과 같은 경우 + Apple 버튼이 iOS에서만 보임 + `fullName`으로 이름 저장 |
| 이름·사진 대체 | client vitest | 이니셜 아바타, 이메일 앞부분 → "사용자" |

자동 연결·이름 덮어쓰기 같은 Firebase 동작은 mock으로 검증할 수 없으므로(가짜는 가정대로만 동작) 실기 확인으로 한다.

### 실기 확인

- [ ] 웹: Apple로 새로 가입 → 로그인 → 헤더에 "성이름" 표시
- [ ] 웹: 구글 계정에 Apple 처음 연결 → 이름이 뒤집히지 않음 + 연결 안내 토스트 1번, 다시 로그인하면 안 뜸
- [ ] iOS: Apple로 새로 가입 → 이름 저장 → 같은 Apple 계정으로 웹 로그인 시 같은 데이터
- [x] 구글로 가입된 이메일로 Apple 로그인 → 같은 계정에 연결(2026-11-23 웹, 임시 코드)
- [x] 반대 방향: Apple 먼저 가입 → 같은 Gmail로 구글 로그인 → 덮어쓰기 없이 연결(2026-11-23 웹)
- [x] 이메일 가리기로 가입 → 별도 계정(2026-11-23 웹)
- [ ] Apple 사용자 탈퇴 → iPhone 설정 "Apple로 로그인" 목록에서 ToDoDo 사라짐

## 사용자 할 일 (콘솔)

0. ~~Apple Developer Program 가입~~ — 2026-11-22 완료.
1. ~~Apple Developer: App ID에 Sign in with Apple, Services ID(`com.swimmingriver.tododo.web`, 도메인·return URL 2개), 키(.p8)~~ — 2026-11-23 완료.
2. ~~Firebase 콘솔 Apple 제공자 설정~~ — 2026-11-23 완료(웹 실측 성공으로 확인).
3. EAS: `usesAppleSignIn`이 들어간 개발 빌드 새로 만들기(기존 빌드에는 기능 없음). IAP 실측용 네이티브 빌드와 한 번에 묶는다(개인 Mac 디스크 여유가 적어 재빌드 횟수를 줄인다)
4. ~~약관 4판 개정·공지~~ — #217로 배포(2026-12-28 시행).

실측용 테스트 Gmail(Apple ID에 추가 이메일로 등록)은 앱 실측에도 다시 쓴다. 실측할 때마다 Firebase 콘솔에서 테스트 계정을 지우고 iPhone 설정에서 ToDoDo의 Apple 로그인 사용을 중단해야 다시 "첫 승인" 상태가 된다.

## 개인정보처리방침 개정

4판(2026-11-27 공지, 2026-12-28 시행)에 반영 완료: Apple 로그인으로 받는 정보(이메일 또는 Apple 대리 주소, 첫 가입 때 이름), 체험 사용 확인값의 Apple 식별자.

- **웹에서 Apple 로그인을 여는 배포는 4판 시행일(2026-12-28) 이후.** iOS 앱은 스토어 출시 전이므로 앱 쪽 구현·실측은 먼저 해도 된다. 웹 코드는 미리 병합하되 버튼 노출을 시행일 이후로 막는 방법은 구현 계획에서 정한다.

## 개정 내역

### 2026-11-22

10-25 이후 바뀐 코드 기준으로 고쳤다.

- authDomain이 `tododo-app.com`으로 바뀜(#158) → Services ID에 두 도메인 등록. 10-25판의 "자체 도메인으로 바꿔도 Services ID는 그대로"는 틀린 내용이라 삭제
- 웹 `auth`가 `initializeAuth`로 바뀌고 팝업 처리기를 호출마다 넘기게 됨(#195) → "웹 팝업 처리기" 절 추가
- 탈퇴 결제 단계가 Google Play 구독 해지까지 하게 됨(IAP #188) → 0단계와의 관계 명시, 탈퇴 창 안내 추가
- 앱 `app.json`을 Sentry(#208)·출시 빌드 설정과 같이 건드림 → 작업 순서 명시. `expo-crypto` 의존성 추가
- 개인정보처리방침 개정을 약관 4판과 묶음, 체험 재지급 방지 식별자에 Apple `sub` 포함, 대리 이메일 발송은 범위 밖

### 2026-11-23

웹 실측(운영 프로젝트, 임시 코드, 커밋 안 함) 결과를 반영했다.

- 같은 이메일은 양방향 모두 자동 연결 → 수동 연결 흐름(안내 창, `linkWithCredential`, core 연결 판단·이메일 마스킹) 삭제, `account-exists` 방어 문구만 남김
- 웹에서도 이름이 채워지지만 한국어 순서가 뒤집히고, Apple 첫 연결 시 구글 이름을 덮어씀 → `formatAppleDisplayName` + `updateProfile` 추가
- 웹 탈퇴 해지 토큰은 `credentialFromResult(...).accessToken`으로 받음을 확인. iOS 토큰 형태만 남음
- 체험 재지급 방지·4판은 #214·#217로 끝나 범위 밖 목록에서 뺌
- (구현 중) iOS 해지는 SDK 대신 `revokeToken` 직접 호출(`CODE`), Android는 해지 생략, iOS 개발 지역 `ko`(시스템이 그리는 Apple 버튼 한국어), Apple 단계 실패 문구 분리
- 자동 연결을 조용히 두지 않고 한 번 안내(토스트), 막기는 기각(서버에서 이미 연결된 뒤라 unlink가 불안정, 설정 변경은 계정 분리). 이메일 가리기로 인한 빈 계정 사고 예방 안내 한 줄 추가
