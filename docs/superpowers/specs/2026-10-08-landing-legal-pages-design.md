# 랜딩 요금제 섹션 + 법적 페이지(약관·개인정보·환불) 설계

- 날짜: 2026-10-08
- 브랜치: `feat/landing-legal-pages`
- 선행: 프리미엄 결제/구독(`2026-10-04-premium-billing-paddle-design.md`, PR #141·#142 운영 배포)

## 목적

목표는 실서비스(실결제)다. 실결제로 넘어가려면 Paddle 운영 계정의 **도메인 심사**를 통과해야 하는데,
지금 사이트는 심사 요건을 채우지 못한다.

- 비로그인 랜딩(`/`)에 프리미엄·가격 정보가 없다. 가격은 로그인해야 보이는 `/premium`에만 있다.
- 이용약관·개인정보처리방침·환불 정책 페이지가 코드 어디에도 없다.

이번 작업은 **심사 통과에 필요한 최소 범위**를 만든다. 심사는 며칠 이상 걸리는 외부 대기라서,
최소 범위로 먼저 신청하고 랜딩 전면 개편은 그동안 따로 진행할 수 있게 한다.
개인정보처리방침은 이미 개인정보(이메일 등)를 받고 있어 국내법상으로도 원래 공개해야 하는 문서다.

**성공 기준**

- 로그인하지 않은 방문자가 `/`에서 제품 설명·무료/프리미엄 기능·가격(월 4,900원, 부가세 포함)을 볼 수 있다.
- 이용약관·개인정보처리방침·환불 정책을 모든 화면의 푸터에서 열 수 있고, 로그인 여부와 무관하게 열린다.
- 이용약관에 판매자 표기와 "Paddle이 판매 주체(Merchant of Record)"라는 문구가 있다.
- 판매자 표기가 비어 있으면 화면에서 빠진 것이 바로 보인다.

## Paddle 심사 요건 (조사 결과, 10-08)

출처: Paddle 도움말 「What is domain approval」「Why has my domain been rejected」, Paddle 개발자 문서(seller policies).

- 로그인 없이 볼 수 있는 HTTPS 사이트에 제품 설명, 가격(또는 가격 페이지), 주요 기능
- 이용약관·환불 정책·개인정보처리방침을 사이트 내비게이션에서 쉽게 찾을 수 있을 것
- 약관에 판매자 이름(개인사업자는 브랜드, 가능하면 법적 이름). 약관과 개인정보처리방침의 이름이 정확히 일치해야 함
- 약관에 Paddle이 판매 주체(MoR)임을 명시. 환불 불가 정책은 거절 가능성이 높고, 환불 기간은 보통 14~90일
- 흔한 거절 사유: 로그인 벽, 가격 누락, 약관에 MoR 언급 없음
- `web.app` 같은 무료 서브도메인을 거절한다는 규정은 공식 문서에 없음 → 현재 주소로 먼저 신청하고, 거절되면 도메인을 구매한다

## 확정된 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 범위 | 심사용 최소: 랜딩에 요금제 섹션 추가 + 법적 페이지 3개 + 푸터 링크, 기존 문구만 최신화 | 심사가 외부 대기라 먼저 신청하는 게 이득 |
| 판매자 표기 | 미정. `legal/config.ts` 변수로 두고 심사 전에 채움 | 개인/개인사업자 가입 방식 미정 |
| 환불 정책 | 첫 결제·갱신 결제 모두 결제 후 14일 이내 전액 환불. 이후 환불 없음, 해지 시 기간 끝까지 이용 | 카드 없는 7일 체험이 이미 있어 최소 기준이면 충분, 국내 청약철회 7일도 충족 |
| 렌더링 | React lazy 라우트 (정적 HTML·사전 렌더링 아님) | 테마·다크모드·푸터·가격 상수를 재사용. 심사는 사람이 브라우저로 확인. 문제가 생기면 해당 페이지만 사전 렌더링으로 교체 |
| 가격 섹션 노출 | `BILLING_ENABLED`와 무관하게 항상 노출 | 심사 기간에도 가격이 보여야 함. 버튼이 결제로 이어지지 않아 실결제 전 노출해도 안전 |
| 회원 탈퇴 | 이번 범위 밖. 방침에 "이메일 요청 시 삭제"로 적음 | 별도 할 일로 기록. 스토어 심사 전 필수(Apple 5.1.1(v)) |

## 구조

```
client/src/
├─ router.tsx                        + /terms, /privacy, /refund (lazy, ProtectedRoute 밖)
├─ features/legal/                   새 feature
│  ├─ pages/legalPage.tsx            문서 하나를 받아 헤더·본문·푸터 레이아웃으로 렌더
│  ├─ content/terms.ts               문서 본문 (섹션 배열)
│  ├─ content/privacy.ts
│  ├─ content/refund.ts
│  └─ config.ts                      판매자 표기·시행일·연락처·보호책임자 (지금은 빈 값)
├─ features/billing/config.ts        PREMIUM_BENEFITS를 premiumPage에서 옮겨 공유
├─ features/landing/
│  ├─ components/pricingSection.tsx  새 요금제 섹션 (#pricing)
│  ├─ components/landingHeader.tsx   + "요금제" 앵커 링크
│  └─ components/featureGrid.tsx     + 마감 알림 카드
├─ layouts/footer/footer.tsx         + 이용약관 · 개인정보처리방침 · 환불 정책 링크
└─ layouts/snb/mobileDrawer.tsx      + 같은 링크(로그인한 모바일 화면은 푸터 대신 하단 탭바라서)
```

- **`features/legal`을 독립 feature로 둔 이유**: 랜딩 푸터·앱 셸 푸터·결제 화면·추후 모바일 앱이 모두 이 페이지를
  가리킨다. 랜딩 안에 두면 다른 기능이 `features/landing`에 의존하게 된다.
- **본문은 데이터, 페이지는 하나**: 세 문서가 "제목 → 조항 목록" 형식으로 같다. 문서를 고칠 때 JSX를 건드리지 않는다.
- **판매자 표기 변수**: `legal/config.ts` 한 곳에 모은다. 값이 비어 있으면 본문에 `[판매자명 미정]` 같은 표시가 그대로 보여
  빠뜨린 것을 알 수 있다. 본문은 이 값을 치환해 쓰므로 약관과 방침의 이름이 항상 일치한다.
- **`PREMIUM_BENEFITS` 공유**: 랜딩과 `/premium`이 같은 혜택 목록을 보여준다. `billing/config.ts`는 환경변수 상수뿐이라
  랜딩에서 import해도 Paddle SDK·Firestore가 딸려오지 않는다(아이콘은 lucide-react, 랜딩이 이미 사용 중).
- **푸터**: 랜딩·게스트·앱 셸(`App.tsx`)이 같은 `Footer`를 쓰므로 한 곳에서 모든 화면에 링크가 생긴다.
  법적 페이지 자체도 이 푸터를 쓴다. 외부 링크가 아니므로 `react-router`의 `Link`를 쓴다.
- **라우트 위치**: `/terms` 등은 `RootGate`(`/` 전용)와 `ProtectedRoute` 어느 쪽에도 속하지 않는 최상위 라우트로 둔다.
  로그인한 사용자도 리다이렉트 없이 볼 수 있다.

## 랜딩 변경

```
[헤더]   로고 ToDoDo                     요금제  로그인 →
[히어로] 제목 유지 / 부제 최신화
[기능]   Today · 칸반 · 캘린더 · 마감 알림(신규)     ← 무료 기능만, 기존 배지 유지
[요금제] #pricing
   무료 카드: 0원 / Today·목록·칸반·캘린더·반복·마감 알림 / [무료로 시작하기]
   프리미엄 카드: 월 4,900원(부가세 포함) / PREMIUM_BENEFITS / [7일 무료 체험 시작하기]
                  카드 등록 없이 · 계정당 1회
   언제든 해지 가능 · 결제 후 14일 이내 전액 환불(환불 정책 링크)
   결제는 Paddle이 처리합니다
[게스트 체험 안내] 유지
[푸터]   + 법적 페이지 링크
```

- 두 버튼 모두 `/login`으로 간다. 로그인 후 `/premium` 자동 이동은 리다이렉트 처리가 필요해 범위 밖.
- 모바일에서는 요금제 카드를 세로로 쌓는다.
- 부제 등 정확한 문구는 구현 시 UX 카피 단계에서 다듬는다.

## 법적 문서 목차

문장 초안은 구현 단계에서 작성하고, **사용자가 공개 전에 직접 검토**한다(법률 자문 아님).
개인정보처리방침은 개인정보보호위원회 「개인정보 처리방침 작성지침」과 대조한다.

### 이용약관 `/terms`

1. 서비스 소개와 운영자(판매자 표기 변수)
2. 가입과 계정: 구글 로그인, 만 14세 미만 가입 제한
3. 무료 서비스와 프리미엄 서비스의 범위
4. 결제: **Paddle이 판매 주체(Merchant of Record)로서 결제·청구·세금을 처리**
5. 구독과 갱신: 월 자동 갱신, 구독 관리 화면에서 해지, 해지해도 결제 기간 끝까지 이용
6. 7일 무료 체험: 카드 없이 계정당 1회, 종료 시 자동으로 무료 전환
7. 환불: 환불 정책 페이지로 연결
8. 금지 행위, 서비스 변경·중단, 책임 제한, 약관 변경 공지, 준거법(대한민국)

### 환불 정책 `/refund`

- 첫 결제와 갱신 결제 모두 결제 후 14일 이내 전액 환불
- 14일 이후 환불 불가, 해지 시 해당 기간 끝까지 이용 가능
- 요청 방법: 이메일(연락처 변수) 또는 Paddle 영수증 메일의 링크
- 환불되면 프리미엄이 즉시 해제됨

운영 절차: 운영자가 Paddle 대시보드에서 환불하고 구독을 즉시 해지한다. 즉시 해지 → 웹훅 → 권한 회수 경로는
결제 Task 11 실측에서 확인했으므로 코드 변경은 없다.

### 개인정보처리방침 `/privacy`

수집 항목(10-08 코드 전수 검색으로 확인 — client·mobile·Worker 4개·packages):

| 항목 | 저장·전송 위치 | 목적 | 근거 |
|---|---|---|---|
| 이메일·이름·프로필 사진(구글 로그인) | Firebase Auth | 계정, 화면 표시 | `header.tsx`·`mobileDrawer.tsx`에서 이름·사진 표시 |
| 할 일(제목·설명·일정·반복·알림 설정) | Firestore `todos` | 서비스 제공 | |
| 알림 기본값 | Firestore `userSettings` | 알림 설정 | `reminderDefaultOffsetMinutes` 하나뿐 |
| 의견 내용·이메일·uid·작성 시각 | Firestore `feedback` | 문의 응대 | `feedbackApi.ts` |
| 구독 상태·Paddle 고객/구독 id·체험 사용 시각·결제 기간 | Firestore `entitlements` | 프리미엄 권한 | 카드 정보는 받지 않음 |
| 캘린더 연동 여부·연결 시각 | Firestore `calendarIntegrations` | 연동 상태 | |
| 구글 캘린더 refresh token | Cloudflare KV (calendar-proxy) | 캘린더 동기화 | `tokenStore.ts` |
| 할 일 제목·일정 → **사용자 본인의 구글 캘린더** | Google Calendar API | 캘린더 동기화 | `googleCalendar.ts` `summary: todo.title` |
| 알림 기기 토큰·알림 일정·**발송 기록(할 일 제목, 7일)** | Cloudflare Durable Object (reminder-proxy) | 마감 알림 | `store.ts` history 테이블 |
| 알림 내용(할 일 제목) | Google FCM으로 전송 | 푸시 발송 | `fcm.ts` |
| AI 요청: 목표 문장·오늘 날짜·마감일 | Anthropic(Claude)으로 전송 | AI 할 일 플랜 | `prompt.ts` |
| AI 일일 사용 횟수(uid별) | Cloudflare KV (ai-proxy) | 하루 20회 제한 | `usage.ts` |
| 오류 정보: uid·브라우저/OS·페이지 URL(쿼리 제거)·에러 스택 | Sentry | 오류 수정 | `sentry.ts` 허용 목록, 이메일·입력값 제외 |
| 접속 기록(IP 등) | Firebase Hosting·Cloudflare Workers 자동 기록 | 운영·보안 | 서비스 제공자가 자동 수집 |

결제 정보(카드·청구지·결제 이메일)는 **Paddle이 판매 주체로서 직접 수집**하고 우리는 받지 않는다.
방침에는 "결제는 Paddle이 처리하며 Paddle의 개인정보처리방침이 적용된다"로 안내한다.
이것을 처리 위탁으로 볼지 제3자 제공으로 볼지는 작성지침 대조 단계에서 판단한다.

수집하지 않는 것(확인됨): Google Analytics(설정값 `measurementId`만 있고 호출 0건 — 켜면 방침 갱신 필요),
게스트 모드 데이터(`useGuestTodos`가 메모리 상태만 사용, 저장 안 함), 모바일 앱 푸시 토큰(모바일은 로컬 알림만 사용).

브라우저 저장소(localStorage): `tododo:theme`(테마), `calendarSyncSnapshot:{uid}`(캘린더 동기화 대상 id·수정 시각),
`tododo:reminderPromptSnoozedUntil`(알림 권유 미루기), `tododo:pushReleasePending`(푸시 해제 재시도).

심사 전 확인할 것: Sentry 프로젝트 설정의 "IP 주소 저장 안 함(Prevent Storing of IP Addresses)" 여부.
클라이언트는 IP를 보내지 않지만 Sentry 서버가 접속 IP를 기록할 수 있어, 켜져 있지 않으면 방침의 Sentry 항목에 IP를 넣는다.

그 밖의 조항: 처리 위탁·국외 이전 표(Google(Firebase·FCM)·Cloudflare·Anthropic·Sentry의 국가·항목·목적·보유 기간, Paddle 안내),
보유 기간과 파기, 이용자 권리(열람·정정·삭제 — 삭제는 이메일 요청), 보호책임자(변수),
브라우저 저장소(테마, 캘린더 동기화 스냅샷 등).

## 테스트와 검증

**유닛 테스트 (Vitest, `VITE_FIREBASE_API_KEY= npx vitest run`으로 CI 등가 확인)**

- `legalPage`: 경로별 문서 렌더, `legal/config.ts`가 비면 미정 표시가 나옴
- `pricingSection`: 가격·혜택이 `billing/config.ts` 값을 따름, 두 버튼이 `/login`으로 이동, 환불 정책 링크 존재
- `footer`: 법적 페이지 링크 3개
- 라우터: `/terms`·`/privacy`·`/refund`가 로그인·비로그인 모두에서 열림(리다이렉트 없음)
- `premiumPage`: 혜택 목록을 공유 상수로 옮긴 뒤에도 기존 테스트 통과

**번들**: 빌드 결과물에서 랜딩·법적 페이지 청크가 Firestore·Paddle SDK를 포함하지 않는지 확인.

**브라우저 실측**: 데스크톱·모바일(390px) × 라이트·다크에서 요금제 섹션과 법적 페이지 3개.
로그아웃 상태에서 주소창에 `/terms`를 직접 입력해 열리는지(심사자 경로).

## 심사 직전 체크리스트 (사용자 진행, 구현 범위 밖)

1. `legal/config.ts`의 판매자 표기·시행일·연락처·보호책임자 채우기
2. 개인정보 처리방침 작성지침과 대조 검토
3. main 릴리스
4. Paddle 운영 계정 생성·도메인 심사 신청

## 범위 밖

- 랜딩 전면 개편(스크린샷·히어로 재디자인)
- 로그인 후 `/premium` 자동 이동
- 법적 페이지 사전 렌더링(심사에서 문제가 될 때만)
- 회원 탈퇴 기능(스토어 심사 전 별도 작업)
- 실결제 전환(운영 시크릿·가격 id·`VITE_PADDLE_ENV`·`VITE_BILLING_ENABLED`·허용 목록 교체)
- 모바일 앱의 법적 페이지 링크
