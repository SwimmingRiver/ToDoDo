# 구글 캘린더 연동 설계

## 배경 / 목적

ToDoDo는 지금 자체 캘린더 화면(`features/dashboard/components/calendar.tsx`)만
갖고 있고, 사용자가 실제로 쓰는 구글 캘린더와는 완전히 분리되어 있다. 할 일과
일정을 같이 관리하려면 두 화면을 오가야 한다.

이 기능은 향후 프리미엄 유료 전환 후보로 논의되었으나, 결제 인프라가 전무한
현재 상태에서 유료화부터 하는 것은 리스크가 크다는 결론에 따라 **이번 스펙은
기능 자체만 다루고, 유료 게이팅은 나중에 얹을 수 있도록 훅만 남겨둔다.**
무료로 먼저 내놓고 사용률을 검증한 뒤 유료 전환 여부를 재논의한다.

## 범위

**이번 버전에 포함:**
- 웹 클라이언트(`client/`)만 대상으로 한다. 모바일(`mobile/`)은 제외 — OAuth가
  딥링크/네이티브 설정 기반이라 구현이 갈리고, 네이티브 리빌드와 스토어 심사가
  얹혀 웹 출시를 지연시킨다. 웹에서 검증 후 별도 스펙으로 진행한다.
- **ToDoDo → 구글 단방향 쓰기 동기화**: `dueAt`이 있는 Todo가 생기거나 바뀌면
  구글 캘린더에 이벤트로 반영한다.
- **구글 → ToDoDo 읽기 전용 표시**: 사용자가 ToDoDo 캘린더 화면을 열 때, 구글
  캘린더의 기존 일정을 온디맨드로 불러와 같이 보여준다(수정 불가, 저장 안 함).
- 대상 캘린더는 사용자의 **기본(primary) 캘린더로 고정**한다. 캘린더 선택 UI는
  범위 밖.

**이번 버전에서 제외 (후속 작업):**
- 모바일 앱 연동
- 구글 캘린더에서의 변경을 ToDoDo Todo에 반영하는 진짜 양방향 동기화(webhook
  수신 필요)
- 여러 캘린더 중 선택
- 유료 게이팅 로직 (훅만 남겨둠, 아래 "프리미엄 게이팅 훅" 참고)

## 아키텍처 결정: 왜 Firebase Cloud Functions가 아닌가

OAuth 리프레시 토큰은 브라우저에 두면 탈취 위험이 커서, 어딘가 신뢰된 서버가
대신 들고 있어야 한다. 처음엔 이미 쓰고 있는 Firebase의 Cloud Functions를
그 역할로 검토했지만, 두 가지 이유로 제외했다.

1. **Firebase 요금제 전환 부담**: Cloud Functions는 Spark(무료) 플랜에서 실행
   자체가 불가능하고 Blaze(종량제) 전환이 강제된다. 무료 한도 내 운영이
   가능해 보여도, 결제 정보 등록이라는 진입 장벽 자체가 부담으로 작용했다.
2. **Firestore 트리거가 실은 불필요하다는 점을 재확인**: 애초에 Firestore
   `onWrite` 트리거를 검토한 이유는 "Todo가 언제 어디서 바뀔지 모르니 서버가
   감지해야 한다"는 전제였다. 하지만 ToDoDo에서 `todos` 컬렉션에 쓰기가
   일어나는 경로는 **웹 클라이언트 하나뿐이다** — 반복 할 일의 미래 인스턴스를
   미리 만드는 호라이즌 연장도 서버 배치가 아니라 앱 진입 시 클라이언트가
   실행하는 `useRunStartupMaintenance`가 한다. 즉 "Todo가 바뀌는 순간엔 항상
   브라우저가 열려 있다"는 전제가 항상 성립하므로, DB 레벨 트리거 없이
   **클라이언트가 자기 쓰기 성공 직후 명시적으로 호출**하는 것만으로 충분하다.

이 두 가지가 겹치면서, 토큰을 안전하게 보관할 신뢰 경계만 있으면 되고 그
경계가 꼭 Firebase일 필요는 없다는 결론에 이르렀다.

**채택**: 토큰 보관과 구글 API 호출만 담당하는 얇은 프록시를 **Cloudflare
Workers**(무료 티어, 카드 등록 없이 시작 가능)에 별도로 둔다. Firestore/Auth는
지금처럼 Firebase Spark 그대로 유지한다.

이 조합(주 백엔드는 A 벤더, 특정 기능만 B 벤더의 무료 서버리스로 우회)은
정석이라기보단 실용적인 워크어라운드에 가깝다. 감수하는 비용:
- **관리 대상이 하나 늘어난다**: Cloudflare 계정, 별도 배포 파이프라인,
  별도 시크릿 보관소.
- **호출 실패 시 유실 가능성**: DB 트리거는 시스템이 실행을 보장하지만, 이
  방식은 클라이언트의 호출이 네트워크 문제로 실패하면 그 건은 그냥 씹힌다.
  아래 "에러 처리"의 재조정(reconciliation) 로직으로 보완한다.

## 아키텍처 개요

```
[클라이언트]                      [Cloudflare Worker]              [Google Calendar API]
연결 버튼 클릭  ─────────────────▶ GET /oauth/start
                                  (동의 URL 생성, state에 uid 포함)
                                        │
사용자가 구글 동의 화면에서 승인
                                        ▼
                                  GET /oauth/callback ────────────▶ 토큰 교환
                                  (refresh token을 Workers KV에
                                   uid로 저장, 클라이언트로 리다이렉트)
                                        │
클라이언트가 calendarIntegrations
문서에 connected:true 직접 기록
                                        │
useGetTodos() 결과가 바뀔 때마다 ──────▶ POST /sync-todos ──────────▶ 이벤트 생성/수정/삭제
(연동 직후 최초 1회 = 소급 동기화     (Authorization: Bearer <ID     (동시 요청 수 제한,
 포함, 그 이후는 변경분만) 클라이언트   Token>, Todo 배열 포함)         예: 최대 10개씩 병렬)
 가 직전에 동기화한 상태와 diff해서
 대상만 골라 보냄 (useSyncTodosToCalendar)

캘린더 화면 진입 ─────────────────▶ GET /events ────────────────────▶ 이벤트 목록 조회
                                  (온디맨드, 저장 안 함)

연동 해제 버튼 ───────────────────▶ POST /disconnect ────────────────▶ 매핑된 이벤트 일괄 삭제
                                  (KV에서 토큰 삭제)
```

**인증**: Worker의 각 엔드포인트는 클라이언트가 보낸 Firebase ID Token을
`Authorization: Bearer` 헤더로 받아, 구글의 공개 JWKS로 서명을 검증하고
`uid`를 추출한다. Firebase Admin SDK 없이도 가능한 방식이라 Blaze나 별도
서비스 계정 키 배포 없이 호출자 신원을 확인할 수 있다. `/oauth/start`,
`/oauth/callback`은 예외로, OAuth `state` 파라미터에 uid를 실어 왕복시킨다
(구글 리다이렉트는 커스텀 헤더를 못 붙이므로).

## 데이터 모델

### Cloudflare Workers KV

`calendar-tokens` 네임스페이스, 키는 Firebase `uid`, 값은 `{ refreshToken,
googleCalendarId }`. Firestore에도 브라우저에도 절대 노출되지 않는다.

### Firestore

`calendarIntegrations/{userId}` (신규 컬렉션) — 연동 상태만 보관, 시크릿 없음

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `connected` | boolean | 연동 활성 여부 |
| `connectedAt` | string (ISO) | 최초 연결 시각 |
| `lastSyncedAt` | string (ISO) \| null | 마지막 소급 동기화 완료 시각 |
| `status` | `"active" \| "revoked"` | 구글 쪽에서 접근 권한이 철회된 걸 감지하면 `"revoked"`로 전환 (아래 에러 처리 참고) |

시크릿을 담지 않는 순수 상태 문서라, **클라이언트가 직접 쓴다** (Worker 호출
성공 후 그 결과를 클라이언트가 이 문서에 반영). 다른 사용자 문서를 조작해도
얻을 이득이 없는 자기 자신의 UI 상태값이라, `todos`와 동일한 소유권 기반
규칙으로 충분하다.

`todos/{todoId}` 문서에 필드 하나 추가:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `googleEventId` | string \| null (optional) | 매핑된 구글 이벤트 ID. 없으면 미동기화 상태. 기존 문서엔 필드가 없을 수 있어 optional. |

`client/src/features/todo/types/todo.type.ts`의 `Todo` 인터페이스에 반영한다.
이 필드는 `/sync-todos` 응답을 받은 클라이언트가 Firestore에 기록한다.

### 보안 규칙 (`firestore.rules`)

```
match /calendarIntegrations/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

`todos` 컬렉션 규칙은 그대로 둔다. `googleEventId`는 다른 파생 필드(`archived`
등)와 마찬가지로 클라이언트가 이론상 직접 조작할 수 있지만, 최악의 경우 자신의
동기화가 깨지는 정도이지 다른 사용자 데이터 노출로 이어지지 않는다. 기존
`todos` 규칙의 필드 보호 수준과 일관된 판단이다.

## 동기화 정책

**대상 범위**: 캘린더 화면과 동일한 기준을 그대로 쓴다 — `useGetTodos()`가
반환하는 Todo 전체(`archived`(30일 지난 완료 프로젝트)가 아닌 것) 중 `dueAt`이
있는 것. 완료된 Todo도 아직 아카이브되지 않았다면 포함한다 — ToDoDo 캘린더
자체가 완료 후 30일까지는 기록으로 보여주는 정책이라, 구글 쪽도 그 기준을
그대로 따르는 게 일관적이다. 새 규칙을 추가하지 않는다.

**반복 Todo**: 인스턴스마다 별도 Firestore 문서로 존재하는 현재 구조를 그대로
따라 **각 인스턴스를 구글에 개별 이벤트로 매핑**한다. 구글 RRULE로 변환하는
방식은 채택하지 않는다 — ToDoDo의 반복 규칙과 RRULE 문법이 달라 변환 로직이
필요하고, 규칙이 바뀔 때마다 구글 쪽도 재계산해야 해서 스코프가 커진다.
대신 **API 호출 비용은 동시 요청 수 제한으로 줄인다** — 소급 동기화나 반복
호라이즌 연장으로 여러 인스턴스가 한꺼번에 생성될 때, 인스턴스 수만큼
순차적으로 보내지 않고 클라이언트가 하나의 `/sync-todos` 배치 호출로 묶어
보내면 Worker가 동시 요청 수를 제한(예: 최대 10개씩)하며 병렬로 처리한다.
데이터 모델(개별 이벤트)은 그대로 유지하면서 레이트 리밋 부담만 줄이는
절충안이다.

원래는 구글 캘린더 Batch API(multipart/mixed 요청 하나로 묶기)를 검토했으나,
구현 계획 단계에서 재검토해 제외했다 — 수동 multipart 파싱의 구현 복잡도와
구글의 batch 엔드포인트 지원 지속 여부 불확실성 대비, 동시 요청 수 제한은
구현이 훨씬 단순하면서도 이 앱 규모(개인용, 수십~수백 건)에서는 체감 효과가
거의 같다. 아래 표의 엔드포인트도 이 판단에 맞춰 `/sync-todo`와
`/sync-backfill`을 `/sync-todos`(배열을 받는 단일 엔드포인트) 하나로
합쳤다 — 둘 다 로직이 사실상 동일해 분리할 이유가 없었다.

**소급 동기화**: 연동을 처음 켜는 시점에, 그 순간 "동기화 대상 범위" 기준을
만족하는 기존 Todo 전체를 클라이언트가 모아 `/sync-todos`로 한 번에 보낸다.

**생명주기**: 개별 쓰기 시점마다 호출을 걸지 않고, `useSyncTodosToCalendar`
훅 하나가 `useGetTodos()` 결과가 바뀔 때마다 반응해서 처리한다(아래 "클라이언트
구조" 참고). 이 훅이 "동기화 대상 범위"에 해당하는 Todo 목록과, 이 세션에서
마지막으로 성공 동기화한 `updatedAt` 스냅샷을 비교해 diff를 계산한다:
- 새로 대상에 들어온 Todo(생성, 또는 `dueAt`이 새로 채워짐) → `/sync-todos`에
  `action: "upsert"`로 포함
- 대상에 남아있지만 `updatedAt`이 바뀐 Todo(제목/마감일 변경 등) →
  동일하게 `action: "upsert"`로 포함 (Worker는 `googleEventId` 존재 여부로
  생성/수정을 알아서 분기)
- 대상에서 빠진 Todo(삭제, `dueAt` 제거, 아카이브) → 직전 스냅샷에 있던
  `googleEventId`를 `action: "delete"`로 포함
- 반복 시리즈 규칙 변경 → 기존 재생성 로직(문서 삭제 후 재생성)이 만들어내는
  변화도 위 diff에 자연히 잡힌다. 별도 로직 불필요.
- 연동 해제 → `/disconnect` 호출로 매핑된 구글 이벤트를 **일괄 삭제**한다.
  사용자가 해제 후에는 ToDoDo가 더 이상 이벤트를 갱신할 방법이 없어, 남겨두면
  영원히 갱신 안 되는 죽은 데이터가 되기 때문이다. 알려진 한계: 사용자가
  구글 캘린더에서 해당 이벤트를 직접 수정(메모 추가 등)해뒀다면 그 수정
  내용도 삭제 시 함께 사라진다. 이를 감지해 보존하는 로직은 만들지 않는다
  (YAGNI) — 스펙에 명시된 제약사항으로 남긴다.

## OAuth 스코프

`https://www.googleapis.com/auth/calendar.events` 단일 스코프만 요청한다. 이
스코프는 이벤트에 대한 읽기·쓰기를 모두 포함해서, 동기화(쓰기)와 온디맨드
표시(읽기) 양쪽 요구를 하나로 충족한다. 캘린더 목록 전체를 다루는 더 넓은
스코프는 요청하지 않는다 — 기본 캘린더 고정이라 필요 없다.

**구글 OAuth 동의 화면 검증**: 이 스코프는 구글이 "민감한 범위(sensitive
scope)"로 분류한다. 테스트 사용자 범위를 벗어나 일반 사용자에게 공개하려면
구글의 OAuth 동의 화면 검증을 통과해야 하고, 심사에 수일이 걸릴 수 있다.
호스팅 방식(Cloudflare vs Firebase)과 무관하게 남는 외부 의존성이며, 이 기능의
실제 출시 시점을 좌우한다.

## Cloudflare Worker 엔드포인트 목록

새 최상위 디렉토리 `calendar-proxy/`에 독립 프로젝트로 둔다(자체
`wrangler.toml`, `package.json`). `client/`나 `server/`와 의존 관계 없음.

| 엔드포인트 | 인증 | 역할 |
| --- | --- | --- |
| `GET /oauth/start` | Firebase ID Token | OAuth 동의 URL 생성, `state`에 uid 포함 |
| `GET /oauth/callback` | OAuth `state`로 uid 확인 | 인가 코드 → 토큰 교환, refresh token을 KV에 저장, 클라이언트로 리다이렉트 |
| `POST /sync-todos` | Firebase ID Token | Todo 배열(각각 `action: "upsert" \| "delete"`)을 받아 이벤트 생성/수정/삭제. 동시 요청 수를 제한(예: 최대 10개씩)하며 병렬 처리. 소급 동기화와 평소 변경 동기화가 이 엔드포인트 하나를 공유한다 |
| `GET /events` | Firebase ID Token | 온디맨드 구글 이벤트 조회 (저장 안 함) |
| `POST /disconnect` | Firebase ID Token | 매핑된 이벤트 일괄 삭제(동시 요청 수 제한), KV에서 토큰 삭제 |

## 클라이언트 구조

`client/CLAUDE.md`의 `api/ → hooks/ → components/` 순서를 따라
`src/features/calendarIntegration/`을 신설한다.

- `api/calendarProxyApi.ts`: 위 Worker 엔드포인트를 감싼 `fetch` wrapper.
  매 호출마다 `auth.currentUser.getIdToken()`으로 받은 토큰을 헤더에 싣는다.
- `hooks/useCalendarIntegration.ts`: 연결 상태 조회(`calendarIntegrations`
  문서 구독), 연결/해제 mutation. 성공 시 Firestore 상태 문서를 직접 갱신.
- `hooks/useGoogleCalendarEvents.ts`: 캘린더 화면 진입 시 `/events` 호출
  (TanStack Query, 캘린더 화면 마운트/월 이동 시에만 fetch)
- `hooks/useSyncTodosToCalendar.ts`: `useGetTodos()` 결과를 관찰하는 단일
  훅. 개별 mutation 호출부(생성/수정/삭제/반복 시리즈 등 8곳)를 일일이 건드리는
  대신, "동기화 대상 범위" Todo 목록이 바뀔 때마다 이 훅 하나가 반응해서
  `/sync-todos`를 호출한다 — 모든 mutation이 성공 시 이미 `["todos"]` 쿼리를
  invalidate하고 있으므로(기존 관례), 그 결과 목록을 지켜보는 것만으로 모든
  변경 경로를 놓치지 않고 잡아낼 수 있다. 연동 안 된 사용자는 조기 반환.
  세션 내 마지막 동기화 스냅샷을 `useRef`로 들고 있어, 관련 없는 다른 Todo의
  변경으로 목록 참조가 바뀌어도 실제로 바뀐 것만 골라 보낸다. 앱 진입 시
  최초 실행이 곧 소급 동기화이자 재조정(reconciliation)을 겸한다 — 매 세션
  시작마다 스냅샷이 비어 있는 상태로 시작하므로, 직전 세션에서 호출이
  실패해 놓친 Todo도 다음 진입 때 다시 대상에 잡힌다.
  `client/src/App.tsx`에 `useRunStartupMaintenance`와 나란히 마운트한다.
- `components/calendarConnectionButton.tsx`: 연결/해제 버튼 + 상태 표시.
  `features/dashboard/components/calendar.tsx`의 뷰 전환 버튼 옆에 배치한다
  (전역 메뉴가 아니라 캘린더 화면 전용 기능이므로).
- 기존 `features/dashboard/components/calendar.tsx`에 구글 이벤트를 읽기
  전용 레이어로 오버레이 표시하는 부분만 추가(수정 불가, 별도 스타일로 구분)

## 프리미엄 게이팅 훅

지금은 전원 무료로 제공한다. 나중에 유료 전환을 결정하면 코드 전체를 다시
뒤지지 않도록, `useCalendarIntegration` 진입 지점에 게이팅 체크 자리만
마련해둔다:

```ts
// 지금은 항상 true. 유료 전환 시 실제 구독 상태 체크로 교체.
const isCalendarIntegrationUnlocked = true;
```

## 에러 처리

- **토큰 만료/철회**: 구글 API 호출이 `invalid_grant` 등으로 실패하면
  Worker가 에러 코드를 반환하고, 클라이언트가 `calendarIntegrations.status`를
  `"revoked"`로 갱신한다. 클라이언트는 이 상태를 보고 "다시 연결해주세요"
  배너를 표시한다.
- **레이트 리밋**: 동시 요청 수를 제한해뒀지만, 그래도 429 응답을 받으면
  Worker가 지수 백오프로 재시도한다.
- **`/sync-todos` 호출 유실 대비 재조정**: 호출 자체가 네트워크 오류로
  실패하면 그 배치는 동기화가 안 된 채로 남는다. 별도 재시도 큐를 만들지
  않는다 — `useSyncTodosToCalendar`가 다음 `todos` 변경(사용자의 다음
  조작)이나 다음 앱 진입(세션 재시작으로 스냅샷이 초기화됨) 때 같은 Todo를
  다시 대상으로 잡아 자연히 재시도된다.

## 테스트

- Worker 유닛 테스트: `Todo` → 구글 `Event` 변환 로직, 동시 요청 수 제한
  로직, ID 토큰 검증 로직, 연동 해제 시 일괄 삭제 로직 (Google API는 mock).
- 클라이언트: `useCalendarIntegration`/`useGoogleCalendarEvents`/
  `useSyncTodosToCalendar` 훅 유닛 테스트(mock), `calendarConnectionButton`
  렌더링 테스트, diff 로직(생성/수정/삭제 판정)이 정확한지 검증.
- E2E(Playwright): 이번 범위에서는 제외 — 실제 구글 OAuth 플로우를 테스트
  환경에서 재현하기 어렵다. 기존 관례(`feedback` 기능 스펙)와 동일하게
  판단.

## 후속 작업 (범위 밖)

- 모바일(`mobile/`) 연동 — 딥링크 기반 OAuth, 네이티브 리빌드 필요
- 구글 → ToDoDo 진짜 양방향 동기화 (webhook 수신)
- 여러 캘린더 중 선택 UI
- 유료 게이팅 실제 적용 (사용률 검증 후 재논의)
- `calendar-proxy/` 배포 파이프라인(CI/CD) — 지금은 수동 `wrangler deploy`로
  충분하다고 보고 자동화는 미룬다
