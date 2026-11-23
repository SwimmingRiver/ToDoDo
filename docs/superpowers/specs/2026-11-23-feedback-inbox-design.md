# 고객 의견 수신 경로 설계 (의견 받은편지함)

## 배경 / 목적

웹의 "의견 보내기"(2026-08-27 스펙, PR #100→#107)는 Firestore `feedback`
컬렉션에 저장만 하고 운영자에게 알리지 않는다. 확인하려면 Firebase 콘솔에
직접 들어가야 해서 사실상 놓친다. iOS 앱 공개(12-28 이후)로 사용자가 늘기 전에
운영자가 **놓치지 않고 받고, 반영할 것을 골라 표시할 수 있는** 구조를 갖춘다.

운영자 요구(11-23 사용자):
- 앱에서도 의견을 보낼 수 있어야 한다. (08-29 "앱 이식 안 함" 결정을 이번에 뒤집음)
- 의견이 오면 운영자 휴대폰으로 알림이 오고, 수시로 확인할 수 있어야 한다.
- 고객에게 직접 답장하는 기능은 아직 필요 없다. 필요한 의견을 골라 서비스에
  반영하는 것이 목적이다.

## 목표 / 비목표 / 반목표

목표
- 웹·앱 의견 제출 → 운영자 Discord(휴대폰 앱 설치됨)로 즉시 알림.
- 운영자가 휴대폰 브라우저로 의견 목록을 보고 상태(새 의견/반영 예정/반영함/안 함)를 바꿀 수 있다.
- 앱(mobile/) 계정 화면에 의견 보내기 추가.

비목표
- 고객 답장, 메일·App Store 리뷰 통합(각각 Gmail·App Store Connect 앱이 이미 휴대폰으로 알림).
- 카테고리·평점, Notion 동기화.

반목표 (기술적으로 돌아가도 실패인 것)
- 의견 내용·이메일·회원 식별자가 개인정보처리방침 5번(처리 위탁) 목록에 없는 곳
  (Discord 등)으로 나가는 것. → 알림에는 개인정보를 넣지 않는다.
- 탈퇴 시 "식별자·이메일 지우고 내용만 남김" 약속(처리방침 4·6번,
  `billing-proxy/src/accountDataStore.ts` `deleteUserData`)이 깨지는 것.
- 누구나 운영자 휴대폰에 알림을 쏟아낼 수 있는 것(알림 스팸).

## 제약

- Firebase Spark 플랜 → Cloud Functions 불가. 서버 로직은 Cloudflare Worker.
- 원본 저장소는 Firestore `feedback`(처리방침상 Google이 수탁자로 이미 고지됨).
- Worker 시크릿은 사용자가 자기 터미널에서 `wrangler secret put`으로 등록. 운영 배포는 사용자 확인 후.
- 다른 세션: lancetfish가 reminder-proxy(서버 푸시) 작업 중 → reminder-proxy는 건드리지 않는다.
- Worker에서 Node 전용 API(Buffer 등) 금지(btoa/atob), 루트 @types/node 누수 주의.

## 접근 방식 (검토한 것)

| 안 | 내용 | 결과 |
| --- | --- | --- |
| A. Notion 표 + 메신저 알림 | 의견을 Notion DB로 복사해 상태 관리 | 기각: Notion·메신저로 내용/이메일이 나가 처리방침 개정 필요, 탈퇴 시 사본 삭제 문제 |
| B. 메일로 받기 | Worker가 운영자 Gmail로 발송 | 기각: 메일 발송 서비스+DNS 설정 필요, 상태 관리 엉성 |
| **C. Firestore 원본 + 운영자 웹 페이지 + 내용 없는 Discord 알림** | 데이터는 한곳, 알림엔 개인정보 없음 | **채택**(사용자 선택, 11-23) |

사용자가 "Firebase에 저장 안 해도 되나, 서비스 데이터는 한곳에 모아야 하지 않나"라고
물어 C로 확정. 알림 채널은 Discord(사용자 휴대폰에 설치됨).

## 설계

### 1. 제출 경로: 클라이언트 → 새 Worker `feedback-proxy`

클라이언트가 Firestore에 직접 쓰지 않고 Worker에 보낸다. 이유: 알림을 Worker가
보내야 하는데, 클라이언트가 "저장 후 알림 호출"을 따로 하면 저장 없이 알림만
호출하는 스팸을 막기 어렵다. 저장과 알림을 서버 한 곳에서 한다.

- `POST /feedback` — `Authorization: Bearer <Firebase ID 토큰>`, 본문 `{ content, platform }`.
  - `packages/worker-auth`의 `verifyFirebaseIdToken`으로 검증, CORS는 `isAllowedOrigin`.
    (앱은 Origin이 없으므로 기존 ai-proxy/calendar-proxy의 앱 처리 방식을 따른다.)
  - content: trim 후 1~1000자(기존 `FEEDBACK_CONTENT_MAX_LENGTH`와 동일). 위반 시 400.
  - platform: `"web" | "ios" | "android"`. 그 외 400.
  - 이메일: ID 토큰의 `email` 클레임을 쓰고 없으면 `null`로 저장(Apple 이메일 없음 대비).
    worker-auth의 `VerifiedToken`은 현재 email을 버리므로, 이 Worker용으로 email을
    선택적으로 꺼내는 방법은 빌더 재량(worker-auth에 옵션 필드 추가가 가장 단순).
  - 서비스계정으로 Firestore REST에 문서 생성(createdAt은 서버 시각 ISO 문자열 — 기존 문서와 같은 형식).
  - 저장 성공 후 Discord 웹훅 호출. **웹훅 실패는 제출 실패로 만들지 않는다**
    (원본은 이미 저장됨; `console.error`로 남김). 응답 201.
  - 남용 방지 (두 겹, 둘 다 Cloudflare `ratelimits` 바인딩 — ai-proxy `AI_RATE_LIMIT`와 같은 방식, KV 불필요):
    - uid 기준 제출 제한(예: 60초 3회). 초과 시 429, 저장하지 않음.
    - 전역 알림 상한(고정 키, 예: 60초 10건). 초과 시 **저장은 하고 Discord 호출만 건너뜀**.
      계정을 여러 개 만들어 운영자 휴대폰에 알림을 쏟아내는 것을 막는다. (Claude 판단, 빌더 확인 후 반영)
    - 정확한 수치는 빌더 재량.
- 새 Worker로 두는 이유(빌더 결정, Claude 판단): 기존 Worker들이 기능별로 나뉘어 있고
  reminder-proxy는 다른 세션이 작업 중. billing-proxy에 얹는 것도 가능하나 결제와 무관한
  기능을 섞지 않는다. 서비스계정 Firestore 접근·Google 토큰 코드는 billing-proxy/reminder-proxy
  것을 참고해 복사하거나 공용화(빌더 재량, 단 reminder-proxy 파일 수정은 피함).
- 시크릿: `GOOGLE_SERVICE_ACCOUNT`, `DISCORD_WEBHOOK_URL`. 사용자가 직접 등록.
- CI: `.github/workflows/ci.yml`에 다른 Worker와 같은 형태의 job(테스트·타입체크·main 배포) 추가.

### 2. 데이터 모델 (`feedback` 문서)

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| userId | string | 기존 |
| email | string \| null | 기존(이제 null 허용) |
| content | string | 기존 |
| createdAt | string(ISO) | 기존 |
| platform | "web" \| "ios" \| "android" | 신규. 기존 문서엔 없음 → "web"으로 간주 |
| status | "new" \| "planned" \| "done" \| "wontfix" | 신규. 없으면 "new"로 간주 |

화면 문구: new=새 의견, planned=반영 예정, done=반영함, wontfix=안 함.
탈퇴 처리(`updateMask: userId, email`)는 새 필드에 영향 없음 — 수정 불필요.
기존 문서 백필은 하지 않는다(없으면 기본값으로 읽음).

### 3. 보안 규칙 (`firestore.rules`)

```
match /feedback/{feedbackId} {
  function isOperator() { return request.auth != null && request.auth.token.operator == true; }
  allow read: if isOperator();
  allow update: if isOperator()
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status"])
                && request.resource.data.status in ["new", "planned", "done", "wontfix"];
  allow create, delete: if false;
}
```

- 클라이언트 create를 막는다(이제 Worker만 씀). 웹은 배포 시 함께 바뀌므로 순서:
  **Worker 배포 → 웹 배포 → 규칙 배포.** 규칙을 먼저 배포하면 그 사이 옛 웹 번들의 제출이 실패한다.
- 운영자 표시: 커스텀 클레임 `operator: true`. 기존 클레임(premiumUntil)과 병합해 설정하는
  스크립트 `scripts/grantOperator.ts`(grantEntitlement.ts와 같은 방식). 운영자 계정에 1회 실행.

### 4. 운영자 페이지 (웹)

- 라우트 `/admin/feedback` (`client/src/router.tsx`). 로그인 + `operator` 클레임이 없으면
  일반 사용자에게는 존재하지 않는 것처럼 기존 404/홈 처리(빌더 재량, 정보 노출 없이).
- 사이드바·드로어에 링크를 넣지 않는다. Discord 알림의 링크로 들어온다.
- 목록: 최신순(`orderBy createdAt desc`, 단일 필드라 색인 불필요), 최근 100건 정도 조회 후
  상태 필터는 화면에서(복합 색인 회피). 각 항목: 작성 시각, platform, 이메일(없으면 "이메일 없음"),
  내용 전문, 상태 선택.
- 휴대폰 폭에서 읽기 좋게(세로 카드). 기존 디자인 토큰 사용.
- 기능 폴더: `client/src/features/feedback/` 아래 api/hooks/components에 추가
  (client/CLAUDE.md의 api→hooks→components 순서).

### 5. Discord 알림

- 내용: `새 의견 1건 (ios)` + 운영자 페이지 링크. **의견 내용·이메일·uid는 넣지 않는다.**
- 링크 주소는 Worker 환경변수(`CLIENT_APP_URL` 등 기존 이름 재사용 가능 여부는 빌더가 확인).

### 6. 웹 제출 변경

- `client/src/features/feedback/api/feedbackApi.ts`: `addDoc` 대신 `VITE_FEEDBACK_PROXY_URL`로
  POST. 기존 UI·성공/실패 동작·Sentry 캡처 유지. 429는 "잠시 후 다시 시도" 문구.
- `VITE_FEEDBACK_PROXY_URL` 추가(.env 예시·CI·Hosting 빌드 환경).

### 7. 앱 제출 추가 (mobile/)

- `mobile/src/screens/AccountScreen.tsx`에 "의견 보내기" 항목 → 입력 화면(또는 모달).
  1000자 제한·카운터, 빈 입력 시 제출 비활성, 성공 시 감사 안내 후 닫힘, 실패 시 입력 보존.
- 다른 앱 프록시 API(`aiProxyApi.ts`, `calendarProxyApi.ts`) 패턴으로 `feedbackProxyApi.ts`.
- 키보드가 입력창을 가리지 않게, iOS 스와이프 백 시 작성 중 내용 유실은 허용(짧은 글이라)
  — 빌더 재량. EAS env에 `EXPO_PUBLIC_FEEDBACK_PROXY_URL`(이름은 기존 앱 env 관례 따름) 추가 필요.

### 8. 개인정보처리방침

수집 항목·수탁자는 바뀌지 않는다(의견은 원래 수집 중, Firestore=Google, Worker=Cloudflare
"서버 기능 실행"). 단, Cloudflare 행의 "처리하는 정보"에 의견이 없다(Worker는 저장하지 않고 중계만 함).

**결정(11-23 사용자):** 개정을 기다리지 않고 기능을 배포한다. Cloudflare 행에 "의견"을 추가하는 것은
다음 판 개정 때 함께 한다 — 이 작업 범위 밖이지만 잊지 않도록 후속 할 일로 기록한다.

## 일정 / 순서

**결정(11-23 사용자):** 앱 의견 보내기를 iOS 첫 심사 빌드(EAS production)에 포함한다. 그래서 순서는:

1. feedback-proxy Worker (+ CI job) → 사용자가 시크릿 등록 후 운영 배포
2. 앱 제출 화면 + EAS env(`EXPO_PUBLIC_…_FEEDBACK_PROXY_URL`) 등록
3. 웹 제출 경로를 Worker로 전환
4. 운영자 클레임 스크립트 + 운영자 페이지 + 규칙 변경
5. main 릴리스 (production 빌드 전). 배포 순서는 Worker → 웹 → 규칙.

## 테스트

- Worker: 토큰 없음/무효 401, 내용 검증 400, 레이트리밋 429, 저장 성공 시 웹훅 호출,
  웹훅 실패여도 201, 이메일 클레임 없을 때 null 저장, 알림 본문에 내용·이메일이 없음.
- 웹: feedbackApi가 Worker로 POST, 운영자 페이지 목록·상태 변경, 비운영자 차단.
- 앱: 제출 화면 상태 전환.
- 규칙: 프로젝트 관례상 규칙 테스트 스위트 없음 — 에뮬레이터로 운영자 read/update, 일반 사용자
  read 거부, 클라이언트 create 거부를 수동 확인.

## 빌더 재량으로 남긴 것

레이트리밋 수치, worker-auth에서 email 꺼내는 방식, 서비스계정 코드 공용화 여부,
비운영자 접근 시 화면 처리, 앱 입력 UI 형태(화면 vs 모달), 환경변수 이름.
