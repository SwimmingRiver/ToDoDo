# 모바일 앱 출시 빌드 준비

앱(`mobile/`)을 스토어에 올리기 위한 빌드 설정·환경 변수·스크린샷 준비 정리. 계정·스토어 쪽 작업(Apple·Google 개발자 계정, 스토어 상품, 심사 제출)은 범위 밖이다.

## 빌드 프로필 (`mobile/eas.json`)

| 프로필 | 용도 | EAS 환경 | 비고 |
|---|---|---|---|
| `development` | 개발용 앱(dev client), iOS 시뮬레이터 | `preview` | Sentry 소스맵 업로드 끔 |
| `simulator` | 시뮬레이터용 일반 빌드 | `preview` | Sentry 소스맵 업로드 끔 |
| `production` | 스토어 제출용 | `production` | 빌드 번호 자동 증가, Sentry 소스맵 업로드 켬 |

```bash
cd mobile
eas build --platform ios --profile production
eas build --platform android --profile production
```

### 버전

- `cli.appVersionSource: "remote"` — 빌드 번호(iOS `buildNumber`, Android `versionCode`)는 EAS 서버가 관리하고, `production` 빌드마다 1씩 올린다(`autoIncrement`). `app.json`에 빌드 번호를 쓰지 않는다(써도 무시됨).
- 사용자에게 보이는 버전은 `app.json`의 `"version"`(현재 `1.0.0`)이며 **자동으로 올라가지 않는다**. 기능 릴리스 때 직접 올려 커밋한다.
- 첫 빌드는 빌드 번호 1로 시작한다. 이미 스토어에 올린 빌드가 있으면 첫 빌드 전에 `eas build:version:set`으로 마지막 제출 번호를 맞춘다.

### Sentry

`production`은 Sentry 소스맵 업로드를 켠 채로 빌드한다(`SENTRY_DISABLE_AUTO_UPLOAD`를 넣지 않는다). `SENTRY_AUTH_TOKEN`이 없으면 iOS 빌드의 소스맵 업로드 단계에서 실패한다. 토큰 없이 시험 빌드가 필요하면 그 빌드에만 일회성으로 `SENTRY_DISABLE_AUTO_UPLOAD=true`를 준다(프로필에 고정하지 않는다).

## EAS 환경 변수

`EXPO_PUBLIC_*`는 빌드 시 앱에 그대로 들어가는 공개 값이라 `plaintext`로 등록한다. 등록은 본인 터미널에서 직접 한다(값을 대화·저장소에 남기지 않는다).

| 변수 | 쓰는 곳 | `preview` | `production` |
|---|---|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | 로그인·Firestore | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | 〃 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | 〃 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | 〃 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | 〃 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | 〃 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` | 〃 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID` | 구글 로그인 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_BILLING_PROXY_URL` | 인앱결제 검증, 탈퇴 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_CALENDAR_PROXY_URL` | 구글 캘린더 연동, 탈퇴 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_AI_PROXY_URL` | AI 할 일 플랜 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_FEEDBACK_PROXY_URL` | 의견 보내기 | 미등록 | 미등록 |
| `EXPO_PUBLIC_REMINDER_PROXY_URL` | 탈퇴 시 알림 정리 | 등록됨 | 등록됨 |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry | — | 등록됨 |
| `SENTRY_AUTH_TOKEN` (secret) | Sentry 소스맵 업로드 | — | 등록됨 |

2026-11-22 두 환경 모두 등록 완료(의견 보내기 제외, `eas env:list`로 이름과 값이 비어 있지 않음만 확인). Firebase가 비면 로그인부터 실패하고, 프록시 URL이 비면 결제·캘린더·AI 플랜·탈퇴가 실패한다(`mobile/AGENTS.md` 참고). 프록시 URL은 운영 Worker 주소로, 로컬 `mobile/.env`의 값과 같다.

값을 바꾸거나 새로 추가할 때:

```bash
cd mobile   # node_modules가 최신인 체크아웃에서 실행(아래 주의)
eas env:set --environment production --visibility plaintext --name EXPO_PUBLIC_AI_PROXY_URL --value <값>
eas env:list --environment production   # 이름 확인
```

- `eas env:create`는 eas-cli 22부터 deprecated — 있으면 갱신까지 하는 `env:set`을 쓴다.
- eas는 등록·빌드 전에 `expo config`로 앱 설정을 읽는다. `node_modules`가 낡아 `app.json`의 플러그인(`expo-build-properties` 등)을 못 찾는 폴더에서 실행하면 `expo config --json exited with non-zero code: 1`로 실패한다. 먼저 `npm ci`.

## 스플래시

`app.json`의 `expo-splash-screen` 플러그인: 흰 배경(`#FFFFFF`) 가운데 도도새(`assets/splash-icon.png`, 폭 200). 앱은 로그인 상태가 정해질 때까지 스플래시를 유지하고(`src/shared/lib/splash.ts`), 8초가 지나면 무조건 걷는다.

네이티브 설정이라 **새 네이티브 빌드에서만** 반영된다. 개발 빌드는 설정을 전부 재현하지 않으므로(Expo 문서) 최종 모양은 `production` 빌드(TestFlight 등)에서 확인한다.

## 스크린샷

iPhone 전용(`supportsTablet: false`)이라 iPad 스크린샷은 필요 없다. 규격은 제출 시점에 App Store Connect·Play Console에서 다시 확인한다.

| 스토어 | 필요한 것 |
|---|---|
| App Store | iPhone 6.9형 스크린샷(세로 1320×2868 등) 최소 1장, 최대 10장 |
| Google Play | 휴대전화 스크린샷 최소 2장(세로 9:16 권장), 그래픽 이미지 1024×500 |

**촬영:** iOS는 iPhone 18 Pro Max 시뮬레이터에서 `xcrun simctl io booted screenshot <파일>`. 실제 개인 데이터가 아닌 데모 계정·데모 할 일로 찍는다(스크린샷은 공개 자료다).

**찍을 화면 후보 (순서 = 스토어 노출 순서):**
1. 오늘 — 주간 날짜 줄 + 오늘 할 일과 진행률
2. 목록 — 프로젝트 카드와 하위 할 일
3. AI로 계획 — 목표 입력 → 단계별 계획 미리보기 (프리미엄)
4. 캘린더 — 월간 보기 + 구글 캘린더 일정 오버레이 (프리미엄)
5. 통계 — 연속 달성일·완료율·완료 추이 (프리미엄)
6. 할 일 상세 — 반복 설정(매주 요일)

## 체험 offer 자격 (Play Console)

Google Play의 7일 무료 체험 offer 자격은 **"신규 고객만"**(이 앱 구독을 처음 사는 Google 계정)으로 설정한다. 약관 4판 제6조가 "탈퇴 후 1년 안에 같은 Google 계정으로 다시 가입하면 체험을 다시 제공하지 않는다"고 하는데, 앱 체험은 서버가 아니라 스토어가 판단하므로 이 설정이 없으면 같은 Google 계정으로 앱 체험이 반복된다. App Store는 같은 Apple ID에 체험을 다시 주지 않아 별도 설정이 필요 없다. 배경: `docs/superpowers/specs/2026-11-22-trial-reuse-after-deletion-design.md`.
