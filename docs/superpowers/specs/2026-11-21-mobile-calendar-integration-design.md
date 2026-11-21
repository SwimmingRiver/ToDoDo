# 모바일 구글 캘린더 연동 이식 설계

작성일: 2026-11-21 · 관련: `2026-08-31-google-calendar-integration-design.md`(웹 원본), `2026-11-20-mobile-ai-plan-design.md`(앱 이식 선례), `2026-11-18-mobile-iap-design.md`(앱 프리미엄)

## 왜 하는가

스토어 첫 출시 조건(사용자 결정)은 프리미엄 기능 3개(AI 플랜·구글 캘린더·인사이트)가 모두 앱에 있는 것이다. AI 플랜은 PR #192로 들어갔고, 이 문서는 두 번째인 구글 캘린더 연동을 다룬다.

원칙(11-18 사용자): 같은 계정이면 웹과 앱 어디서나 똑같이 프리미엄이고, 웹과 앱의 간극을 최대한 없앤다. 이번에 사용자가 "웹 버전과 유사했으면 좋겠다"고 다시 확인했다.

## 지금 웹은 어떻게 동작하나

- **연동 상태는 계정 단위다.** 구글 리프레시 토큰은 calendar-proxy Worker의 KV(`uid` 키)에, 연동 여부는 Firestore `calendarIntegrations/{uid}`(`connected`, `status: active|revoked`)에 있다. 웹에서 연결하면 앱도 이미 연결된 상태다.
- **연결:** 웹이 `GET /oauth/start`(ID 토큰 + Origin) → Worker가 1회용 `state`(uid·returnOrigin 저장)를 만들고 구글 동의 URL을 준다 → 구글 → Worker `/oauth/callback`이 토큰 교환·저장 → `{returnOrigin}/calendar?calendarConnected=1`로 리다이렉트 → 웹이 Firestore에 `connected:true`를 직접 쓴다(`useMarkCalendarConnected`). Worker는 Firestore 쓰기 권한이 없다(보안 경계, 유지).
- **동기화는 서버가 아니라 클라이언트가 한다.** 웹 `App.tsx`에 마운트된 `useSyncTodosToCalendar`가 todos를 스냅샷(localStorage `calendarSyncSnapshot:{uid}`)과 비교해 upsert/delete 묶음을 `POST /sync-todos`로 보내고, 결과 `googleEventId`를 Firestore에 쓴다. 이벤트 id는 결정론적이라 여러 기기·탭이 동시에 보내도 중복되지 않는다.
- **오버레이:** `GET /events?timeMin&timeMax`로 보이는 범위의 구글 일정을 읽어, ToDoDo가 만든 이벤트(todos의 `googleEventId`)는 빼고 회색으로 보여준다. 누르면 아무 일도 안 한다.
- **해제:** 할 일의 이벤트 id + 스냅샷에만 남은 고아 id를 `POST /disconnect`로 보내 지우고, 삭제 확인된 것만 Firestore `googleEventId`를 null로, 연동 문서를 `connected:false`로.
- **오류 신호:** 401 `{error:"revoked"}` → `status:revoked`로 기록(절대 throw 안 함, 신호가 1회뿐), 409 `{error:"not_connected"}` → 연동 상태 재조정.

**앱 현황:** 앱은 이 중 아무것도 없다. 웹에서 연결해 두면 앱에서 만든 할 일은 나중에 웹을 열 때 올라가지만, 앱만 쓰는 사용자는 아무것도 동기화되지 않는다. 앱 탈퇴(`mobile/src/account/deleteAccount.ts`)는 이미 `googleEventId`를 모아 정리한다. 앱에는 딥링크 스킴이 없다(`mobile/app.json`).

## 목표

1. 앱에서 구글 캘린더를 연결·해제할 수 있다(무료 사용자에게는 잠금 안내와 구독 경로).
2. 앱만 써도 마감일 있는 할 일이 구글 캘린더에 올라가고, 수정·삭제·보관이 반영된다(웹과 같은 단방향).
3. 앱 캘린더 탭에서 구글 일정을 읽기 전용으로 볼 수 있다.
4. 동기화 판단 로직은 `packages/core` 한 곳에 두어 웹·앱이 갈라지지 않는다.

## 비목표

- **양방향 연동·구글 일정 가져오기·역동기화**(09-20 사용자 확정, 재제안 금지).
- **앱 캘린더 월간/주간 전환**(웹엔 있음). 연동과 무관한 별도 기능으로 사용자와 합의(11-21). `react-native-calendars`의 `Calendar`에 주간 모드가 없어 컴포넌트 교체가 필요하다.
- 구글 쪽 설정 변경(새 OAuth 클라이언트, redirect URI 추가, scope 변경, 동의 화면 검증). 기존 웹 클라이언트와 Worker 콜백을 그대로 쓴다.
- Worker의 Firestore 쓰기 권한 추가.
- 모바일 Sentry 도입(앱에 아직 없음, 별도 권장 항목). 예상 못 한 오류는 `console.warn`으로 남긴다.
- 앱 서버 푸시나 백그라운드 동기화. 동기화는 앱이 켜져 있을 때만 돈다(웹과 같음).

## 안티골 (동작해도 실패로 보는 것)

- 같은 할 일이 구글에 두 번 생긴다(웹·앱 동시 사용, 연타, 앱 재시작 포함).
- 연결 흐름이 웹 주소(`tododo-app.com/calendar`)로 끝나 앱으로 돌아오지 못하거나, 앱 사용자에게 웹 페이지가 뜬다.
- 해제했는데 구글에 이벤트가 남고 다시는 추적할 수 없게 된다(고아 이벤트).
- 해제 후 이미 지워진 구글 일정이 앱 캘린더에 유령처럼 남는다.
- 웹과 앱이 같은 상황에서 다른 이벤트를 만든다(제목·날짜 규칙 차이, 특히 KST 0~9시 마감이 하루 밀림).
- Worker가 임의 URL로 리다이렉트하는 오픈 리다이렉트가 생긴다.
- 앱에 웹 결제로 유도하는 문구·링크(Apple 3.1.1).

## 접근 방식

### 앱이 직접 동기화하나

| 안 | 내용 | 대가 | 결정 |
|---|---|---|---|
| **A. 앱도 직접 동기화** | 동기화 판단(비교·묶음 생성·결과 반영 계획)을 core로 옮겨 웹·앱이 공유. 저장소(localStorage/AsyncStorage)와 Firestore 쓰기만 플랫폼별 | 작업량이 가장 큼. 웹 훅 리팩터링 필요(동작 불변, 기존 테스트로 검증) | **채택(사용자 선택)**. 앱 전용 유료 사용자도 연동이 된다. 결정론적 id라 웹·앱 동시 동기화도 안전 |
| B. 앱은 연결·해제·오버레이만 | 작업이 작음 | 웹을 열기 전까지 아무것도 안 올라감. 앱 전용 유료 사용자에게 "연동이 안 된다"로 보임 | 기각 |

### 앱에서 구글 계정을 어떻게 연결하나

| 안 | 내용 | 결정 |
|---|---|---|
| **1. 앱 내 브라우저 세션 + 딥링크 복귀** | `expo-web-browser`의 `openAuthSessionAsync`(iOS `ASWebAuthenticationSession`, Android Custom Tabs)로 기존 Worker `/oauth/start` → 구글 → `/oauth/callback` 흐름을 그대로 탄다. Worker는 앱이 시작한 요청이면 고정된 앱 주소로 돌려보낸다 | **채택(사용자 선택)**. RFC 8252 권장 방식이고 구글 설정 변경이 없다. 딥링크엔 토큰·코드가 실리지 않고 완료 신호만 있어 스킴 가로채기에 안전하다 |
| 2. 네이티브 구글 로그인 라이브러리로 scope 추가 | `@react-native-google-signin`으로 캘린더 권한 + serverAuthCode → Worker 교환 | 기각. 코드가 Firebase 로그인용 클라이언트 기준이라 별도 시크릿·교환 경로가 필요하고, 앱 로그인 계정에 묶여 Apple 로그인 사용자가 쓰기 어렵다 |
| 3. 외부 브라우저(Safari) + 복귀 | `Linking.openURL` | 기각. 앱을 완전히 벗어나 흐름이 끊기고 1보다 나은 점이 없다 |

## 설계

### 1. Worker (`calendar-proxy`) — 앱 복귀 경로

- `/oauth/start`가 앱 요청을 구분한다: 쿼리 `?client=app`(빌더가 이름 확정 가능). 앱 요청엔 Origin 헤더가 없다.
- `client=app`이면 `state` 레코드의 되돌아갈 곳을 **앱 고정 주소**로 저장한다. 앱 복귀 주소는 클라이언트가 보내는 값을 받지 않고 Worker에 상수(또는 `wrangler.toml` 변수)로 둔다. 오픈 리다이렉트 방지.
- 웹 요청(기존)은 동작 불변: Origin이 허용 목록에 있으면 그 Origin, 아니면 `CLIENT_APP_URL`.
- `/oauth/callback`: 앱 대상이면 성공 시 `tododo://calendar?calendarConnected=1`, 실패 시 `tododo://calendar?calendarError=1`로 302.
- **앱 대상 표식은 state 토큰 자체에도 싣는다**(예: `app.` 접두사 + 무작위 UUID, 형식은 빌더 판단). 구글 동의 화면에서 「취소」하면 콜백엔 `error=access_denied&state=…`만 오고 `code`가 없으며, state가 만료(10분)돼 소비에 실패하는 경우도 있다. 이때 웹 주소로 보내면 앱 안 브라우저 시트에 비로그인 웹 로그인 화면이 떠 안티골에 걸린다. 그래서 `code`가 없거나 state 소비에 실패해도 state 접두사가 앱이면 `tododo://calendar?calendarError=1`(취소면 별도 값, 예: `calendarCancelled=1`)로 보낸다. 접두사는 고정 앱 주소를 고를 뿐 임의 URL을 받지 않으므로 오픈 리다이렉트가 아니고, 토큰 추측 난이도도 그대로다. (설계자 판단, 빌더 검토에서 발견)
- state 자체가 아예 없는 요청은 지금처럼 웹 주소로 간다.
- 레코드 형태 변경(`returnOrigin` 대신 대상 구분 필드 추가 등)은 빌더 판단. 단, 배포 중 남아 있는 옛 형식 state(TTL 내)는 웹으로 처리돼야 한다.
- 기존 `/sync-todos`·`/events`·`/disconnect`는 변경 없음. 앱 요청은 Origin이 없어 CORS 헤더만 안 붙고 처리는 된다(ai-proxy와 같음, 빌더가 테스트로 확인).
- **배포 순서(사용자 결정 11-21):** Worker 변경만 담은 작은 PR을 먼저 만들어 develop에 병합하고 main으로 릴리스해 CI 자동 배포로 내보낸다(수동 선배포 안 함 — 이후 릴리스에 덮어써질 위험). develop에 쌓인 다른 변경도 함께 main에 나간다(앱 변경은 스토어 빌드 전까지 사용자 영향 없음). 앱 쪽 작업은 그 뒤 별도 PR. Worker 변경은 웹과 하위 호환이다. 운영 배포 PR 병합·릴리스는 사용자 승인 후.

### 2. core로 옮기는 것 (`packages/core/src/calendarSync/`)

새 하위 경로 `@tododo/core/dist/calendarSync/index.js`로 내보낸다(aiPlan과 같은 방식, 루트 import 금지 규칙 유지).

- **타입:** `SyncTodoPayload`, `SyncTodoResult`, `GoogleCalendarEvent`, `SyncSnapshot`/`SyncedSnapshotEntry`, `CalendarIntegrationStatus`.
- **오류 타입과 응답 해석:** `CalendarRevokedError`, `CalendarNotConnectedError`, 그리고 응답 → 결과/오류 판정 함수(401 revoked, 409 not_connected, 그 외). 요청(fetch·토큰 붙이기)은 플랫폼별로 두고 해석만 공유한다(AI 플랜과 같은 분리).
- **동기화 계획(순수 함수):** 지금 `useSyncTodosToCalendar` 안의 판단을 꺼낸다.
  - `isSyncEligible(todo)`: `dueAt` 있고 `archived` 아님.
  - `planCalendarSync(todos, snapshot)` → `{ upserts, deletes }`. upsert 조건(`!googleEventId` 또는 스냅샷 `updatedAt` 다름), Firestore id만 사용(스냅샷 id 폴백 금지), `dueAt`은 로컬 날짜 키로 변환. 변환은 core의 날짜 유틸(없으면 웹 `toDateKeyFromISO`와 같은 로직을 core로)로 한다.
  - `applySyncResults(results, eligibleById, allTodoIds, snapshot)` → 갱신된 스냅샷 + Firestore에 쓸 `{ todoId, googleEventId }` 목록(삭제 성공 + 문서가 남아 있으면 null 쓰기 포함). 오류 항목은 스냅샷을 건드리지 않는다.
  - `findOrphanGoogleEventIds`(지금 `syncSnapshot.ts`).
  - 스냅샷 직렬화/역직렬화(배열 ↔ Map). 저장소 접근은 플랫폼별.
- **오버레이 헬퍼:** 동기화된 이벤트를 빼는 필터, `isDateInGoogleEventRange`(웹 `dashboard/utils/calendarUtils.ts`), `formatGoogleEventTime`("종일"·"전날부터 이어짐"·시각; 웹 `calendar.tsx`). 문구는 지금 웹과 같게.
- 웹은 위 항목을 core에서 가져오도록 바꾼다. 동작은 바뀌지 않으며 기존 웹 테스트가 그대로 통과해야 한다. 웹 훅 주석 중 이미 틀린 부분("스냅샷이 stale한 id를 주면 PATCH 404 → 재생성", `useSyncTodosToCalendar.ts` 88~91행)은 옮기면서 실제 동작(tombstone + `status:confirmed`, Firestore id만 사용)에 맞게 고친다.

### 3. 앱 — 연결·해제 (`mobile/src/calendarIntegration/`)

- **딥링크 스킴:** `app.json`에 `"scheme": "tododo"`. 네이티브 설정이 바뀌므로 dev client 재빌드 필요(IAP 이후 어차피 필요한 상태). `expo-web-browser`를 SDK 57 호환 버전으로 추가.
- **API:** `EXPO_PUBLIC_CALENDAR_PROXY_URL`. 요청 방식은 `aiProxyApi.ts`처럼 Firebase ID 토큰을 붙여 `fetch`하고, 403 `PREMIUM_REQUIRED`면 토큰 강제 갱신 후 1회 재시도(구독 직후 클레임 지연).
- **연결:** `/oauth/start?client=app` → `authUrl` → `openAuthSessionAsync(authUrl, "tododo://calendar")`.
  - 결과 `success`이고 URL에 `calendarConnected=1` → Firestore `calendarIntegrations/{uid}`에 `{connected:true, connectedAt, status:"active"}`(웹과 같은 필드) → 연동 상태 쿼리 무효화 → 성공 토스트. Firestore 쓰기가 실패하면 성공 토스트 대신 실패 안내(웹 #119 교훈).
  - `calendarError=1` → 실패 토스트.
  - 구글 동의 화면 취소 신호(1절) 또는 `cancel`/`dismiss`(사용자가 시트를 닫음) → 조용히 끝(토스트 없음). 버튼은 다시 누를 수 있다.
  - 토큰은 저장됐는데 앱이 신호를 못 받은 경우 Firestore는 `connected:false`로 남는다. 다시 연결하면 토큰이 덮어써져 해결되므로 따로 처리하지 않는다.
  - 연타 방지: 진행 중엔 버튼 비활성.
- **알려진 한계(수용, 설계자 판단):** 해제 시 고아 id는 해제를 누른 기기의 스냅샷 것만 보낸다. 다른 기기 스냅샷에만 있는 고아(할 일을 지웠는데 이벤트 삭제가 실패해 재시도 대기 중인 것)는 그 기기가 `connected:false`를 보고 스냅샷을 비우면서 추적이 끊긴다. 이벤트 삭제 실패라는 드문 경우에만 생기고, 웹에서도 브라우저 두 개를 쓰면 이미 있던 한계다. 막으려면 Worker에 동기화 이벤트 목록을 두어야 해 범위가 크게 늘어나므로 이번엔 하지 않는다.
- **해제:** 웹 `useDisconnectCalendar`와 같은 순서와 규칙: 할 일 이벤트 id + 고아 id(앱 스냅샷 기준) 전송 → 삭제 확인된 것만 `googleEventId:null` → `connected:false` → 연동 상태 무효화를 await한 뒤 todos 무효화 → 이벤트 캐시 제거. `allDeleted`가 false면 "일부 이벤트가 남아있습니다" 안내(웹 문구 그대로). 해제 전 확인창은 웹에 없으므로 넣지 않는다(빌더가 웹과 다르게 해야 할 이유를 찾으면 보고).
- **revoked:** 웹과 같이 `markCalendarRevoked`(절대 throw 안 함), 버튼 줄에 "연동이 끊겼습니다. 다시 연결해주세요" + 「연동 해제」. 웹처럼 이 상태에서 「다시 연결」 버튼을 따로 두지 않는다(웹과 동일하게 해제 후 재연결).
- **query key**는 웹과 같은 모양(`["calendarIntegration", uid]`, `["googleCalendarEvents", start, end]`). 앱 todos 키는 `["todos", uid]`.

### 4. 앱 — 동기화 훅

- `useSyncTodosToCalendar`(앱판)을 로그인 이후 항상 마운트되는 곳에 하나만 둔다(웹 `App.tsx`와 같은 위치 개념. 앱 `RootNavigator`의 로그인된 영역 등, 빌더 판단). 프리미엄이 아니면 연동 상태 쿼리가 꺼져 있어 아무것도 안 한다(웹과 같은 `enabled: isPremium`).
- 흐름은 웹 훅과 같다: core `planCalendarSync` → `/sync-todos` → core `applySyncResults` → Firestore batch → todos 무효화. 실행 중 재진입은 대기 후 1회 재실행, 동기화 중 해제되면 옛 스냅샷을 역저장하지 않는 가드, 해제 상태를 보면 스냅샷 clear + 이벤트 캐시 제거, 401 revoked·409 not_connected 처리(재조정 포함)까지 웹과 동일.
- **스냅샷 저장:** AsyncStorage `calendarSyncSnapshot:{uid}`(웹과 같은 키 모양, 기기별). AsyncStorage는 비동기라 **스냅샷을 다 읽기 전에는 동기화를 시작하지 않는다**. 빈 스냅샷으로 먼저 돌면 이번 실행의 삭제 감지를 놓친다. 읽기·쓰기 실패는 빈 스냅샷으로 계속(웹과 같은 관용).
- **기기 간 동작(확인용):** 앱 첫 실행 시 앱 스냅샷이 비어 있어 이미 이벤트가 있는 할 일 전부를 한 번 PATCH한다(결정론적 id라 중복 없음, 이후 스냅샷이 채워짐). 앱 스냅샷이 채워지기 전에 웹에서 동기화된 할 일을 앱에서 지우면 앱은 못 지우고 웹이 다음에 지운다. 허용한다.
- 앱의 할 일 수정 경로가 `googleEventId`를 덮어쓰지 않는지 확인한다(core `seriesApi`는 이미 제외함; 앱 `useUpdateTodo`도 확인 대상).

### 5. 앱 — 캘린더 화면

```
┌──────────────────────────────┐
│ [구글 캘린더 연동]  (또는 연동 해제)  │ ← 달력 위 한 줄
│  2026년 11월           < >     │
│  일  월  화  수  목  금  토      │
│      21  22                    │
│      ●●  ●                     │ ← 할 일 점(기존) + 회색 점(구글)
│      ○                         │
└──────────────────────────────┘
날짜 시트:
  ● 보고서 마감        (할 일, 누르면 상세)
  ○ 팀 회의            구글 캘린더 · 오후 3:00  (누를 수 없음)
```

- **연결 줄:** 달력 위 한 줄(웹 도구줄 자리). 미연동이면 「구글 캘린더 연동」, 연동이면 「연동 해제」, revoked면 안내 + 「연동 해제」. 무료면 그 자리에 작은 잠금 안내("구글 캘린더 연동 (프리미엄)" + "할 일을 구글 캘린더에 동기화하려면 프리미엄 구독이 필요합니다", 웹 문구) + 구독 화면으로 가는 버튼. 구독 화면 경로는 AI 플랜 잠금(`PlanLockedNotice`)이 쓰는 것과 같게. 엔타이틀먼트 로딩 중에는 아무것도 안 보이거나 자리만 잡는다(빌더 판단, 깜빡임 없이).
- 달력 높이는 지금 `onLayout`으로 남은 높이를 재므로, 연결 줄이 생겨도 그 방식이 계속 맞는지 확인한다.
- **점:** 구글 일정이 걸친 날에 회색 점 하나(`colors.text.secondary` 계열, 다크모드 토큰 확인). 기존 정책(지난 할 일이 있으면 위험 점 하나만)과 별개로 항상 붙는다. 선택된 날 배경 위에서도 보이도록 `selectedDotColor` 지정. 같은 날 구글 일정이 여러 개여도 점은 하나.
- **범위:** 표시 중인 달이 바뀌면(`onMonthChange` 등) 그 달 그리드 범위로 다시 조회. `staleTime` 60초(웹과 같음). 범위 계산은 달 시작~다음 달 시작(배타) 또는 그리드 앞뒤 포함. 앞뒤 회색 날짜에도 점을 보일지 빌더 판단(웹은 그리드 전체).
- **날짜 시트:** 그날 할 일 목록 아래에 구글 일정을 "구글 캘린더 · {시각|종일|전날부터 이어짐}"으로. 누를 수 없음(접근성 역할도 버튼 아님). 할 일이 없고 구글 일정만 있는 날도 빈 상태가 아니라 목록을 보여준다.
- 오버레이 조회 실패는 캘린더 전체를 오류로 만들지 않는다(할 일은 계속 보임). 조용히 넘어가거나 작은 안내, 빌더 판단.

### 6. 테스트·검증

- **Worker:** `client=app` 성공/실패 리다이렉트, 클라이언트가 복귀 주소를 못 바꾸는지, 웹 경로 불변, 옛 형식 state 처리.
- **core:** `planCalendarSync`·`applySyncResults`의 기존 웹 훅 테스트 케이스를 순수 함수 테스트로 옮김. KST 0~9시 마감 날짜 키는 `TZ=America/New_York`로도 실행(메모리 함정). 절대 날짜 대신 시스템 시간 mock.
- **웹:** 기존 calendarIntegration·dashboard 테스트 전부 통과(동작 불변). `VITE_FIREBASE_API_KEY= npx vitest run`으로 CI 등가 확인.
- **앱:** 연결 결과별 처리(success·error·cancel·Firestore 실패), 스냅샷 로드 전 동기화 안 함, 해제 순서, 오버레이 필터·점·시트 표시, 잠금 안내.
- **Android 실기 확인은 이번 범위 밖**(사용자 결정 11-21): Custom Tabs·딥링크 복귀는 IAP 실측 때 같이 확인한다. 코드는 양 플랫폼 공통으로 짠다.
- **실기(iOS 시뮬레이터 + 실제 구글 계정):** 연결 → 앱에서 할 일 생성·수정·보관·삭제 → 구글 반영, 오버레이, 해제 후 이벤트 삭제·유령 없음, 웹에서 연결한 계정이 앱에서 바로 연동 상태로 보이는지. Worker 수정본은 프리뷰 버전으로 테스트하되, **OAuth 연결 단계는 프리뷰로 하면 redirect_uri mismatch**(메모리 reference-calendar-proxy-preview-testing). 연결은 Worker 운영 배포 후 하거나, 운영 Worker로 연결 단계만 하는 기존 요령을 쓴다. 앱의 `client=app` 복귀는 운영 배포가 있어야 실측 가능하다는 점을 계획에 반영.
- 출시 전 할 일로 EAS env `EXPO_PUBLIC_CALENDAR_PROXY_URL` 등록.

## 빌더에게 남긴 것

- core 함수 이름·시그니처·파일 분할, `state` 레코드 필드 이름, 쿼리 파라미터 이름.
- 앱 동기화 훅 마운트 위치, 연결 줄 컴포넌트 구조와 세부 스타일(웹과 같은 정보, 앱 디자인 토큰).
- 엔타이틀먼트 로딩 중·오버레이 조회 실패 시 표시, 앞뒤 달 날짜의 점 표시 여부.
