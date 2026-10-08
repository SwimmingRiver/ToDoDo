# 프리미엄 결제/구독 (Paddle) 설계

- 날짜: 2026-10-04
- 브랜치: `feat/premium-billing`
- 선행: 프리미엄 서버 강제(`2026-09-14-premium-entitlement-server-enforcement-design.md`), 로드맵 조각 3(결제/구독)

## 목적

프리미엄 기능(AI 플랜·구글 캘린더 연동·통계)은 배포됐지만 권한은 운영자가
`scripts/grantEntitlement.ts`로 수동 부여해야만 생긴다. 사용자가 스스로 결제하고,
결제 상태에 따라 권한이 자동으로 부여·회수되는 흐름을 만든다.

이번 범위는 **구조 완성 + 테스트(샌드박스) 모드 운영**이다. 실결제 전환은 Paddle 운영
계정 키 교체와 게이트 해제만으로 가능해야 한다(코드 구조 변경 없이).

**성공 기준**

- 허용 목록의 사용자가 `/premium`에서 월간 구독을 결제하면, 새로고침·재로그인 없이 수 초 안에
  프리미엄 기능이 클라이언트와 서버(rules·Worker) 양쪽에서 열린다.
- Paddle 고객 포털에서 해지하면 결제한 기간 끝까지 유지된 뒤 자동으로 잠긴다(스케줄러 없이).
- 카드 없는 7일 체험을 계정당 1회 쓸 수 있고, 끝나면 자동으로 잠긴다.
- 웹훅이 중복·역순·일시 실패로 와도 최종 상태가 Paddle의 구독 상태와 일치한다.
- 샌드박스 기간 동안 허용 목록 밖의 사용자는 테스트 카드로 프리미엄을 얻을 수 없다.

## 확정된 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 목적 | 구조 완성 + 샌드박스 운영, 실결제는 나중 | 사용자 선택 |
| 대상 | 한국 사용자 위주 | 사용자 선택 |
| 결제사 | Paddle Billing (MoR) | 구독 엔진(갱신·재시도·해지)을 결제사가 맡아 자체 스케줄러 불필요. 카카오페이·네이버페이·국내카드 지원. 개인 신청 가능. 국내 PG(포트원/토스)는 갱신 예약·재시도를 직접 구현해야 하고 실운영에 사업자+빌링 별도 심사 필요 |
| 요금제 | 월간 1종 | 사용자 선택. 연간은 스코프 밖 |
| 체험 | 카드 없는 7일, 계정당 1회, **우리가 직접 관리** | 사용자 선택. Paddle 체험은 카드 필수라 사용하지 않음 |
| 체험 중 구독 | 즉시 첫 결제, 남은 체험 일수 소멸 | 단순성 |
| 권한 클레임 | `premium: boolean` → `premiumUntil: number`(epoch 초) | 만료 시각 비교만으로 자동 회수 → 회수 스케줄러 불필요 |
| 갱신 유예 | 정기 갱신 시 `기간 끝 + 3일` | 토큰 갱신 최대 1시간 지연 동안 정상 갱신자가 경계에서 잠기지 않게 |
| 해지·카드 변경 UI | Paddle 고객 포털 | 직접 구현 불필요 |
| 결제창 생성 | 서버(Worker)가 거래 생성, 클라이언트는 `transactionId`로만 오픈 | 브라우저가 `customData.uid`를 넣으면 조작 가능 |
| 서버 위치 | 신규 Cloudflare Worker `billing-proxy` | 기존 Worker 패턴. Blaze 불필요 |
| 서비스 계정 | 결제 전용 신규(쓰기 권한) | reminder-proxy의 읽기 전용(Viewer) 계정은 그대로 유지 |
| 샌드박스 게이트 | Worker `BILLING_ALLOWED_UIDS`(`/checkout`·`/trial`과 웹훅 양쪽) + 클라이언트 `VITE_BILLING_ENABLED` | 운영 Firestore가 샌드박스 결제에 연결되므로 공개 테스트 카드로 권한 획득을 막아야 함 |
| 웹훅 uid 신뢰 | `/checkout`이 `custom_data`에 `uid`와 `uid_sig`(HMAC-SHA256, 키 `BILLING_UID_SECRET`)를 넣고 웹훅은 서명이 맞는 uid만 반영 | 레포가 공개이고 Paddle 클라이언트 토큰이 번들에 들어가므로, 누구나 Paddle.js로 결제창을 직접 열어 `customData`에 남의 uid를 넣을 수 있다(10-05 최종 리뷰에서 발견) |

## 전체 구조

```
[client] 구독하기 ──POST /checkout──▶ [billing-proxy] ──Paddle API──▶ 거래 생성(custom_data = { uid: 토큰 uid, uid_sig })
   │                                        │
   └─ Paddle.js 오버레이(transactionId)       │
                                            │
[Paddle] ──웹훅 subscription.*──▶ POST /webhooks/paddle
                                  Paddle 서명 검증 → uid·uid_sig 검증 → 허용 목록 → 중복/역순·다른 구독 해지 무시
                                  → 커스텀 클레임 premiumUntil 갱신 → entitlements/{uid} 갱신
[client] 7일 체험 ──POST /trial──▶ 1회 확인 → trialing 부여
[client] 구독 관리 ──POST /portal──▶ Paddle 고객 포털 세션 URL
[client] useEntitlementSync: entitlements 문서 onSnapshot → premiumUntil이 토큰과 다르면 getIdToken(true)
```

## 데이터 모델

### `entitlements/{uid}` (클라이언트 쓰기 금지 유지 — `allow write: if false`)

| 필드 | 타입 | 상태 | 의미 |
|---|---|---|---|
| `plan` | `"free" \| "premium"` | 기존 | |
| `status` | `"none" \| "trialing" \| "active" \| "past_due" \| "canceled"` | **변경** | `past_due` 추가, `expired` 제거(만료는 저장하지 않고 `premiumUntil`로 판단) |
| `source` | `"manual" \| "trial" \| "paddle" \| null` | **변경** | `trial` 추가, 미사용 `lemonsqueezy`·`stripe` 제거 |
| `premiumUntil` | ISO string \| null | **신규** | 클레임과 같은 시각. 클라이언트 프리미엄 판단의 유일한 기준 |
| `trialUsedAt` | ISO string \| null | **신규** | 값이 있으면 체험 재사용 불가 |
| `cancelAt` | ISO string \| null | **신규** | 예약 해지가 실제로 끝나는 시각(표시용) |
| `currentPeriodEnd` | ISO string \| null | 기존 | Paddle `current_billing_period.ends_at` |
| `customerId` | string \| null | 기존 | Paddle customer id (포털 세션 생성용) |
| `subscriptionId` | string \| null | 기존 | |
| `lastWebhookEventId` | string \| null | 기존 | 중복 판정 |
| `lastEventOccurredAt` | ISO string \| null | **신규** | 역순 판정 |
| `updatedAt` | ISO string | 기존 | |

### 커스텀 클레임

- `premiumUntil: number` (epoch 초). 기존 클레임은 병합해서 보존하고, `premium` 키는 제거한다.
- 판단식(모든 소비처 공통): `premiumUntil > 현재 시각`.
  - `firestore.rules` `calendarIntegrations`: `request.auth.token.premiumUntil is number && request.auth.token.premiumUntil > request.time.toMillis() / 1000`
  - `packages/worker-auth` `VerifiedToken`: `premiumUntil: number | null`과, 검증 시각 기준으로 계산한 `premium: boolean`(= `premiumUntil > now`)을 함께 노출한다. 소비처(ai-proxy·calendar-proxy)는 코드 변경 없이 `premium`만 본다(계획 단계에서 `isPremiumAt` 헬퍼 대신 택함)
  - client `useIsPremium`: 문서의 `premiumUntil > Date.now()`

## 상태 전이

`toEntitlement(event | trialRequest, existing, now)`는 순수 함수로 두고 아래 표를 그대로 구현한다.

| 계기 | status | premiumUntil | 그 외 |
|---|---|---|---|
| `POST /trial` (`trialUsedAt` 없음 && 현재 비프리미엄) | `trialing` | `now + 7일` | `source=trial`, `trialUsedAt=now`. 조건 불충족 시 409 |
| 웹훅 status `active`, 예약 변경 없음 | `active` | `current_billing_period.ends_at + 3일` | `source=paddle`, `customerId`·`subscriptionId`·`currentPeriodEnd` 기록, `cancelAt=null` |
| 웹훅 status `active` + `scheduled_change.action = cancel` | `active` | `scheduled_change.effective_at` (유예 없음) | `cancelAt=effective_at` |
| 웹훅 status `past_due` | `past_due` | `max(기존, ends_at + 3일)` | Paddle 재시도 기간 동안 유지(Paddle 권장) |
| 웹훅 status `canceled` 또는 `paused` | `canceled` | `now` (즉시 회수) | `cancelAt=null`. 예약 해지 실행도 이 이벤트. 일시정지 기능은 켜지 않음 |
| 웹훅 `canceled`/`paused`인데 추적 중인 것과 **다른** `subscriptionId`이고 현재 Paddle 구독이 유효 | — (건너뜀) | — | 이중 구독 의심 경고 로그. 살아 있는 구독의 권한을 지키기 위함 |
| 웹훅 status `trialing` | — | — | Paddle 체험을 쓰지 않으므로 오지 않음. 오면 경고 로그 후 `active`와 동일 처리 |
| `grantEntitlement.ts --plan premium [--until <ISO>]` | `active` | 지정값(기본 2099-12-31) | `source=manual` |
| `grantEntitlement.ts --plan free` | `none` | `null`(클레임 0) | |

`plan`은 `premiumUntil`이 미래면 `premium`, 아니면 `free`로 함께 기록한다(표시용).

## billing-proxy Worker

### 엔드포인트

| 경로 | 인증 | 동작 |
|---|---|---|
| `POST /checkout` | Firebase ID 토큰 | 허용 목록 확인 → Paddle `POST /transactions`(price = env `PADDLE_PRICE_ID`, `custom_data` = `{ uid: 토큰 uid, uid_sig: HMAC(BILLING_UID_SECRET, uid) }`, 기존 `customerId` 있으면 지정). 살아 있는 Paddle 구독이 있으면 409 `ALREADY_SUBSCRIBED` → `{ transactionId }` |
| `POST /trial` | Firebase ID 토큰 | 허용 목록 확인 → 상태 전이표의 체험 규칙 → 클레임·문서 갱신 → `{ premiumUntil }` 또는 409 |
| `POST /portal` | Firebase ID 토큰 | 문서의 `customerId`로 Paddle 고객 포털 세션 생성 → `{ url }`. `customerId` 없으면 404 |
| `POST /webhooks/paddle` | `Paddle-Signature` | 아래 처리 순서 |

요청 본문의 uid·가격·상품은 받지 않는다. CORS는 `@tododo/worker-auth`의 `corsOrigin`을 재사용하고, 웹훅 경로는 CORS 대상이 아니다.

### 웹훅 처리 순서

1. `Paddle-Signature`(`ts=…;h1=…`)를 파싱하고 `ts:원문 body`의 HMAC-SHA256을 `PADDLE_WEBHOOK_SECRET`으로 계산해 타이밍 안전 비교. `ts`가 5분보다 오래됐으면 거부. 실패 시 401.
2. `subscription.created` / `subscription.updated` / `subscription.canceled` 외 이벤트는 200으로 무시.
3. `data.custom_data.uid`가 없거나, `uid_sig`가 `BILLING_UID_SECRET`으로 검증되지 않거나, uid가 허용 목록 밖이면 로그 후 200(재시도해도 해결되지 않음). 날짜 필드를 해석할 수 없는 이벤트도 같은 처리.
4. 문서를 읽어 `event_id == lastWebhookEventId` 이거나 `occurred_at <= lastEventOccurredAt`(마이크로초 정밀도 비교) 이면 200으로 무시. 다른 구독의 해지·일시정지도 무시(상태 전이표). `subscription.*` 본문은 구독 전체 스냅샷이므로 최신 이벤트 하나만 반영하면 정확하다.
5. **클레임을 먼저 쓴다**(Identity Toolkit `accounts:lookup`으로 기존 클레임을 읽어 병합 → `accounts:update`의 `customAttributes`).
6. **문서를 나중에 쓴다**(Firestore REST, 읽은 문서의 `updateTime`을 사전조건으로 걸고 충돌 시 재읽기·재시도, 최대 3회). 재시도 끝에 건너뛰거나 포기할 때 이 호출이 이미 클레임을 썼다면 최신 문서 기준으로 클레임을 다시 맞춘다.
   - 순서 이유: 중복 판정 기준이 문서에 있다. 문서 쓰기가 실패하면 500 → Paddle 재전송 → 클레임 재기록(같은 값, 무해) → 문서 기록. 반대 순서면 문서가 "처리됨"인데 클레임만 실패한 상태가 재전송에서도 무시되어 영구 고착된다.
7. 5·6 중 실패는 500으로 응답해 Paddle 재전송에 맡긴다.

`/trial`도 같은 "클레임 → 문서" 순서와 사전조건을 쓴다.

### 구성 재사용

- `reminder-proxy/src/googleAuth.ts`의 서비스 계정 JWT 서명·토큰 캐시와 `firestore.ts`의 값 인코딩을 재사용한다. 스코프가 다르므로(`datastore` + `identitytoolkit`) 스코프를 인자로 받도록 일반화해 `packages/`로 옮기거나 복제하는 것은 계획 단계에서 정한다.
- 인증은 `@tododo/worker-auth`.

### 환경변수·시크릿

| 이름 | 종류 | 비고 |
|---|---|---|
| `PADDLE_API_KEY` | secret | 샌드박스 API 키 |
| `PADDLE_WEBHOOK_SECRET` | secret | 웹훅 대상의 secret key |
| `GOOGLE_SERVICE_ACCOUNT` | secret | 결제 전용 서비스 계정 JSON |
| `BILLING_UID_SECRET` | secret | `uid_sig` 서명 키(32바이트 이상 무작위). **회전 금지** — 서명이 구독 `custom_data`에 영구 저장되어, 바꾸면 기존 구독의 웹훅이 모두 거부된다 |
| `PADDLE_API_BASE` | var | `https://sandbox-api.paddle.com` → 실결제 시 `https://api.paddle.com` |
| `PADDLE_PRICE_ID` | var | 월간 KRW 가격 id |
| `BILLING_ALLOWED_UIDS` | var | 쉼표 구분 uid 목록. **비어 있거나 없으면 아무도 허용하지 않는다**(설정 누락이 게이트 개방으로 이어지지 않게). 전원 허용은 정확히 `*`일 때만 |
| `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGINS` | var | 기존 Worker와 동일 |

서비스 계정 역할: Cloud Datastore User, Firebase Authentication Admin.

## 클라이언트

### 진입점 (`VITE_BILLING_ENABLED=true`일 때만)

- `PremiumLockedNotice` 3곳(AI 플랜·캘린더 연동·통계)의 CTA를 "프리미엄 알아보기" → `/premium`으로 바꾼다. 플래그가 꺼져 있으면 기존 "관심 있어요"를 유지한다.
- 프로필 메뉴에 "프리미엄" 항목(→ `/premium`)을 추가한다.

### `/premium` 페이지 (보호 라우트)

`{Feature}Container` + `{Feature}Body` 패턴, 360px 대응, 다크모드 토큰 사용.

| 상태(문서 기준) | 표시 | 버튼 |
|---|---|---|
| 비프리미엄, `trialUsedAt` 없음 | 혜택 3개 + 월 가격 | **7일 무료 체험**(주), 바로 구독하기(보조) |
| 비프리미엄, `trialUsedAt` 있음 | 혜택 3개 + 월 가격 | 구독하기 |
| `trialing` | "M월 D일까지 체험 중 (N일 남음)" | 구독하기 |
| `active`, `cancelAt` 없음 | "다음 결제일 M월 D일" | 구독 관리(포털) |
| `active`, `cancelAt` 있음 | "M월 D일까지 이용 가능" | 구독 관리(포털에서 해지 취소) |
| `past_due` | 경고 배너 "결제에 실패했어요. 결제 수단을 확인해 주세요" | 결제 수단 변경(포털) |

월 가격은 클라이언트 상수로 표시한다. 실제 청구 금액은 Worker의 `PADDLE_PRICE_ID`가 결정하고 결제창에 Paddle이 실제 금액을 보여준다.

### 결제 흐름

1. [구독하기] → 버튼 로딩(중복 클릭 방지) → `POST /checkout`.
2. Paddle.js를 이 시점에 동적으로 로드·초기화(`VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_ENV`). 결제하지 않는 사용자의 번들 비용 0.
3. `Paddle.Checkout.open({ transactionId })`.
4. `checkout.completed` → 결제창 닫기 → "결제 확인 중…".
5. 문서가 `active`가 되면 `useClaimSync`가 토큰을 갱신하고 "프리미엄이 시작됐어요" 토스트.
6. 30초 내 미반영 시 "결제는 완료됐어요. 반영까지 잠시 걸릴 수 있어요"로 안내하고 계속 대기(실패 처리 안 함).

### 상태 반영 (전역)

- `useEntitlement`: TanStack Query 1회 조회 → `onSnapshot` 실시간 구독으로 변경(쿼리 캐시에 `setQueryData`로 반영해 기존 소비처 인터페이스 유지).
- `useClaimSync`(앱 루트 1회 마운트): 문서 `premiumUntil`과 현재 ID 토큰 클레임 `premiumUntil`이 다르면 `getIdToken(true)`. 결제·체험·포털 해지·다른 탭/기기 변경을 모두 같은 경로로 처리한다.
- `useIsPremium`: `premiumUntil > now`. 만료 시각이 지나면 화면이 잠기도록 다음 만료 시점에 한 번 재평가 타이머를 건다.

### 오류 처리

| 상황 | 처리 |
|---|---|
| `/checkout`·Paddle.js 로드 실패 | 토스트 "결제창을 열지 못했어요" + Sentry |
| `/trial` 409 | 엔타이틀먼트 재조회 후 "구독하기" 상태로 |
| `/portal` 실패 | 토스트 + Sentry |
| 결제창 닫기 | 원래 상태 유지 |

### 환경변수

`VITE_BILLING_ENABLED`, `VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_ENV`, `VITE_BILLING_PROXY_URL` — `client/.env`, GitHub Secrets, CI build·**deploy job 양쪽**에 추가(Sentry DSN 누락 전례).

## 기존 코드 변경

| 파일 | 변경 |
|---|---|
| `firestore.rules` | `calendarIntegrations` 규칙을 `premiumUntil` 비교로 |
| `packages/worker-auth/src/auth.ts` | `premium` → `premiumUntil`, `isPremiumAt` 헬퍼 |
| `ai-proxy`, `calendar-proxy` | `token.premium` → `isPremiumAt(token, now)` |
| `scripts/grantEntitlement.ts` | `--until` 옵션, 클레임 `premiumUntil`, 새 필드 기록, `premium` 키 제거 |
| `client/src/features/entitlement/**` | 타입, `useEntitlement`, `useIsPremium`, `useClaimSync`, API(`billingProxyApi`), `/premium` 페이지 |
| `client/src/features/{aiPlan,calendarIntegration,insights}` | CTA 플래그 분기 |
| `client/src/layouts/profileMenu` | "프리미엄" 항목 |
| `client/e2e/utils/premium.ts` | 클레임 형태 변경 반영 |
| `.github/workflows/ci.yml` | billing-proxy 테스트·배포 job, 클라이언트 env 추가 |

## 테스트

- **billing-proxy(vitest)**: 서명 검증(정상·변조·오래된 ts) / `toEntitlement` 표 테스트로 상태 전이표 전 행 / 중복·역순 무시 / 클레임 성공 후 문서 쓰기 실패 → 500, 재전송 시 정상 수렴 / uid 없음 → 200 / `/checkout`이 토큰 uid만 사용 / `/trial` 409 / 허용 목록 403(목록 없음·빈 값도 403, `*`만 전원 허용) / `/portal` customerId 없음 404.
- **worker-auth**: `premiumUntil` 과거·미래·없음.
- **client**: `useIsPremium` 경계와 만료 시 재평가 / `useClaimSync`(다를 때만 갱신) / `/premium` 6개 상태 / 결제 흐름(Paddle mock, 완료 대기, 30초 안내) / 플래그 off 시 진입점 숨김·기존 CTA 유지.
- 시간 의존 테스트는 시스템 시간 mock으로 고정하고 절대 날짜를 하드코딩하지 않는다. client는 `VITE_FIREBASE_API_KEY= npx vitest run`으로 CI 등가 검증.
- **firestore.rules**: Rules Playground 수동 확인(`premiumUntil` 과거·미래·없음 × `calendarIntegrations`).
- **수동 E2E(샌드박스)**: `wrangler versions upload` 프리뷰 URL을 샌드박스 웹훅 대상으로 등록. 구독 → 즉시 열림 → 포털 해지(예약) → 이용 기한 표시 → 해지 취소 → (별도 계정) 체험 → 체험 중 구독. `past_due`·즉시 해지는 Paddle 웹훅 시뮬레이터. 360px 레이아웃 확인.

## 배포 순서

1. 사용자 사전 작업: Paddle 샌드박스 계정·상품·월간 KRW 가격·클라이언트 토큰·API 키·웹훅 대상(`subscription.created/updated/canceled`) / GCP 결제 전용 서비스 계정 + 역할 2개 / `wrangler secret put`은 사용자 터미널에서 실행.
2. billing-proxy 첫 수동 배포로 동작 확인 → CI 자동 배포 연결.
3. develop → main 릴리스: rules·ai-proxy·calendar-proxy·client가 함께 배포된다.
4. 즉시 `grant:entitlement --uid <본인> --plan premium`으로 본인 클레임을 새 형식으로 재부여(3~4 사이 수 분간 본인만 잠김 — 현재 프리미엄 사용자가 본인뿐이라 이중 클레임 과도기 코드는 두지 않는다).
5. 운영에서 허용 목록 계정으로 샌드박스 결제 1회 확인.

## 실결제 전환 시 (이번 스코프 밖, 체크리스트로만 기록)

Paddle 운영 계정 승인(도메인 심사: 공개 요금제·이용약관·환불 정책 페이지 필요) → `PADDLE_API_BASE`·키·가격 id·클라이언트 토큰 교체 → `BILLING_ALLOWED_UIDS=*` → `VITE_BILLING_ENABLED=true` 운영 빌드 → CI deploy job `VITE_PADDLE_ENV=production`. 전환 전 코드 보강: 웹훅의 `price_id` 확인, 다른 구독의 `past_due` 처리 결정(`billing-proxy/README.md` 참고). 정산 계좌·사업자 요건은 그 시점에 Paddle 문서로 확인.

## 스코프 밖

- 연간 요금제, 쿠폰·할인, 플랜 변경
- 모바일(RN) 앱 결제(인앱결제). 나중에 붙여도 같은 `entitlements` 문서·`premiumUntil` 클레임에 `source`만 달리 써서 통합한다(밀리의서재·왓챠식 "채널 여러 개, 권한 하나")
- 공개 요금제·약관·환불 페이지
- 정기 대사(reconciliation) 작업 — Paddle 재전송으로 충분하다고 보고, 어긋남이 관측되면 추가
- 영수증·결제 내역 화면(Paddle 포털이 제공)

## 계획 단계에서 실측으로 확인할 것

- 거래의 `custom_data`(`uid`·`uid_sig`)가 그 거래로 생성된 구독 객체와 `subscription.*` 웹훅에 그대로 들어오는지 — `uid_sig`가 빠지면 모든 웹훅이 거부된다.
- `Paddle.Checkout.open({ transactionId, customData })`로 서버 거래의 `custom_data`를 덮어쓸 수 있는지(덮어써도 `uid_sig` 검증으로 막히는지 확인).
- (기존) 거래의 `custom_data`가 그 거래로 생성된 구독 객체에 복사되는지. 복사되지 않으면 `transaction.completed`에서 `subscriptionId → uid` 매핑을 저장해야 한다.
- `past_due` 시 `current_billing_period`가 다음 기간으로 넘어가 있는지.
- Paddle 샌드박스에서 KRW 가격과 국내 결제수단(카카오페이·네이버페이)이 노출되는지.
- Paddle 웹훅 재전송 시 `ts`가 새로 서명되는지(5분 허용 오차와의 호환).

### 실측 결과 (2026-10-08, 샌드박스 + 배포된 billing-proxy, 테스트 계정)

- ✅ `custom_data`(`uid`·`uid_sig`)가 구독과 `subscription.*` 웹훅에 그대로 온다 — 실제 웹훅이 서명 검증을 통과해 문서·클레임이 반영됐다(첫 항목·셋째 항목 해소, `transaction.completed` 매핑 불필요).
- ✅ KRW ₩4,900 표시, 국내 결제수단 노출(샌드박스에서는 Paddle 테스트 승인 페이지로 연결).
- ✅ 결제 → `active`(`premiumUntil` = 기간 끝 + 3일), 포털 예약 해지 → `cancelAt` 설정·`premiumUntil` = 기간 끝(유예 없음), 대시보드 즉시 해지 → `canceled`·`premiumUntil` = 해지 시각. 각 웹훅은 수 초~12초 안에 도착.
- ⏸ `past_due`의 `current_billing_period`: 샌드박스 대시보드로 실제 갱신 실패를 만들 수 없고 시뮬레이터 페이로드에는 `uid_sig`가 없어 측정 불가 — 로컬 서명 가짜 웹훅 검증으로 갈음.
- ⏸ `Checkout.open`의 `customData` 덮어쓰기, 재전송 `ts` 재서명: 미측정. 덮어써도 `uid_sig` 검증이 막고, `ts`는 Paddle이 재전송마다 새로 서명하는 것으로 문서화돼 있다(실결제 전환 전 재확인 후보).
- 함정: 로컬 가짜 웹훅이 남긴 `customerId: "ctm_local_test"`가 있으면 `/checkout`이 그 id로 거래를 만들어 Paddle `400 bad_request`가 난다 — 샌드박스 결제 전에 테스트 계정 문서의 `customerId`·`subscriptionId`를 비운다.

## 알고 감수한 한계

- 정기 갱신은 `기간 끝 + 3일` 유예가 있어, 웹훅이 3일 넘게 실패하면 정상 구독자도 잠길 수 있다(Paddle 재전송·Cloudflare Worker 로그로 대응 — billing-proxy에는 Sentry가 없다).
- 즉시 회수(`canceled`) 후에도 이미 발급된 ID 토큰의 `premiumUntil`은 남아 있지만, 웹훅이 클레임을 `now`로 바꾸고 클라이언트 `useClaimSync`가 토큰을 갱신한다. 클라이언트가 꺼져 있는 공격자는 기존 토큰 만료(최대 1시간)까지 서버 접근이 가능하다.
- 클라이언트 표시 가격은 상수라 Paddle 가격 변경 시 함께 바꿔야 한다.
