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

## 전제 조건 / 제약사항

- **Firebase 요금제를 Blaze(종량제)로 전환해야 한다.** Cloud Functions는 Spark
  (무료) 플랜에서 실행 불가능하다. 무료 사용량 한도 내에서 운영 가능할 것으로
  보이나, 실제 결제 정보 등록이 필요한 변경이므로 구현 착수 전 별도로
  확인받는다.
- **구글 OAuth 동의 화면 검증**: 요청할 `calendar.events` 스코프는 구글이
  "민감한 범위(sensitive scope)"로 분류한다. 테스트 사용자 범위를 벗어나
  일반 사용자에게 공개하려면 구글의 OAuth 동의 화면 검증을 통과해야 하고,
  심사에 수일이 걸릴 수 있다. 이는 이 기능의 실제 출시 시점을 좌우하는
  외부 의존성이다.
- 지금 레포에는 Cloud Functions 설정이 전혀 없다(`firebase.json`에 functions
  섹션 없음, `functions/` 디렉토리 없음). 이 기능이 최초 도입이다.

## 아키텍처 개요

클라이언트는 구글 API를 직접 호출하지 않는다. OAuth 리프레시 토큰을 클라이언트
(브라우저)에 두면 탈취 위험이 크기 때문에, **Cloud Functions가 인증 프록시
겸 BFF(Backend for Frontend) 역할**을 한다 — 토큰을 대신 들고 있다가 클라이언트나
Firestore 이벤트를 대신해 구글에 요청을 보내고, ToDoDo의 `Todo` 형식과 구글의
`Event` 형식 사이 변환을 담당한다.

```
[클라이언트]                [Cloud Functions]              [Google Calendar API]
연결 버튼 클릭  ───────────▶ startGoogleOAuth
                            (동의 URL 생성)
                                  │
사용자가 구글 동의 화면에서 승인
                                  ▼
                            googleOAuthCallback ─────────▶ 토큰 교환
                            (토큰 저장, 소급 동기화 트리거)

Todo 생성/수정/삭제 ────────▶ Firestore 쓰기
  (client-direct)                  │
                                  ▼
                            onTodoWrite (Firestore 트리거) ─▶ 이벤트 생성/수정/삭제

캘린더 화면 진입 ───────────▶ listGoogleCalendarEvents ────▶ 이벤트 목록 조회
                            (온디맨드, 저장 안 함)

연동 해제 버튼 ─────────────▶ disconnectGoogleCalendar ────▶ 매핑된 이벤트 일괄 삭제
                            (토큰/매핑 삭제)
```

## 데이터 모델

### Firestore

`calendarIntegrations/{userId}` (신규 컬렉션)

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `connected` | boolean | 연동 활성 여부 |
| `connectedAt` | string (ISO) | 최초 연결 시각 |
| `lastSyncedAt` | string (ISO) \| null | 마지막 소급 동기화 완료 시각 |
| `status` | `"active" \| "revoked"` | 구글 쪽에서 접근 권한이 철회된 걸 감지하면 `"revoked"`로 전환 (아래 에러 처리 참고) |

토큰은 이 컬렉션에 두지 않는다. `calendarTokens/{userId}` 컬렉션(refresh
token 저장)은 보안 규칙에서 클라이언트 접근을 전면 차단하고, Cloud Functions의
Admin SDK만 읽고 쓴다.

`todos/{todoId}` 문서에 필드 하나 추가:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `googleEventId` | string \| null (optional) | 매핑된 구글 이벤트 ID. 없으면 미동기화 상태. 기존 문서엔 필드가 없을 수 있어 optional. |

`client/src/features/todo/types/todo.type.ts`의 `Todo` 인터페이스에 반영한다.

### 보안 규칙 (`firestore.rules`)

```
match /calendarIntegrations/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if false; // Admin SDK(Functions)만 쓴다
}

match /calendarTokens/{userId} {
  allow read, write: if false; // Admin SDK 전용, 클라이언트 접근 전면 차단
}
```

`todos` 컬렉션 규칙은 그대로 둔다. `googleEventId`는 다른 파생 필드(`archived`
등)와 마찬가지로 클라이언트가 이론상 직접 바꿀 수 있지만, 실제로는 Function이
매번 자신이 쓴 값을 기준으로 동작하므로 클라이언트가 이 필드를 조작해도 다른
사용자의 데이터가 노출되는 등의 보안 문제로는 이어지지 않는다(최악의 경우 자신의
동기화가 깨지는 정도). 기존 `todos` 규칙의 필드 보호 수준과 일관된 판단이다.

## 동기화 정책

**대상 범위**: 캘린더 화면과 동일한 기준을 그대로 쓴다 — `useGetTodos()`가
반환하는 Todo 전체(`dueAt`이 있고, `archived`(30일 지난 완료 프로젝트)가 아닌
것) 중 `dueAt`이 있는 것. 완료된 Todo도 아직 아카이브되지 않았다면 포함한다 —
ToDoDo 캘린더 자체가 완료 후 30일까지는 기록으로 보여주는 정책이라, 구글 쪽도
그 기준을 그대로 따르는 게 일관적이다. 새 규칙을 추가하지 않는다.

**반복 Todo**: 인스턴스마다 별도 Firestore 문서로 존재하는 현재 구조를 그대로
따라 **각 인스턴스를 구글에 개별 이벤트로 매핑**한다. 구글 RRULE로 변환하는
방식은 채택하지 않는다 — ToDoDo의 반복 규칙과 RRULE 문법이 달라 변환 로직이
필요하고, 규칙이 바뀔 때마다 구글 쪽도 재계산해야 해서 스코프가 커진다.
대신 **API 호출 비용은 구글 캘린더 Batch API로 줄인다** — 소급 동기화나 반복
호라이즌 연장으로 여러 인스턴스가 한꺼번에 생성될 때, 인스턴스 수만큼 개별
요청을 보내지 않고 하나의 배치 요청으로 묶는다. 데이터 모델(개별 이벤트)은
그대로 유지하면서 레이트 리밋·Function 실행 시간 부담만 줄이는 절충안이다.

**소급 동기화**: 연동을 처음 켜는 시점에, 그 순간 "동기화 대상 범위" 기준을
만족하는 기존 Todo 전체를 한 번에 이벤트로 만든다(`googleOAuthCallback` 완료
직후 `backfillGoogleCalendarSync` 실행). Batch API로 묶어서 보낸다.

**생명주기**:
- Todo의 `dueAt` 변경/삭제 → `onTodoWrite` 트리거가 매핑된 구글 이벤트를
  수정/삭제
- 반복 시리즈 규칙 변경 → 기존 재생성 로직에 따라 새로 생성되는 인스턴스만큼
  구글 이벤트도 새로 생성 (별도 로직 불필요, 자연히 따라감)
- 연동 해제 → 매핑된 구글 이벤트를 **일괄 삭제**한다. 사용자가 해제 후에는
  ToDoDo가 더 이상 이벤트를 갱신할 방법이 없어, 남겨두면 영원히 갱신 안 되는
  죽은 데이터가 되기 때문이다. 알려진 한계: 사용자가 구글 캘린더에서 해당
  이벤트를 직접 수정(메모 추가 등)해뒀다면 그 수정 내용도 삭제 시 함께
  사라진다. 이를 감지해 보존하는 로직은 만들지 않는다(YAGNI) — 스펙에
  명시된 제약사항으로 남긴다.

## OAuth 스코프

`https://www.googleapis.com/auth/calendar.events` 단일 스코프만 요청한다. 이
스코프는 이벤트에 대한 읽기·쓰기를 모두 포함해서, 동기화(쓰기)와 온디맨드
표시(읽기) 양쪽 요구를 하나로 충족한다. 캘린더 목록 전체를 다루는 더 넓은
스코프는 요청하지 않는다 — 기본 캘린더 고정이라 필요 없다.

## Cloud Functions 목록

| 함수 | 트리거 | 역할 |
| --- | --- | --- |
| `startGoogleOAuth` | HTTPS callable | OAuth 동의 URL 생성 |
| `googleOAuthCallback` | HTTPS | 인가 코드 → 토큰 교환, `calendarTokens`/`calendarIntegrations` 문서 생성, 소급 동기화 트리거 |
| `backfillGoogleCalendarSync` | (callback에서 직접 호출) | 연동 시점 기존 Todo 일괄 반영 (Batch API) |
| `onTodoWrite` | Firestore 트리거 (`todos/{todoId}`) | Todo 생성/수정/삭제 시 매핑된 구글 이벤트 생성/수정/삭제. 연동 안 된 사용자는 조기 반환 |
| `listGoogleCalendarEvents` | HTTPS callable | 캘린더 화면 진입 시 온디맨드로 구글 이벤트 조회 (저장 안 함) |
| `disconnectGoogleCalendar` | HTTPS callable | 매핑된 이벤트 일괄 삭제(Batch API), 토큰/연동 문서 삭제 |

## 클라이언트 구조

`client/CLAUDE.md`의 `api/ → hooks/ → components/` 순서를 따라
`src/features/calendarIntegration/`을 신설한다.

- `api/calendarIntegrationApi.ts`: 위 callable Function들을 감싼 얇은 wrapper
- `hooks/useCalendarIntegration.ts`: 연결 상태 조회(`calendarIntegrations`
  문서 구독), 연결/해제 mutation
- `hooks/useGoogleCalendarEvents.ts`: 캘린더 화면 진입 시 `listGoogleCalendarEvents`
  호출 (TanStack Query, 캘린더 화면 마운트/월 이동 시에만 fetch)
- `components/calendarConnectionButton.tsx`: 연결/해제 버튼 + 상태 표시
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
  `calendarIntegrations.status`를 `"revoked"`로 갱신. 클라이언트는 이 상태를
  보고 "다시 연결해주세요" 배너를 표시한다.
- **레이트 리밋**: Batch API로 요청 수를 줄였지만, 그래도 429 응답을 받으면
  지수 백오프로 재시도한다.
- **Function 실행 시간**: 소급 동기화 대상이 매우 많을 경우를 대비해 배치
  단위로 나눠 처리한다(단일 실행에서 전부 처리 못 하면 다음 배치를 이어서
  처리).

## 테스트

- Function 유닛 테스트: `Todo` → 구글 `Event` 변환 로직, 배치 청크 분할 로직,
  연동 해제 시 일괄 삭제 로직 (Google API는 mock).
- 클라이언트: `useCalendarIntegration`/`useGoogleCalendarEvents` 훅 유닛
  테스트(mock), `calendarConnectionButton` 렌더링 테스트.
- E2E(Playwright): 이번 범위에서는 제외 — 실제 구글 OAuth 플로우를 테스트
  환경에서 재현하기 어렵다. 기존 관례(`feedback` 기능 스펙)와 동일하게
  판단.

## 후속 작업 (범위 밖)

- 모바일(`mobile/`) 연동 — 딥링크 기반 OAuth, 네이티브 리빌드 필요
- 구글 → ToDoDo 진짜 양방향 동기화 (webhook 수신)
- 여러 캘린더 중 선택 UI
- 유료 게이팅 실제 적용 (사용률 검증 후 재논의)
