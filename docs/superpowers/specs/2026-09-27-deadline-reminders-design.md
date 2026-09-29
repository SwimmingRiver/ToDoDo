# 마감 알림(웹 푸시) — 설계

## Context

2026-09-26 로드맵 순서가 **배포 수동 체크 → 마감 알림(무료) → 결제/구독 → 모바일 웹격차 → 스토어 심사**로 바뀌었다. 알림은 무료 기능이라 결제와 독립적이고, 알림 발송 구조(서버 푸시 vs 로컬)가 모바일 알림 구조를 결정하므로 모바일 격차 작업 전에 정한다.

목적은 **사용자가 마감을 놓치지 않게 하는 것**이다. 탭을 닫아 둬도 마감 전에 알림이 와야 한다.

현재 상태(2026-09-27 조사):

- 웹에는 서비스 워커·PWA manifest·`firebase/messaging`이 전혀 없다(`client/public`에는 파비콘만 있다).
- 마감은 `datetime-local`로 시각까지 입력받고 UTC ISO 문자열로 저장한다(`todoForm.tsx`, `new Date(...).toISOString()`).
- 모바일은 `expo-notifications`로 **마감 정각** 로컬 알림을 예약한다(`mobile/src/notifications/`). 실기기에서는 한 번도 검증하지 않았다.
- 서버에서 Firestore를 읽는 Worker가 없다. `calendar-proxy`와 `ai-proxy`는 Firebase ID 토큰만 검증하고, 데이터는 클라이언트가 보내준다. 인증과 CORS는 `packages/worker-auth`에 있다.
- 캘린더 동기화(`useSyncTodosToCalendar`)는 저장 경로마다 호출하지 않고, `App.tsx`에서 todos 캐시 변화를 관찰하는 방식이다.
- Firebase는 Spark(무료) 플랜이다. Cloud Functions 배포는 Blaze가 필요하다("to deploy functions, your project must be on the Blaze pricing plan").

## 확정한 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 과금 | **무료** | 사용자 확정(09-26). 할 일 앱의 기본 기능이고 잔존율과 직결 |
| 알림 시점 | **사용자 기본값 + 할 일별 재지정** | 사용자 확정. Google Calendar·Todoist·TickTick과 같은 방식 |
| 선택지 | 알림 없음 / 정각 / 10분 / 30분 / 1시간 / 하루 전 | 사용자 확정 |
| 처음 기본값 | 30분 전 | Todoist 자동 알림 기본값과 같음 |
| 대상 | `dueAt`이 있는 할 일(하위 할 일 포함). 완료·보관 제외. `startAt` 알림 없음 | |
| 이미 지난 알림 시각 | **보내지 않고 건너뜀** | 방금 만든 할 일에 즉시 알림이 오는 소음 방지 |
| iOS 브라우저 | **미지원 안내만**(PWA 안 만듦) | 사용자 확정. iOS 사용자의 목적지는 네이티브 앱. 웹 푸시는 홈 화면 PWA(16.4+)에서만 가능 |
| 권한 요청 시점 | **마감 있는 할 일을 처음 저장한 직후, 앱 내 안내창 → [켜기] 시 브라우저 권한 창** | 사용자 확정. 거절은 영구적이라 맥락 있는 순간에 요청 |
| 발송 스케줄링 | **Cloudflare Durable Object 알람**(크론 아님) | 폴링 없이 정확한 시각에 1회 실행 |
| 변경 전달 | **클라이언트는 refresh 신호만, DO가 Firestore에서 재계산** | 사용자 확정(B안). Firestore가 유일한 원본. 알림 계산이 서버 한 곳에만 있음 |
| 발송 | FCM HTTP v1 | Spark에서 무료 |
| 플랫폼 | 웹만. 모바일은 로드맵 4단계에서 같은 Worker에 연결 | |

범위 밖(후속):

- 모바일 앱의 refresh 신호·토큰 등록(모바일 격차 단계).
- PWA(manifest·홈 화면 설치 안내).
- 할 일당 알림 여러 개, `startAt` 알림, 알림에서 바로 완료 처리하는 액션 버튼.
- refresh 조회량 최적화(§8 참고).

## 1. 구조

```
[웹 클라이언트]                           [reminder-proxy Worker]           [Google]
 App.tsx: useReminderRefresh ──refresh──▶ ReminderScheduler DO ───조회───▶ Firestore REST
   (todos 지문 변화 → 디바운스)            (uid당 1개, SQLite)             (서비스 계정)
 권한 허용 → FCM 토큰 ─────등록─────────▶  tokens·schedule·sent
 firebase-messaging-sw.js ◀──── 푸시 ────  알람 → 재확인 → 발송 ─────────▶ FCM HTTP v1
```

```
reminder-proxy/              (신규) Cloudflare Worker "tododo-reminder-proxy"
  src/index.ts               라우팅 + CORS (worker-auth 재사용)
  src/handlers/              pushTokens.ts, refresh.ts
  src/scheduler.ts           ReminderScheduler Durable Object (얇은 오케스트레이션)
  src/schedule.ts            computeSchedule, shouldSend (순수 함수)
  src/googleAuth.ts          서비스 계정 JWT(RS256, WebCrypto) → 액세스 토큰
  src/firestore.ts           runQuery / get 호출 + REST 값 파싱
  src/fcm.ts                 FCM v1 발송 + 에러 분류
packages/core/src/reminders/ (신규) 오프셋 상수·fireAt 계산·본문 문구 — 웹·Worker·(후속)모바일 공용
client/src/features/reminders/ (신규)
client/public/firebase-messaging-sw.js (신규)
```

- `packages/core`의 `reminders` 모듈은 **서브패스로 import**한다(`@tododo/core/dist/reminders/index.js`). 루트 import는 Firestore SDK를 번들에 끌어들인다(다크모드 작업에서 확인한 함정).
- 인증은 Firebase ID 토큰(`@tododo/worker-auth`)만 요구한다. 프리미엄 게이트 없음.

## 2. 데이터 모델

### Todo 필드 추가

```ts
/** 알림 오프셋(마감 몇 분 전). 필드가 없거나 null이면 사용자 기본값을 따른다.
 *  "off"면 이 할 일만 알림을 끈다. */
reminderOffsetMinutes?: number | "off" | null;
```

- 허용 숫자: `0, 10, 30, 60, 1440`(`REMINDER_OFFSETS` 상수, `packages/core`).
- 기존 문서, AI 플랜이 만든 할 일은 필드가 없으므로 기본값을 따른다.
- 폼에서 "기본값"을 고르면 `null`을 쓴다. (09-27 계획 단계 수정: 처음엔 `deleteField()`로 필드를 지우려 했으나, `editTodo`가 할 일 객체 전체를 `update`하는 구조라 `null`을 "기본값"으로 함께 인정하는 편이 단순하고 안전하다. 없음과 `null`은 같은 의미다.)
- 반복 인스턴스는 모든 생성 경로(`createRecurringTodoImpl`, `editRecurringSeriesImpl`, 앱 진입 시 시리즈 확장 `buildExtensionCreates`)가 원본 할 일 객체를 전개(`...todoData`/`...rest`/`...template`)하므로 필드가 자동 승계된다. 이 승계를 테스트로 고정한다.
- `firestore.rules`의 todos 규칙은 필드 화이트리스트가 없으므로 변경하지 않는다.

### userSettings 컬렉션(신규)

```
userSettings/{uid}: { reminderDefaultOffsetMinutes: number | "off" }
```

- 문서가 없으면 30분으로 취급한다.
- 규칙은 `calendarIntegrations/{userId}`와 같이 본인만 읽고 쓴다. 값 검증: `"off"` 또는 허용 숫자 중 하나, 다른 키 금지.

### 복합 색인(신규)

`todos`: `userId ASC, dueAt ASC` — DO의 창 조회(`userId ==`, `dueAt` 범위)용.

### DO 저장소(SQLite)

| 테이블 | 컬럼 | 용도 |
|---|---|---|
| `tokens` | `token PK, platform, updatedAt` | 기기별 FCM 토큰 |
| `schedule` | `todoId PK, fireAt, dueAt, offsetMinutes` | 창 안의 예약표 |
| `sent` | `todoId, fireAt` (PK 복합) | 중복 발송 방지. `dueAt + 1일` 지나면 정리 |
| `meta` | `key PK, value` | `refreshPending`, `windowEnd` |

푸시 토큰을 Firestore가 아닌 DO에 두는 이유: 등록·해제가 모두 Worker를 거치므로 새 규칙이 필요 없고, 모바일도 같은 엔드포인트를 쓴다.

## 3. Worker 엔드포인트

모두 `Authorization: Bearer <Firebase ID 토큰>` 필요. 없거나 잘못되면 401. uid로 `idFromName(uid)` DO에 위임한다.

| 메서드·경로 | 본문 | 응답 | 동작 |
|---|---|---|---|
| `POST /push-tokens` | `{ token, platform: "web" }` | 204 | 토큰 upsert 후 refresh 요청 |
| `DELETE /push-tokens` | `{ token }` | 204 | 토큰 삭제(없어도 204) |
| `POST /reminders/refresh` | 없음 | 202 | `refreshPending = true`, 알람을 `min(기존, now + 5초)`로 |

입력 검증 실패는 400. 토큰 문자열 길이 상한을 둔다.

## 4. 알람 처리 흐름

DO는 알람을 하나만 걸 수 있으므로 재계산과 발송이 한 알람을 나눠 쓴다.

1. **토큰이 없으면** 아무것도 조회하지 않고 알람 없이 끝낸다.
2. **`refreshPending`이면 재계산**:
   - Firestore `runQuery`: `userId == uid AND dueAt >= now AND dueAt <= now + 8일`. 8일 = 창 7일 + 최대 오프셋 1일.
   - `userSettings/{uid}` 조회(없으면 30분).
   - `computeSchedule(todos, defaultOffset, now)`: 완료·보관·`"off"` 제외, `fireAt = dueAt − offset`, `fireAt <= now`면 제외, `fireAt`이 창 밖이면 제외.
   - `schedule`을 통째로 교체하고, `windowEnd = now + 7일`로 둔다.
   - **조회가 성공한 뒤에만** `refreshPending`을 내린다.
3. **`fireAt <= now` 예약 발송**, 예약마다:
   - Firestore에서 할 일을 **다시 읽는다**.
   - `shouldSend`: 문서가 없거나, 완료·보관이거나, `dueAt`이 예약 때와 다르거나, `sent`에 있거나, `now > dueAt + 5분`이면 보내지 않고 예약을 지운다.
   - 모든 토큰으로 FCM 발송. `UNREGISTERED`/`INVALID_ARGUMENT`(토큰 형식) 응답은 토큰 삭제.
   - 할 일 하나를 보낼 때마다 **즉시** `sent`에 기록하고 예약을 지운다.
4. **다음 알람**: `min(다음 fireAt, windowEnd)`. `windowEnd`에 울리면 `refreshPending = true`로 보고 재계산한다(앱을 오래 안 열어도 먼 미래 할 일이 예약됨).

### 실패 처리

- 재계산 중 Firestore 실패, 발송 중 Firestore·FCM 일시 실패(5xx, 429)는 **예외를 던져** Cloudflare 알람 자동 재시도(지수 백오프, 최대 6회)에 맡긴다. `sent` 기록 덕분에 재시도해도 이미 보낸 알림은 다시 가지 않는다.
- 재시도가 모두 실패하면 `console.error`로 남기고, 다음 refresh 때 재계산한다.
- DO는 uid당 단일 스레드라 알람 처리가 동시에 돌지 않는다. 캘린더 연동에서 겪은 멀티탭 레이스가 구조적으로 생기지 않는다.

### 알림 내용

- 제목: 할 일 제목(발송 직전 재조회한 값).
- 본문(`packages/core` 공용 문구): 정각 "지금 마감이에요", 10·30분 "N분 후 마감이에요", 1시간 "1시간 후 마감이에요", 하루 "내일 이 시간에 마감이에요".
- 클릭 시 `/todo/:id`(`webpush.fcm_options.link`).
- FCM 보관 기한 `webpush.headers.TTL` = 마감 + 5분 − 발송 시각(초). 기기가 오프라인이면 FCM은 기본 4주까지 보관했다가 몰아서 보내므로, 마감이 지난 알림이 뒤늦게 쏟아지지 않게 한다(09-29 로컬 검증에서 Chrome 푸시 연결 정체 후 옛 알림이 한꺼번에 오는 현상 확인).
- 참고: 할 일 제목이 FCM(Google)을 거친다.

### Google 액세스 토큰

- 시크릿 `GOOGLE_SERVICE_ACCOUNT`(서비스 계정 JSON).
- 스코프: `https://www.googleapis.com/auth/datastore`, `https://www.googleapis.com/auth/firebase.messaging`.
- JWT를 WebCrypto RS256으로 서명해 교환하고, DO 인스턴스 메모리에 만료 5분 전까지 캐시한다.

## 5. 클라이언트

### 서비스 워커와 토큰(`features/reminders/`)

- `public/firebase-messaging-sw.js`: 백그라운드 푸시 표시. 클릭 시 이미 열린 앱 탭이 있으면 포커스 후 이동, 없으면 새 창으로 `/todo/:id`.
- 권한이 `granted`면 `getToken({ vapidKey, serviceWorkerRegistration })` → `POST /push-tokens`.
- 앱 진입마다 권한이 `granted`면 `getToken` 결과를 다시 등록한다(upsert라 멱등, DO 요청 1건). FCM이 토큰을 바꿨거나 DO가 무효 토큰을 지운 경우를 함께 복구한다.
- 탭이 열려 있고 포커스된 상태에서는 FCM이 알림을 자동 표시하지 않는다. `onMessage`로 받아 앱 토스트(`toast.info`)로 보여준다.
- 로그아웃 시 `DELETE /push-tokens` → `deleteToken()`. 같은 브라우저에서 다른 계정의 알림이 오지 않게 한다.
- `firebase/messaging`은 **동적 import**만 한다. 첫 화면 번들에 넣지 않는다.

### refresh 신호 훅 `useReminderRefresh` (`App.tsx`)

- todos 캐시에서 알림 관련 값만 뽑아 지문을 만든다: `id · dueAt · status · archived · reminderOffsetMinutes`.
- 지문이 바뀌면 2초 디바운스 후 `POST /reminders/refresh`. 제목만 바뀐 경우처럼 무관한 변경은 신호를 보내지 않는다.
- 첫 로드에서도 1회 보낸다(오프라인 변경 맞춤). 기본값 설정이 바뀌어도 보낸다.
- **이 기기의 알림 권한과 무관하게 보낸다.** (09-27 계획 단계 수정: 기기 A에서 알림을 켜고 기기 B에서 마감을 바꾸면, B가 신호를 안 보낼 경우 A의 알림이 어긋난다. 토큰이 없는 사용자의 신호는 DO가 Firestore 조회 없이 끝내므로 비용은 DO 요청 1건뿐이다.)
- 실패는 조용히 넘기고 Sentry에만 기록한다. 다음 변경 때 다시 보낸다.
- 게스트 모드에서는 동작하지 않는다.

### 권한 안내창

- 마감 있는 할 일을 **처음 저장한 직후**, `Notification.permission === "default"`이고 웹 푸시를 지원할 때만.
- 문구: "마감 {기본값}에 알려드릴까요?" [켜기] [나중에]. [켜기] → `Notification.requestPermission()` → 허용 시 토큰 등록.
- [나중에]는 7일간 다시 묻지 않는다(localStorage, try/catch).
- 폼 모달의 **형제**로 렌더링한다. 모달 안의 자식으로 두면 모달이 닫힐 때 함께 사라진다.

### 헤더 알림 메뉴

- `header.tsx`·`mobileHeader.tsx`의 `ThemeMenu` 옆에 벨 아이콘 메뉴를 같은 드롭다운 패턴(키보드 탐색 포함)으로 추가한다.
- 상태 4가지: 켜짐 / 꺼짐(켜기 버튼) / 브라우저에서 차단됨(해제 방법 안내) / 이 브라우저는 알림 미지원.
- 기본 알림 선택(`userSettings` 쓰기).
- 미지원 판별: `"serviceWorker" in navigator && "PushManager" in window && "Notification" in window`. iOS 일반 브라우저는 여기서 걸러진다.
- 게스트 모드에서는 숨긴다.

### 할 일 폼

- 마감일 입력 아래에 알림 선택: "기본값 (30분 전)" / 알림 없음 / 정각 / 10분 / 30분 / 1시간 / 하루 전. 기본값 라벨은 현재 사용자 설정을 반영한다.
- 마감일이 비어 있으면 비활성화.
- 저장 경로 세 곳(수정·반복 생성·일반 생성)이 모두 필드를 넘긴다.

## 6. 에러 처리

| 상황 | 동작 |
|---|---|
| refresh·토큰 등록 요청 실패 | 조용히 무시 + Sentry. 다음 변경·진입 때 재시도 |
| 권한 거절 | 벨 메뉴가 "차단됨" 상태와 해제 방법을 보여줌. 다시 묻지 않음 |
| `getToken` 실패(서비스 워커 등록 실패 등) | 벨 메뉴 "꺼짐" 유지 + Sentry |
| Worker 401 | 로그인 만료로 보고 무시(다음 진입 때 재시도) |
| DO 알람 예외 | Cloudflare 자동 재시도, 이후 로그 |
| FCM 토큰 무효 | DO가 토큰 삭제 |

## 7. 테스트

### reminder-proxy(vitest, 기존 Worker와 같은 방식)

- `computeSchedule`: 기본값 적용, 할 일별 재지정, `"off"`(할 일·설정 양쪽), 완료·보관 제외, 지난 `fireAt` 제외, 창 경계.
- `shouldSend`: 삭제·완료·보관·`dueAt` 변경·`sent` 중복·5분 유예.
- `ReminderScheduler`: 가짜 storage·시계·Firestore·FCM 주입. 토큰 없으면 조회 0회 / 재계산 실패 시 `refreshPending` 유지 / `UNREGISTERED` 토큰 삭제 / 재시도 시 중복 발송 없음 / 다음 알람이 `min(fireAt, windowEnd)`.
- Firestore REST 값 파싱, JWT 서명(테스트용 키), FCM 에러 분류, 인증 없는 요청 401.

### client

- 지문 훅: 제목만 바뀌면 신호 없음, `dueAt`·상태·오프셋 변경 시 디바운스 후 1회.
- 권한 안내창 표시 조건(첫 마감 저장, `default`, 7일 억제).
- 반복 인스턴스가 `reminderOffsetMinutes`를 복사.
- 폼 알림 선택(마감 없으면 비활성, "기본값" 선택 시 필드 삭제).
- 벨 메뉴 상태 4가지.
- CI 등가 검증: `VITE_FIREBASE_API_KEY= npx vitest run`.

### 수동 E2E

`wrangler dev` + VITE 오버라이드로 데스크톱 Chrome에서 **탭을 닫은 상태로 실제 알림 수신**, 클릭 시 상세 화면 이동, 완료 처리한 할 일은 알림이 안 오는지 확인.

## 8. 배포

사용자 사전 작업:

1. Google 서비스 계정 생성(역할: Cloud Datastore Viewer `roles/datastore.viewer` — Worker는 Firestore 읽기 전용, Firebase Cloud Messaging API Admin). Firebase Cloud Messaging API(v1) 활성화 확인. 결제 등록 불필요.
2. Firebase 콘솔에서 웹 푸시 VAPID 키 발급. `VITE_FIREBASE_VAPID_KEY`, `VITE_REMINDER_PROXY_URL`을 `client/.env`와 GitHub Secrets에 추가하고 **deploy job env에도** 넣는다(Sentry DSN 누락과 같은 함정).
3. `firestore.rules`(`userSettings`)와 `firestore.indexes.json`(`userId + dueAt`) 배포.
4. Worker 코드를 **먼저** 배포한 뒤, 사용자 터미널에서 `wrangler secret put GOOGLE_SERVICE_ACCOUNT`. 시크릿을 먼저 넣으면 코드 없는 빈 Worker가 생긴다.

CI:

- paths-filter에 `reminder-proxy/**` 추가, test·typecheck·deploy job을 `ai-proxy`와 같은 형태로.
- wrangler 3.x 유지. `wrangler.toml`에 DO 바인딩(`REMINDER_SCHEDULER`)과 마이그레이션 `[[migrations]] tag = "v1", new_sqlite_classes = ["ReminderScheduler"]`.

### 예상 사용량(무료 한도)

| 자원 | 한도 | 알림 기능 사용량 |
|---|---|---|
| Firestore 읽기 | 50K/일(앱 전체 공유) | refresh 1회 ≈ 창 안 할 일 수 + 1(약 11건), 발송 1회 = 1건. 활성 사용자 1명 ≈ 200건/일 → **알림 켠 활성 사용자 약 250명/일에서 한도 도달**(웹 클라이언트 읽기와 공유하므로 실제로는 더 이르다) |
| DO 요청 | 100K/일 | refresh·토큰 요청 + 알람 |
| DO 쓰기 행 | 100K/일 | `setAlarm` 1행, 예약표 교체, `sent` 기록 |
| FCM | 무제한 무료 | |

한도에 가까워지면: refresh 신호에 바뀐 할 일 id를 담아 DO가 그 문서만 다시 읽게 한다(지금은 구현하지 않음).

## 9. 알고 감수한 한계

1. **웹을 거치지 않은 변경은 늦게 반영된다.** 모바일 앱에서 새로 추가하거나 마감을 앞당긴 할 일은 웹을 열거나 창이 끝나 재계산될 때(최대 7일)까지 예약되지 않는다. 삭제·완료는 발송 직전 재확인으로 걸러진다. 모바일 격차 단계에서 앱도 refresh를 보내면 해결된다.
2. **데스크톱은 브라우저가 실행 중이어야 한다.** 탭은 닫혀도 되지만 브라우저가 꺼져 있으면 다음 실행 때 받거나 FCM TTL이 지나 사라진다.
3. **할 일 제목이 FCM(Google)을 거친다.**
4. **iOS 브라우저는 지원하지 않는다.**
5. **`dueAt` 문자열 범위 조회는 모든 작성 경로가 `toISOString()` 형식(UTC, 밀리초, `Z`)으로 저장한다는 전제**에 기댄다. 09-27 확인: 웹 폼, AI 플랜(`localDateKeyToISO`), 캘린더 드래그(`getDropDates`), 모바일 폼(`DateTimeField`) 모두 `toISOString()`이다.
6. **Firestore 무료 읽기 한도**가 사용자 증가 시 먼저 닿는 병목이다(§8).
7. **날짜만 있는 마감은 자정으로 저장된다.** AI 플랜(`localDateKeyToISO`)과 캘린더 드래그(`getDropDates`)는 마감을 그날 로컬 자정으로 저장한다. 이런 할 일에 "30분 전"이 적용되면 전날 23:30에 "30분 후 마감이에요" 알림이 간다. 데이터상으로는 맞지만 사용자 기대와 다를 수 있다. 실사용에서 문제가 되면 후속으로 다룬다.
