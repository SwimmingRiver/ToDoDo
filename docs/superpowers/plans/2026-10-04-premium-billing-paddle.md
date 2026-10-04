# 프리미엄 결제/구독 (Paddle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 Paddle(샌드박스)로 월간 구독을 결제하거나 7일 무료 체험을 시작하면, `premiumUntil` 커스텀 클레임과 `entitlements/{uid}` 문서가 자동으로 갱신되어 클라이언트·rules·Worker 모두에서 프리미엄이 열리고, 만료 시각이 지나면 스케줄러 없이 자동으로 잠긴다.

**Architecture:** 신규 Cloudflare Worker `billing-proxy`가 결제창용 거래 생성(`/checkout`)·체험(`/trial`)·고객 포털(`/portal`)·Paddle 웹훅(`/webhooks/paddle`)을 맡는다. 웹훅은 서명 검증 → 중복/역순 무시 → **클레임 먼저, 문서 나중**(Firestore `updateTime` 사전조건) 순서로 반영한다. 권한 판단은 모든 곳에서 `premiumUntil > now` 하나로 통일하고, 클라이언트는 문서를 `onSnapshot`으로 구독하다 클레임과 다르면 ID 토큰을 강제 갱신한다.

**Tech Stack:** Cloudflare Workers(TypeScript, vitest 2), Firestore REST + Identity Toolkit REST(서비스 계정 JWT), Paddle Billing API + Paddle.js v2, React 19 + TanStack Query + styled-components(client), Firebase Auth/Firestore SDK.

**Spec:** `docs/superpowers/specs/2026-10-04-premium-billing-paddle-design.md`

## Global Constraints

- 커밋 훅(husky/lint-staged)을 **절대 우회하지 않는다**. `--no-verify`, `HUSKY=0` 등 금지. 훅이 실패하면 원인을 고친다.
- 커밋 메시지는 한국어 conventional commit(`feat(billing): …`)이며 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 줄을 붙인다.
- 클레임 이름은 정확히 `premiumUntil`(epoch **초**, 정수). 기존 `premium` 키는 쓸 때 제거한다.
- 문서의 `premiumUntil`·`trialUsedAt`·`cancelAt`·`currentPeriodEnd`·`lastEventOccurredAt`·`updatedAt`은 ISO 문자열(`toISOString()`) 또는 `null`.
- 프리미엄 판단식은 어디서나 `premiumUntil > 현재 시각`. 같은 순간은 프리미엄이 아니다.
- 갱신 유예 `RENEWAL_GRACE_MS = 3일`, 체험 길이 `TRIAL_MS = 7일`.
- `BILLING_ALLOWED_UIDS`: 비어 있거나 없으면 **아무도 허용하지 않음**, 정확히 `*`일 때만 전원 허용, 그 외는 쉼표 구분 uid 목록.
- Worker의 Google API 접근은 전역 `fetch`를 그대로 기본값으로 담지 말고 `(input, init) => fetch(input, init)`로 감싼다(Workers "Illegal invocation").
- 시간 의존 테스트: Worker 순수 함수는 `now`를 인자로 주입한다. 클라이언트 훅은 `vi.useFakeTimers()` + `vi.setSystemTime()`으로 고정한다. 실제 현재 시각에 의존하는 단언을 쓰지 않는다.
- client 테스트는 마지막에 `VITE_FIREBASE_API_KEY= npx vitest run`으로 CI 등가 검증한다.
- 날짜 표시는 로컬 게터(`getMonth()`/`getDate()`)로 한다. ISO 문자열을 `split("T")`로 자르지 않는다.
- Paddle.js는 결제 시점에만 동적으로 로드한다(초기 번들 비용 0). `npm run check:bundle` 예산을 지킨다.
- 디자인 토큰은 `colors.brand.strong`(흰 글자 얹는 버튼 배경), `colors.danger.*`, `colors.text.*`, `colors.background.*`, `colors.border.*`, `radius.*`만 쓰고 hex를 하드코딩하지 않는다.
- `server/`, `docker-compose.yml`은 수정하지 않는다.

## Review Focus

1. **기존 프리미엄 데이터가 새 판단식에서 잠김** — `premium:true` 클레임만 있고 `premiumUntil`이 없는 토큰, `premiumUntil` 없이 시드되는 E2E 엔타이틀먼트 문서는 모두 비프리미엄으로 판정된다. worker-auth(Task 1)와 E2E 시드(Task 7)에서 테스트로 고정하고, 배포 체크리스트(Task 12)에서 본인 계정을 다시 부여한다.
2. **삭제된 사용자의 uid로 웹훅이 옴** — Identity Toolkit lookup이 빈 결과를 주면 500을 내 영원히 재전송받지 말고 200으로 끝낸다(Task 5).
3. **문서가 아직 없는 첫 결제** — `updateTime`이 없으므로 `currentDocument.exists=false` 사전조건으로 써야 하며, 그 사이 다른 요청이 문서를 만들면 충돌 → 재시도로 수렴해야 한다(Task 3 store, Task 4 commit).
4. **구독하기 연타 / 두 탭에서 체험 동시 클릭** — `/checkout`은 한 번만 호출되어야 하고(Task 9), 체험은 두 번째가 409가 되어야 한다(Task 4 commit 재시도 테스트).
5. **자정 근처의 결제일 표시** — `currentPeriodEnd = …T15:30:00Z`는 KST에서 다음 날이다. `formatMonthDay`는 로컬 게터를 쓰고 CI의 두 타임존(Asia/Seoul, America/New_York)에서 모두 통과해야 한다(Task 10).

---

## File Structure

**신규 Worker `billing-proxy/`**

| 파일 | 책임 |
|---|---|
| `package.json`, `tsconfig.json`, `wrangler.toml`, `README.md` | 다른 Worker와 같은 골격, 배포 준비 문서 |
| `src/env.ts` | `Env` 타입 |
| `src/entitlement.ts` | 엔타이틀먼트 문서 타입·상태 전이 순수 함수(`applySubscriptionEvent`, `applyTrial`, `isStaleEvent`, `toClaimSeconds`, `isPremiumAt`) |
| `src/paddleEvent.ts` | 웹훅 JSON → `PaddleSubscriptionEvent` 파싱 |
| `src/signature.ts` | `Paddle-Signature` 검증 |
| `src/allowlist.ts` | `BILLING_ALLOWED_UIDS` 판정 |
| `src/googleAuth.ts` | 서비스 계정 JWT → 액세스 토큰(reminder-proxy 복제, 스코프만 다름) |
| `src/entitlementStore.ts` | Firestore REST로 `entitlements/{uid}` 읽기/사전조건 쓰기 |
| `src/claims.ts` | Identity Toolkit REST로 `premiumUntil` 클레임 병합 쓰기 |
| `src/commit.ts` | "읽기 → 결정 → 클레임 → 문서(사전조건) → 충돌 시 재시도" 공통 루틴 |
| `src/paddle.ts` | Paddle API(거래 생성, 포털 세션) |
| `src/handlers/webhook.ts` | `/webhooks/paddle` |
| `src/handlers/account.ts` | `/checkout`, `/trial`, `/portal` |
| `src/router.ts` | CORS·인증·허용 목록·라우팅·500 처리 |
| `src/index.ts` | 의존성 조립 + export default |

**기존 변경**

| 파일 | 변경 |
|---|---|
| `packages/worker-auth/src/auth.ts` | `VerifiedToken`에 `premiumUntil` 추가, `premium`은 `premiumUntil > now`로 계산 (ai-proxy·calendar-proxy는 `premium`만 읽으므로 코드 변경 불필요) |
| `firestore.rules` | `calendarIntegrations` 규칙을 `premiumUntil` 비교로 |
| `scripts/grantEntitlement.ts` | `--until`, 새 필드, 클레임 `premiumUntil` |
| `.github/workflows/ci.yml` | `billing-proxy` job·경로 필터, deploy job에 클라이언트 env 3개 |
| `client/src/features/entitlement/**` | 타입, API(`subscribeEntitlement`), `useEntitlement`, `useIsPremium`, `useEntitlementSync`, `usePremiumCta` |
| `client/src/features/billing/**` (신규) | config, API, Paddle 로더, 화면 상태 계산, 결제·체험·포털 훅, `/premium` 페이지 |
| `client/src/App.tsx`, `client/src/router.tsx` | 동기화 훅 마운트, `/premium` 라우트 |
| `client/src/features/{aiPlan,calendarIntegration,insights}` | CTA를 `usePremiumCta`로 |
| `client/src/layouts/profileMenu/profileMenu.tsx` | "프리미엄" 항목(플래그 on일 때만) |
| `client/e2e/utils/premium.ts` | 시드에 `premiumUntil` 추가 |
| `client/.env.example`, `client/CLAUDE.md` | 환경변수·데이터 모델 설명 |

**스펙과 다르게 정한 점(의도적):**
- 스펙의 `isPremiumAt(token, nowSec)` 헬퍼 대신 worker-auth가 `premium` 불리언을 **계산해서** 그대로 노출한다. ai-proxy·calendar-proxy와 그 테스트를 한 줄도 바꾸지 않아도 되고, 판단식이 한 곳(worker-auth)에만 존재한다.
- 스펙의 "uid 없음 → Sentry"는 Worker에 Sentry가 없으므로 `console.error`(Cloudflare 로그)로 한다.
- `/premium` 라우트는 플래그와 무관하게 등록하고 **진입점만** 플래그로 숨긴다. 그래야 운영에서 허용 목록 계정이 URL로 직접 들어가 샌드박스 결제를 확인할 수 있다. 허용 목록 밖 사용자가 URL로 들어와 버튼을 누르면 403 → "아직 준비 중이에요" 안내.
- 스펙의 `useClaimSync`는 문서 구독(캐시 반영)과 클레임 비교를 한 리스너에서 하므로 `useEntitlementSync`라는 이름으로 합쳤다. `useEntitlement`는 1회 조회 쿼리를 유지하고 이 훅이 캐시를 최신으로 밀어 넣는다(소비처 인터페이스 불변).
- `/checkout`은 이미 Paddle 구독이 살아 있으면(`source=paddle`, 프리미엄, `status != canceled`) 409 `ALREADY_SUBSCRIBED`로 이중 구독을 막는다.

---

### Task 1: worker-auth가 `premiumUntil` 클레임으로 프리미엄을 판단

**Files:**
- Modify: `packages/worker-auth/src/auth.ts`
- Test: `packages/worker-auth/src/__tests__/auth.test.ts:128-158` (기존 `premium` 클레임 테스트 4개 교체)
- Modify: `ai-proxy/README.md:25`, `ai-proxy/src/handlers/plan.ts:25` (주석의 클레임 이름만)
- Modify: `ai-proxy/src/__tests__/plan.test.ts`, `calendar-proxy/src/__tests__/{disconnect,events,oauthStart,syncTodos}.test.ts` (mock 반환값에 `premiumUntil: null` 추가 — 두 Worker의 tsconfig가 `src` 전체를 포함하므로 테스트도 타입 검사 대상이다)

**Interfaces:**
- Produces: `VerifiedToken { uid: string; premium: boolean; premiumUntil: number | null }`. `premium === (premiumUntil !== null && premiumUntil > Date.now() / 1000)`.

- [ ] **Step 1: 기존 premium 클레임 테스트 4개(128~158행)를 아래로 교체**

```ts
  it("premiumUntil이 미래면 premium:true와 그 값을 반환한다", async () => {
    const until = Math.floor(Date.now() / 1000) + 3600;
    const { token, jwk } = await makeSignedToken({ premiumUntil: until });
    stubJwksFetch(jwk);

    const result = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    expect(result).toEqual({ uid: "user-123", premium: true, premiumUntil: until });
  });

  it("premiumUntil이 과거면 premium:false다", async () => {
    const until = Math.floor(Date.now() / 1000) - 60;
    const { token, jwk } = await makeSignedToken({ premiumUntil: until });
    stubJwksFetch(jwk);

    const result = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    expect(result.premium).toBe(false);
    expect(result.premiumUntil).toBe(until);
  });

  it("premiumUntil 클레임이 없으면 premium:false, premiumUntil:null이다", async () => {
    const { token, jwk } = await makeSignedToken();
    stubJwksFetch(jwk);

    const result = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    expect(result.premium).toBe(false);
    expect(result.premiumUntil).toBeNull();
  });

  it("예전 premium:true 클레임만 있으면 더 이상 프리미엄이 아니다", async () => {
    const { token, jwk } = await makeSignedToken({ premium: true });
    stubJwksFetch(jwk);

    const result = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    expect(result.premium).toBe(false);
  });

  it("premiumUntil이 숫자가 아니면 null로 취급한다", async () => {
    const { token, jwk } = await makeSignedToken({ premiumUntil: "9999999999" });
    stubJwksFetch(jwk);

    const result = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    expect(result.premium).toBe(false);
    expect(result.premiumUntil).toBeNull();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd packages/worker-auth && npm test`
Expected: 새 테스트 중 "premiumUntil이 미래면"이 FAIL(`premiumUntil` 키 없음), "예전 premium:true"가 FAIL(true 반환).

- [ ] **Step 3: 구현** — `auth.ts`에서 `VerifiedToken`과 payload 타입, return문을 바꾼다.

```ts
export interface VerifiedToken {
  uid: string;
  /** premiumUntil > 검증 시각. 소비처(ai-proxy, calendar-proxy)는 이 값만 본다. */
  premium: boolean;
  /** 커스텀 클레임 premiumUntil(epoch 초). 없거나 숫자가 아니면 null. */
  premiumUntil: number | null;
}
```

payload 타입의 `premium?: boolean;`을 `premiumUntil?: unknown;`으로 바꾸고, 마지막 return을 교체:

```ts
  // 만료 시각만 비교하므로 체험 종료·해지 후 기간 만료 시 별도 회수 작업이 필요 없다.
  // 예전 형식(premium: true)은 의도적으로 무시한다 — 배포 직후 grant:entitlement로 재부여.
  const premiumUntil =
    typeof payload.premiumUntil === "number" && Number.isFinite(payload.premiumUntil)
      ? payload.premiumUntil
      : null;
  return {
    uid: payload.sub,
    premium: premiumUntil !== null && premiumUntil > Date.now() / 1000,
    premiumUntil,
  };
```

`ai-proxy/README.md:25`의 "`premium` 커스텀 클레임"을 "`premiumUntil` 커스텀 클레임"으로, `ai-proxy/src/handlers/plan.ts:25` 주석의 "premium 클레임"을 "premiumUntil 클레임"으로 고친다.

- [ ] **Step 4: 통과 확인 + 소비처 회귀 확인**

Run: `cd packages/worker-auth && npm test && npm run typecheck`
Expected: PASS
소비처 테스트의 mock 반환값에 새 필드를 넣는다(`VerifiedToken`이 필수 필드를 갖게 되어 typecheck가 실패하기 때문):

Run: `cd /Users/river/tododo && perl -pi -e 's/premium: (true|false) \}/premium: $1, premiumUntil: null }/g' ai-proxy/src/__tests__/plan.test.ts calendar-proxy/src/__tests__/disconnect.test.ts calendar-proxy/src/__tests__/events.test.ts calendar-proxy/src/__tests__/oauthStart.test.ts calendar-proxy/src/__tests__/syncTodos.test.ts && git grep -n "premium: \(true\|false\) }" -- ai-proxy calendar-proxy`
Expected: 마지막 grep 출력 없음(전부 치환됨)

Run: `cd ai-proxy && npm run typecheck && npm test && cd ../calendar-proxy && npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/worker-auth ai-proxy calendar-proxy/src/__tests__
git commit -m "feat(worker-auth): premiumUntil 만료 시각 클레임으로 프리미엄 판단

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: billing-proxy 골격 + 엔타이틀먼트 상태 전이 순수 함수 + CI job

**Files:**
- Create: `billing-proxy/package.json`, `billing-proxy/tsconfig.json`, `billing-proxy/wrangler.toml`, `billing-proxy/src/env.ts`, `billing-proxy/src/entitlement.ts`
- Test: `billing-proxy/src/__tests__/entitlement.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces (`src/entitlement.ts`):
  - `type EntitlementStatus = "none" | "trialing" | "active" | "past_due" | "canceled"`
  - `type EntitlementSource = "manual" | "trial" | "paddle" | null`
  - `interface EntitlementDoc { plan: "free" | "premium"; status; source; premiumUntil: string | null; trialUsedAt: string | null; cancelAt: string | null; currentPeriodEnd: string | null; customerId: string | null; subscriptionId: string | null; lastWebhookEventId: string | null; lastEventOccurredAt: string | null; updatedAt: string }`
  - `const EMPTY_ENTITLEMENT: EntitlementDoc`
  - `interface PaddleSubscriptionEvent { eventId: string; occurredAt: string; status: "active" | "trialing" | "past_due" | "paused" | "canceled"; customerId: string; subscriptionId: string; currentPeriodEndsAt: string | null; scheduledCancelAt: string | null }`
  - `type Decision<R extends string> = { write: EntitlementDoc } | { skip: R }`
  - `type TrialRejection = "TRIAL_ALREADY_USED" | "ALREADY_PREMIUM"`
  - `RENEWAL_GRACE_MS`, `TRIAL_MS`
  - `isPremiumAt(doc: EntitlementDoc, now: Date): boolean`
  - `isStaleEvent(existing: EntitlementDoc, event: PaddleSubscriptionEvent): boolean`
  - `applySubscriptionEvent(existing: EntitlementDoc, event: PaddleSubscriptionEvent, now: Date): EntitlementDoc`
  - `applyTrial(existing: EntitlementDoc, now: Date): Decision<TrialRejection>`
  - `toClaimSeconds(premiumUntil: string | null): number`
- Produces (`src/env.ts`): `Env`

- [ ] **Step 1: 골격 파일 작성**

`billing-proxy/package.json`:

```json
{
  "name": "billing-proxy",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tododo/worker-auth": "file:../packages/worker-auth"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.99.0"
  }
}
```

`billing-proxy/tsconfig.json`: `reminder-proxy/tsconfig.json`과 동일한 내용을 그대로 복사한다.

`billing-proxy/wrangler.toml`:

```toml
name = "tododo-billing-proxy"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[vars]
FIREBASE_PROJECT_ID = "tododo-83576"
CLIENT_APP_URL = "https://tododo-83576.web.app"
# 샌드박스. 실결제 전환 시 https://api.paddle.com 으로 바꾼다.
PADDLE_API_BASE = "https://sandbox-api.paddle.com"
# 배포 전에 Paddle 대시보드의 월간 가격 id(pri_…)로 채운다(README "배포 준비").
PADDLE_PRICE_ID = "REPLACE_WITH_PADDLE_PRICE_ID"
# 샌드박스 기간에는 운영 Firestore가 샌드박스 결제에 연결되므로 허용 목록으로 막는다.
# 비우면 아무도 허용하지 않는다. 전원 허용은 정확히 "*".
BILLING_ALLOWED_UIDS = "2pq9Zu8vv1R7WpgN3x0HXnecvix1"
# PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, GOOGLE_SERVICE_ACCOUNT는 시크릿이다.
```

`billing-proxy/src/env.ts`:

```ts
export interface Env {
  FIREBASE_PROJECT_ID: string;
  CLIENT_APP_URL: string;
  PADDLE_API_BASE: string;
  PADDLE_PRICE_ID: string;
  /** 쉼표 구분 uid. 비어 있으면 아무도 허용하지 않고 "*"면 전원 허용. */
  BILLING_ALLOWED_UIDS?: string;
  PADDLE_API_KEY: string;
  PADDLE_WEBHOOK_SECRET: string;
  /** 결제 전용 서비스 계정 JSON 전체(문자열). Firestore 쓰기 + Auth 커스텀 클레임 설정. */
  GOOGLE_SERVICE_ACCOUNT: string;
}
```

Run: `cd billing-proxy && npm install`
Expected: `package-lock.json` 생성, 에러 없음.

- [ ] **Step 2: 상태 전이 테스트 작성** — `billing-proxy/src/__tests__/entitlement.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  EMPTY_ENTITLEMENT,
  RENEWAL_GRACE_MS,
  TRIAL_MS,
  applySubscriptionEvent,
  applyTrial,
  isPremiumAt,
  isStaleEvent,
  toClaimSeconds,
  type EntitlementDoc,
  type PaddleSubscriptionEvent,
} from "../entitlement";

const NOW = new Date("2026-10-10T00:00:00.000Z");
const PERIOD_END = "2026-11-10T00:00:00.000Z";
const iso = (ms: number) => new Date(ms).toISOString();

const event = (overrides: Partial<PaddleSubscriptionEvent> = {}): PaddleSubscriptionEvent => ({
  eventId: "evt_1",
  occurredAt: "2026-10-10T00:00:00.000Z",
  status: "active",
  customerId: "ctm_1",
  subscriptionId: "sub_1",
  currentPeriodEndsAt: PERIOD_END,
  scheduledCancelAt: null,
  ...overrides,
});

const doc = (overrides: Partial<EntitlementDoc> = {}): EntitlementDoc => ({
  ...EMPTY_ENTITLEMENT,
  ...overrides,
});

describe("applySubscriptionEvent", () => {
  it("active면 기간 끝 + 3일까지 프리미엄이고 Paddle 식별자를 기록한다", () => {
    const next = applySubscriptionEvent(doc(), event(), NOW);
    expect(next).toMatchObject({
      plan: "premium",
      status: "active",
      source: "paddle",
      premiumUntil: iso(Date.parse(PERIOD_END) + RENEWAL_GRACE_MS),
      currentPeriodEnd: PERIOD_END,
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      cancelAt: null,
      lastWebhookEventId: "evt_1",
      lastEventOccurredAt: "2026-10-10T00:00:00.000Z",
      updatedAt: NOW.toISOString(),
    });
  });

  it("체험 중이던 사용자가 구독하면 trialUsedAt은 유지되고 구독으로 덮어쓴다", () => {
    const trialing = doc({ status: "trialing", source: "trial", trialUsedAt: "2026-10-05T00:00:00.000Z", premiumUntil: "2026-10-12T00:00:00.000Z" });
    const next = applySubscriptionEvent(trialing, event(), NOW);
    expect(next.status).toBe("active");
    expect(next.source).toBe("paddle");
    expect(next.trialUsedAt).toBe("2026-10-05T00:00:00.000Z");
  });

  it("예약 해지가 걸리면 해지 시각까지만 프리미엄이고 유예를 붙이지 않는다", () => {
    const next = applySubscriptionEvent(doc(), event({ scheduledCancelAt: PERIOD_END }), NOW);
    expect(next.status).toBe("active");
    expect(next.premiumUntil).toBe(PERIOD_END);
    expect(next.cancelAt).toBe(PERIOD_END);
  });

  it("past_due면 기존 값과 기간 끝+3일 중 큰 값을 유지한다", () => {
    const later = "2026-12-31T00:00:00.000Z";
    expect(applySubscriptionEvent(doc({ premiumUntil: later }), event({ status: "past_due" }), NOW).premiumUntil).toBe(later);
    expect(applySubscriptionEvent(doc({ premiumUntil: null }), event({ status: "past_due" }), NOW).premiumUntil).toBe(
      iso(Date.parse(PERIOD_END) + RENEWAL_GRACE_MS),
    );
    expect(applySubscriptionEvent(doc(), event({ status: "past_due" }), NOW).status).toBe("past_due");
  });

  it("canceled면 즉시 회수한다(premiumUntil = now, plan = free)", () => {
    const active = doc({ status: "active", premiumUntil: "2026-11-13T00:00:00.000Z", cancelAt: PERIOD_END });
    const next = applySubscriptionEvent(active, event({ status: "canceled" }), NOW);
    expect(next).toMatchObject({ status: "canceled", plan: "free", premiumUntil: NOW.toISOString(), cancelAt: null });
  });

  it("paused는 canceled와 같게 처리한다", () => {
    const next = applySubscriptionEvent(doc(), event({ status: "paused" }), NOW);
    expect(next.status).toBe("canceled");
    expect(next.premiumUntil).toBe(NOW.toISOString());
  });

  it("Paddle trialing(쓰지 않는 상태)이 와도 active와 같게 처리한다", () => {
    const next = applySubscriptionEvent(doc(), event({ status: "trialing" }), NOW);
    expect(next.status).toBe("active");
  });

  it("기간 정보가 없으면 기존 premiumUntil을 유지한다", () => {
    const next = applySubscriptionEvent(doc({ premiumUntil: "2026-10-20T00:00:00.000Z" }), event({ currentPeriodEndsAt: null }), NOW);
    expect(next.premiumUntil).toBe("2026-10-20T00:00:00.000Z");
  });
});

describe("isStaleEvent", () => {
  it("같은 event_id면 오래된 것으로 본다", () => {
    expect(isStaleEvent(doc({ lastWebhookEventId: "evt_1" }), event())).toBe(true);
  });

  it("occurred_at이 마지막 반영 시각 이하면 오래된 것으로 본다", () => {
    const existing = doc({ lastWebhookEventId: "evt_0", lastEventOccurredAt: "2026-10-10T00:00:01.000Z" });
    expect(isStaleEvent(existing, event({ eventId: "evt_2" }))).toBe(true);
    expect(isStaleEvent(doc({ lastEventOccurredAt: "2026-10-10T00:00:00.000Z" }), event({ eventId: "evt_2" }))).toBe(true);
  });

  it("처음 받는 이벤트는 오래되지 않았다", () => {
    expect(isStaleEvent(doc(), event())).toBe(false);
  });
});

describe("applyTrial", () => {
  it("체험을 안 써봤고 비프리미엄이면 7일 체험을 부여한다", () => {
    const decision = applyTrial(doc(), NOW);
    expect(decision).toEqual({
      write: expect.objectContaining({
        plan: "premium",
        status: "trialing",
        source: "trial",
        premiumUntil: iso(NOW.getTime() + TRIAL_MS),
        trialUsedAt: NOW.toISOString(),
        cancelAt: null,
        updatedAt: NOW.toISOString(),
      }),
    });
  });

  it("이미 체험을 썼으면 거부한다(만료 후에도)", () => {
    expect(applyTrial(doc({ trialUsedAt: "2026-01-01T00:00:00.000Z" }), NOW)).toEqual({ skip: "TRIAL_ALREADY_USED" });
  });

  it("이미 프리미엄이면 거부한다", () => {
    expect(applyTrial(doc({ premiumUntil: "2026-10-11T00:00:00.000Z" }), NOW)).toEqual({ skip: "ALREADY_PREMIUM" });
  });
});

describe("isPremiumAt / toClaimSeconds", () => {
  it("premiumUntil이 now보다 커야 프리미엄이다(같으면 아님)", () => {
    expect(isPremiumAt(doc({ premiumUntil: NOW.toISOString() }), NOW)).toBe(false);
    expect(isPremiumAt(doc({ premiumUntil: iso(NOW.getTime() + 1) }), NOW)).toBe(true);
    expect(isPremiumAt(doc({ premiumUntil: null }), NOW)).toBe(false);
  });

  it("클레임은 epoch 초(내림), null은 0", () => {
    expect(toClaimSeconds("2026-10-10T00:00:00.999Z")).toBe(Math.floor(Date.parse("2026-10-10T00:00:00.999Z") / 1000));
    expect(toClaimSeconds(null)).toBe(0);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd billing-proxy && npm test`
Expected: FAIL — `Cannot find module '../entitlement'`

- [ ] **Step 4: 구현** — `billing-proxy/src/entitlement.ts`

```ts
/**
 * entitlements/{uid} 문서의 상태 전이. 웹훅·체험·운영자 부여가 모두 이 규칙을 따른다.
 * 권한 판단은 premiumUntil 하나로만 한다 — 만료 시각이 지나면 아무도 쓰지 않아도 잠기므로
 * 체험 종료·해지 후 회수 스케줄러가 필요 없다.
 */
export type EntitlementStatus = "none" | "trialing" | "active" | "past_due" | "canceled";
export type EntitlementSource = "manual" | "trial" | "paddle" | null;

export interface EntitlementDoc {
  plan: "free" | "premium";
  status: EntitlementStatus;
  source: EntitlementSource;
  premiumUntil: string | null;
  trialUsedAt: string | null;
  cancelAt: string | null;
  currentPeriodEnd: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  lastWebhookEventId: string | null;
  lastEventOccurredAt: string | null;
  updatedAt: string;
}

export const EMPTY_ENTITLEMENT: EntitlementDoc = {
  plan: "free",
  status: "none",
  source: null,
  premiumUntil: null,
  trialUsedAt: null,
  cancelAt: null,
  currentPeriodEnd: null,
  customerId: null,
  subscriptionId: null,
  lastWebhookEventId: null,
  lastEventOccurredAt: null,
  updatedAt: "",
};

export interface PaddleSubscriptionEvent {
  eventId: string;
  occurredAt: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  customerId: string;
  subscriptionId: string;
  currentPeriodEndsAt: string | null;
  /** scheduled_change.action === "cancel"일 때의 effective_at. */
  scheduledCancelAt: string | null;
}

export type Decision<R extends string> = { write: EntitlementDoc } | { skip: R };
export type TrialRejection = "TRIAL_ALREADY_USED" | "ALREADY_PREMIUM";

const DAY_MS = 86_400_000;
/** 토큰 갱신이 최대 1시간 늦어도 정상 갱신자가 기간 경계에서 잠기지 않게 둔 여유. */
export const RENEWAL_GRACE_MS = 3 * DAY_MS;
export const TRIAL_MS = 7 * DAY_MS;

const iso = (ms: number): string => new Date(ms).toISOString();

export const isPremiumAt = (doc: EntitlementDoc, now: Date): boolean =>
  doc.premiumUntil !== null && Date.parse(doc.premiumUntil) > now.getTime();

const withPlan = (doc: EntitlementDoc, now: Date): EntitlementDoc => ({
  ...doc,
  plan: isPremiumAt(doc, now) ? "premium" : "free",
});

/** subscription.* 본문은 구독 전체 스냅샷이라 가장 최신 이벤트 하나만 반영하면 정확하다. */
export const isStaleEvent = (existing: EntitlementDoc, event: PaddleSubscriptionEvent): boolean =>
  existing.lastWebhookEventId === event.eventId ||
  (existing.lastEventOccurredAt !== null &&
    Date.parse(event.occurredAt) <= Date.parse(existing.lastEventOccurredAt));

export const applySubscriptionEvent = (
  existing: EntitlementDoc,
  event: PaddleSubscriptionEvent,
  now: Date,
): EntitlementDoc => {
  const base: EntitlementDoc = {
    ...existing,
    source: "paddle",
    customerId: event.customerId,
    subscriptionId: event.subscriptionId,
    currentPeriodEnd: event.currentPeriodEndsAt,
    lastWebhookEventId: event.eventId,
    lastEventOccurredAt: event.occurredAt,
    updatedAt: now.toISOString(),
  };
  const periodPlusGrace =
    event.currentPeriodEndsAt === null
      ? existing.premiumUntil
      : iso(Date.parse(event.currentPeriodEndsAt) + RENEWAL_GRACE_MS);

  switch (event.status) {
    case "active":
    case "trialing":
      return withPlan(
        event.scheduledCancelAt !== null
          ? { ...base, status: "active", premiumUntil: event.scheduledCancelAt, cancelAt: event.scheduledCancelAt }
          : { ...base, status: "active", premiumUntil: periodPlusGrace, cancelAt: null },
        now,
      );
    case "past_due": {
      // Paddle이 결제를 재시도하는 동안은 이용을 유지한다(Paddle 권장).
      const candidates = [existing.premiumUntil, periodPlusGrace]
        .filter((value): value is string => value !== null)
        .map((value) => Date.parse(value));
      const premiumUntil = candidates.length > 0 ? iso(Math.max(...candidates)) : null;
      return withPlan({ ...base, status: "past_due", premiumUntil, cancelAt: null }, now);
    }
    case "paused":
    case "canceled":
      return withPlan({ ...base, status: "canceled", premiumUntil: now.toISOString(), cancelAt: null }, now);
  }
};

export const applyTrial = (existing: EntitlementDoc, now: Date): Decision<TrialRejection> => {
  if (existing.trialUsedAt !== null) return { skip: "TRIAL_ALREADY_USED" };
  if (isPremiumAt(existing, now)) return { skip: "ALREADY_PREMIUM" };
  return {
    write: {
      ...existing,
      plan: "premium",
      status: "trialing",
      source: "trial",
      premiumUntil: iso(now.getTime() + TRIAL_MS),
      trialUsedAt: now.toISOString(),
      cancelAt: null,
      updatedAt: now.toISOString(),
    },
  };
};

/** 커스텀 클레임 premiumUntil 값(epoch 초). null은 0 = 비프리미엄. */
export const toClaimSeconds = (premiumUntil: string | null): number =>
  premiumUntil === null ? 0 : Math.floor(Date.parse(premiumUntil) / 1000);
```

- [ ] **Step 5: 통과 확인**

Run: `cd billing-proxy && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 6: CI job 추가** — `.github/workflows/ci.yml`

`changes` job `outputs`에 `billingProxy: ${{ steps.filter.outputs.billingProxy }}`를 추가하고, `filters`에 다음을 추가:

```yaml
            billingProxy:
              - 'billing-proxy/**'
              - 'packages/worker-auth/**'
```

`reminder-proxy` job 바로 아래에 새 job을 추가(배포 스텝은 ai-proxy처럼 placeholder 가드 포함):

```yaml
  billing-proxy:
    name: Billing Proxy
    runs-on: ubuntu-latest
    needs: changes
    # 다른 Worker와 같은 이유로 main push에는 항상 실행한다(배포는 멱등).
    if: >-
      needs.changes.outputs.billingProxy == 'true' ||
      (github.ref == 'refs/heads/main' && github.event_name == 'push')
    defaults:
      run:
        working-directory: billing-proxy

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Cache node_modules
        uses: actions/cache@v4
        id: cache-billing-proxy-npm
        with:
          path: billing-proxy/node_modules
          key: ${{ runner.os }}-billing-proxy-node-modules-${{ hashFiles('billing-proxy/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-billing-proxy-node-modules-

      - name: Install dependencies
        if: steps.cache-billing-proxy-npm.outputs.cache-hit != 'true'
        run: npm ci

      - name: Type Check
        run: npm run typecheck

      - name: Unit Test
        run: npm run test

      - name: Deploy to Cloudflare Workers
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          if grep -q REPLACE_WITH_PADDLE_PRICE_ID wrangler.toml; then echo "::error::billing-proxy/wrangler.toml의 PADDLE_PRICE_ID가 아직 placeholder입니다 (README 배포 준비)"; exit 1; fi
          npm run deploy
```

- [ ] **Step 7: Commit**

```bash
git add billing-proxy .github/workflows/ci.yml
git commit -m "feat(billing): billing-proxy 골격과 엔타이틀먼트 상태 전이 규칙

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Google 서비스 계정 클라이언트 — 엔타이틀먼트 저장소와 클레임

**Files:**
- Create: `billing-proxy/src/googleAuth.ts`, `billing-proxy/src/entitlementStore.ts`, `billing-proxy/src/claims.ts`
- Test: `billing-proxy/src/__tests__/entitlementStore.test.ts`, `billing-proxy/src/__tests__/claims.test.ts`

**Interfaces:**
- Consumes: `EntitlementDoc`, `EMPTY_ENTITLEMENT` (Task 2)
- Produces:
  - `parseServiceAccount(json: string): ServiceAccount`, `class GoogleTokenProvider { constructor(sa, fetchFn?, now?); getToken(): Promise<string> }`
  - `interface StoredEntitlement { doc: EntitlementDoc; updateTime: string | null }` (`null` = 문서 없음)
  - `class EntitlementStore { constructor(projectId: string, getToken: () => Promise<string>, fetchFn?); get(uid: string): Promise<StoredEntitlement>; write(uid: string, doc: EntitlementDoc, updateTime: string | null): Promise<"ok" | "conflict"> }`
  - `class UserNotFoundError extends Error`
  - `class ClaimsClient { constructor(projectId: string, getToken: () => Promise<string>, fetchFn?); setPremiumUntil(uid: string, premiumUntilSec: number): Promise<void> }`

- [ ] **Step 1: googleAuth 복제** — `reminder-proxy/src/googleAuth.ts` 전체를 `billing-proxy/src/googleAuth.ts`로 복사하고 두 군데만 바꾼다.

```ts
// 파일 맨 위에 추가
/**
 * reminder-proxy/src/googleAuth.ts의 복제본. 스코프만 다르다(Firestore 쓰기 + Identity Toolkit).
 * 두 곳을 공유 패키지로 합치는 것은 세 번째 사용처가 생길 때 한다.
 */
```

```ts
// GOOGLE_SCOPES를 교체 — cloud-platform은 Firestore와 Identity Toolkit(커스텀 클레임) 둘 다 포함한다.
export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/cloud-platform";
```

- [ ] **Step 2: 저장소·클레임 테스트 작성**

`billing-proxy/src/__tests__/entitlementStore.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { EntitlementStore } from "../entitlementStore";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";

const getToken = async () => "access-token";
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const SAMPLE: EntitlementDoc = {
  ...EMPTY_ENTITLEMENT,
  plan: "premium",
  status: "active",
  source: "paddle",
  premiumUntil: "2026-11-13T00:00:00.000Z",
  customerId: "ctm_1",
  updatedAt: "2026-10-10T00:00:00.000Z",
};

describe("EntitlementStore.get", () => {
  it("문서가 없으면 빈 엔타이틀먼트와 updateTime null", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const store = new EntitlementStore("proj", getToken, fetchFn);
    await expect(store.get("u1")).resolves.toEqual({ doc: EMPTY_ENTITLEMENT, updateTime: null });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents/entitlements/u1",
    );
  });

  it("필드를 디코드하고 모르는 값·누락은 기본값으로 채운다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes({
        updateTime: "2026-10-10T00:00:00.123456Z",
        fields: {
          plan: { stringValue: "premium" },
          status: { stringValue: "expired" },
          source: { stringValue: "manual" },
          premiumUntil: { stringValue: "2099-12-31T00:00:00.000Z" },
          customerId: { nullValue: null },
          updatedAt: { stringValue: "2026-09-19T00:00:00.000Z" },
        },
      }),
    );
    const { doc, updateTime } = await new EntitlementStore("proj", getToken, fetchFn).get("u1");
    expect(updateTime).toBe("2026-10-10T00:00:00.123456Z");
    expect(doc).toEqual({
      ...EMPTY_ENTITLEMENT,
      plan: "premium",
      status: "none",
      source: "manual",
      premiumUntil: "2099-12-31T00:00:00.000Z",
      updatedAt: "2026-09-19T00:00:00.000Z",
    });
  });

  it("그 외 오류는 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(new EntitlementStore("proj", getToken, fetchFn).get("u1")).rejects.toThrow("500");
  });
});

describe("EntitlementStore.write", () => {
  it("기존 문서면 updateTime 사전조건으로 전체 필드를 PATCH한다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({}));
    const result = await new EntitlementStore("proj", getToken, fetchFn).write("u1", SAMPLE, "2026-10-10T00:00:00.123456Z");
    expect(result).toBe("ok");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents/entitlements/u1" +
        "?currentDocument.updateTime=2026-10-10T00%3A00%3A00.123456Z",
    );
    expect(init.method).toBe("PATCH");
    expect(init.headers.Authorization).toBe("Bearer access-token");
    const fields = JSON.parse(init.body).fields;
    expect(fields.plan).toEqual({ stringValue: "premium" });
    expect(fields.trialUsedAt).toEqual({ nullValue: null });
    expect(Object.keys(fields).sort()).toEqual(Object.keys(EMPTY_ENTITLEMENT).sort());
  });

  it("문서가 없던 경우 exists=false 사전조건을 쓴다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({}));
    await new EntitlementStore("proj", getToken, fetchFn).write("u1", SAMPLE, null);
    expect(fetchFn.mock.calls[0][0]).toMatch(/\?currentDocument\.exists=false$/);
  });

  it.each([
    [409, { error: { status: "ALREADY_EXISTS" } }],
    [404, { error: { status: "NOT_FOUND" } }],
    [400, { error: { status: "FAILED_PRECONDITION" } }],
  ])("사전조건 실패(%i)는 conflict로 돌려준다", async (status, body) => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes(body, status));
    await expect(new EntitlementStore("proj", getToken, fetchFn).write("u1", SAMPLE, null)).resolves.toBe("conflict");
  });

  it("다른 400·500은 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ error: { status: "INVALID_ARGUMENT" } }, 400));
    await expect(new EntitlementStore("proj", getToken, fetchFn).write("u1", SAMPLE, null)).rejects.toThrow("400");
  });
});
```

`billing-proxy/src/__tests__/claims.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { ClaimsClient, UserNotFoundError } from "../claims";

const getToken = async () => "access-token";
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const BASE = "https://identitytoolkit.googleapis.com/v1/projects/proj";

describe("ClaimsClient.setPremiumUntil", () => {
  it("기존 클레임을 보존하고 premium 키는 지운 뒤 premiumUntil을 쓴다", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ users: [{ localId: "u1", customAttributes: '{"premium":true,"admin":true}' }] }))
      .mockResolvedValueOnce(jsonRes({ localId: "u1" }));

    await new ClaimsClient("proj", getToken, fetchFn).setPremiumUntil("u1", 1_800_000_000);

    const [lookupUrl, lookupInit] = fetchFn.mock.calls[0];
    expect(lookupUrl).toBe(`${BASE}/accounts:lookup`);
    expect(JSON.parse(lookupInit.body)).toEqual({ localId: ["u1"] });

    const [updateUrl, updateInit] = fetchFn.mock.calls[1];
    expect(updateUrl).toBe(`${BASE}/accounts:update`);
    const body = JSON.parse(updateInit.body);
    expect(body.localId).toBe("u1");
    expect(JSON.parse(body.customAttributes)).toEqual({ admin: true, premiumUntil: 1_800_000_000 });
  });

  it("커스텀 클레임이 없던 사용자도 처리한다", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ users: [{ localId: "u1" }] }))
      .mockResolvedValueOnce(jsonRes({ localId: "u1" }));
    await new ClaimsClient("proj", getToken, fetchFn).setPremiumUntil("u1", 0);
    expect(JSON.parse(JSON.parse(fetchFn.mock.calls[1][1].body).customAttributes)).toEqual({ premiumUntil: 0 });
  });

  it("사용자가 없으면 UserNotFoundError", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonRes({}));
    await expect(new ClaimsClient("proj", getToken, fetchFn).setPremiumUntil("ghost", 1)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it("update 실패는 던진다", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ users: [{ localId: "u1" }] }))
      .mockResolvedValueOnce(jsonRes({}, 403));
    await expect(new ClaimsClient("proj", getToken, fetchFn).setPremiumUntil("u1", 1)).rejects.toThrow("403");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd billing-proxy && npm test`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현**

`billing-proxy/src/entitlementStore.ts`:

```ts
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "./entitlement";

type FirestoreValue = { stringValue?: string; nullValue?: null };

export interface StoredEntitlement {
  doc: EntitlementDoc;
  /** 낙관적 동시성 제어용. null이면 문서가 아직 없다. */
  updateTime: string | null;
}

const STATUSES = new Set(["none", "trialing", "active", "past_due", "canceled"]);
const SOURCES = new Set(["manual", "trial", "paddle"]);
const PLANS = new Set(["free", "premium"]);
const FIELD_NAMES = Object.keys(EMPTY_ENTITLEMENT) as (keyof EntitlementDoc)[];

const readString = (value: FirestoreValue | undefined): string | null =>
  value && typeof value.stringValue === "string" ? value.stringValue : null;

const decode = (fields: Record<string, FirestoreValue>): EntitlementDoc => {
  const text = (name: keyof EntitlementDoc) => readString(fields[name]);
  const plan = text("plan");
  const status = text("status");
  const source = text("source");
  return {
    plan: plan && PLANS.has(plan) ? (plan as EntitlementDoc["plan"]) : EMPTY_ENTITLEMENT.plan,
    status: status && STATUSES.has(status) ? (status as EntitlementDoc["status"]) : EMPTY_ENTITLEMENT.status,
    source: source && SOURCES.has(source) ? (source as EntitlementDoc["source"]) : null,
    premiumUntil: text("premiumUntil"),
    trialUsedAt: text("trialUsedAt"),
    cancelAt: text("cancelAt"),
    currentPeriodEnd: text("currentPeriodEnd"),
    customerId: text("customerId"),
    subscriptionId: text("subscriptionId"),
    lastWebhookEventId: text("lastWebhookEventId"),
    lastEventOccurredAt: text("lastEventOccurredAt"),
    updatedAt: text("updatedAt") ?? "",
  };
};

const encode = (doc: EntitlementDoc): Record<string, FirestoreValue> =>
  Object.fromEntries(
    FIELD_NAMES.map((name) => {
      const value = doc[name];
      return [name, value === null ? { nullValue: null } : { stringValue: value }];
    }),
  );

const PRECONDITION_FAILURES = new Set(["FAILED_PRECONDITION", "ALREADY_EXISTS", "NOT_FOUND", "ABORTED"]);

/**
 * 서비스 계정으로 entitlements/{uid}를 읽고 쓴다(보안 규칙 우회). 쓰기는 항상 사전조건을 걸어
 * 동시에 들어온 웹훅·체험 요청이 서로의 결과를 덮어쓰지 않게 한다.
 */
export class EntitlementStore {
  private readonly base: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 기본값으로 담으면 Workers가 "Illegal invocation"을 던진다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    return this.fetchFn(`${this.base}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  }

  async get(uid: string): Promise<StoredEntitlement> {
    const res = await this.request(`/entitlements/${encodeURIComponent(uid)}`);
    if (res.status === 404) return { doc: EMPTY_ENTITLEMENT, updateTime: null };
    if (!res.ok) throw new Error(`Firestore 엔타이틀먼트 조회 실패 (${res.status})`);
    const body = (await res.json()) as { fields?: Record<string, FirestoreValue>; updateTime: string };
    return { doc: decode(body.fields ?? {}), updateTime: body.updateTime };
  }

  async write(uid: string, doc: EntitlementDoc, updateTime: string | null): Promise<"ok" | "conflict"> {
    const precondition =
      updateTime === null
        ? "currentDocument.exists=false"
        : `currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
    const res = await this.request(`/entitlements/${encodeURIComponent(uid)}?${precondition}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: encode(doc) }),
    });
    if (res.ok) return "ok";
    const body = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
    if (PRECONDITION_FAILURES.has(body?.error?.status ?? "")) return "conflict";
    throw new Error(`Firestore 엔타이틀먼트 쓰기 실패 (${res.status})`);
  }
}
```

`billing-proxy/src/claims.ts`:

```ts
export class UserNotFoundError extends Error {
  constructor(uid: string) {
    super(`Firebase Auth 사용자 없음: ${uid}`);
    this.name = "UserNotFoundError";
  }
}

/**
 * Identity Toolkit REST로 커스텀 클레임을 쓴다. 다른 클레임을 지우지 않도록 읽어서 병합하고,
 * 예전 형식의 premium 불리언은 제거한다(판단은 premiumUntil만 한다).
 */
export class ClaimsClient {
  private readonly base: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
  }

  private async post(path: string, body: unknown): Promise<Response> {
    const token = await this.getToken();
    return this.fetchFn(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  async setPremiumUntil(uid: string, premiumUntilSec: number): Promise<void> {
    const lookup = await this.post("/accounts:lookup", { localId: [uid] });
    if (!lookup.ok) throw new Error(`Auth 사용자 조회 실패 (${lookup.status})`);
    const { users } = (await lookup.json()) as { users?: { customAttributes?: string }[] };
    if (!users || users.length === 0) throw new UserNotFoundError(uid);

    const existing = users[0].customAttributes ? (JSON.parse(users[0].customAttributes) as Record<string, unknown>) : {};
    const { premium: _legacy, ...rest } = existing;
    const update = await this.post("/accounts:update", {
      localId: uid,
      customAttributes: JSON.stringify({ ...rest, premiumUntil: premiumUntilSec }),
    });
    if (!update.ok) throw new Error(`커스텀 클레임 설정 실패 (${update.status})`);
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd billing-proxy && npm test && npm run typecheck`
Expected: PASS (typecheck가 `_legacy` 미사용으로 실패하지 않는지 확인 — `noUnusedLocals`가 꺼져 있다)

- [ ] **Step 6: Commit**

```bash
git add billing-proxy/src
git commit -m "feat(billing): 엔타이틀먼트 문서 사전조건 쓰기와 premiumUntil 클레임 병합

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 공통 반영 루틴 `commitEntitlement`

**Files:**
- Create: `billing-proxy/src/commit.ts`
- Test: `billing-proxy/src/__tests__/commit.test.ts`

**Interfaces:**
- Consumes: `EntitlementStore`(get/write), `ClaimsClient.setPremiumUntil`, `Decision`, `toClaimSeconds`, `applyTrial`
- Produces:
  - `interface CommitDeps { store: Pick<EntitlementStore, "get" | "write">; claims: Pick<ClaimsClient, "setPremiumUntil"> }`
  - `type CommitOutcome<R extends string> = { kind: "written"; doc: EntitlementDoc } | { kind: "skipped"; reason: R }`
  - `commitEntitlement<R extends string>(deps: CommitDeps, uid: string, decide: (existing: EntitlementDoc) => Decision<R>): Promise<CommitOutcome<R>>`

- [ ] **Step 1: 테스트 작성** — `billing-proxy/src/__tests__/commit.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { commitEntitlement, type CommitDeps } from "../commit";
import { EMPTY_ENTITLEMENT, applyTrial, type EntitlementDoc } from "../entitlement";

const NOW = new Date("2026-10-10T00:00:00.000Z");

/** 메모리 저장소: updateTime이 맞을 때만 쓰기를 받는 실제 사전조건 동작을 흉내 낸다. */
const memoryStore = (initial: EntitlementDoc | null) => {
  let doc = initial;
  let version = initial ? 1 : 0;
  return {
    get: vi.fn(async () => ({ doc: doc ?? EMPTY_ENTITLEMENT, updateTime: doc ? `v${version}` : null })),
    write: vi.fn(async (_uid: string, next: EntitlementDoc, updateTime: string | null) => {
      const current = doc ? `v${version}` : null;
      if (current !== updateTime) return "conflict" as const;
      doc = next;
      version += 1;
      return "ok" as const;
    }),
    current: () => doc,
  };
};

describe("commitEntitlement", () => {
  it("클레임을 먼저 쓰고 문서를 나중에 쓴다", async () => {
    const order: string[] = [];
    const store = memoryStore(null);
    store.write.mockImplementation(async () => {
      order.push("doc");
      return "ok";
    });
    const claims = { setPremiumUntil: vi.fn(async () => void order.push("claim")) };

    const outcome = await commitEntitlement({ store, claims }, "u1", (existing) => applyTrial(existing, NOW));

    expect(order).toEqual(["claim", "doc"]);
    expect(outcome.kind).toBe("written");
    expect(claims.setPremiumUntil).toHaveBeenCalledWith("u1", Math.floor(NOW.getTime() / 1000) + 7 * 86400);
  });

  it("skip이면 아무것도 쓰지 않는다", async () => {
    const store = memoryStore({ ...EMPTY_ENTITLEMENT, trialUsedAt: "2026-01-01T00:00:00.000Z" });
    const claims = { setPremiumUntil: vi.fn() };
    const outcome = await commitEntitlement({ store, claims }, "u1", (existing) => applyTrial(existing, NOW));
    expect(outcome).toEqual({ kind: "skipped", reason: "TRIAL_ALREADY_USED" });
    expect(claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it("문서 쓰기가 충돌하면 다시 읽고 다시 결정한다 — 두 탭 동시 체험은 하나만 성공", async () => {
    const store = memoryStore(null);
    const claims = { setPremiumUntil: vi.fn(async () => undefined) };
    const deps: CommitDeps = { store, claims };

    const [a, b] = await Promise.all([
      commitEntitlement(deps, "u1", (existing) => applyTrial(existing, NOW)),
      commitEntitlement(deps, "u1", (existing) => applyTrial(existing, NOW)),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["skipped", "written"]);
    expect(store.current()?.status).toBe("trialing");
  });

  it("문서 쓰기가 예외면 그대로 던진다(웹훅은 500 → Paddle 재전송)", async () => {
    const store = memoryStore(null);
    store.write.mockRejectedValue(new Error("Firestore 엔타이틀먼트 쓰기 실패 (503)"));
    const claims = { setPremiumUntil: vi.fn(async () => undefined) };
    await expect(commitEntitlement({ store, claims }, "u1", (existing) => applyTrial(existing, NOW))).rejects.toThrow("503");
    expect(claims.setPremiumUntil).toHaveBeenCalledTimes(1);
  });

  it("충돌이 3번 반복되면 포기하고 던진다", async () => {
    const store = memoryStore(null);
    store.write.mockResolvedValue("conflict");
    const claims = { setPremiumUntil: vi.fn(async () => undefined) };
    await expect(commitEntitlement({ store, claims }, "u1", (existing) => applyTrial(existing, NOW))).rejects.toThrow("충돌");
    expect(store.write).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd billing-proxy && npm test -- commit`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `billing-proxy/src/commit.ts`

```ts
import type { ClaimsClient } from "./claims";
import { toClaimSeconds, type Decision, type EntitlementDoc } from "./entitlement";
import type { EntitlementStore } from "./entitlementStore";

export interface CommitDeps {
  store: Pick<EntitlementStore, "get" | "write">;
  claims: Pick<ClaimsClient, "setPremiumUntil">;
}

export type CommitOutcome<R extends string> =
  | { kind: "written"; doc: EntitlementDoc }
  | { kind: "skipped"; reason: R };

const MAX_ATTEMPTS = 3;

/**
 * 읽기 → 결정 → 클레임 → 문서(사전조건) 순서로 반영한다.
 *
 * 클레임을 먼저 쓰는 이유: 중복 판정 기준(lastWebhookEventId)이 문서에 있다. 문서 쓰기가 실패하면
 * 예외 → 웹훅 500 → Paddle 재전송 → 클레임 재기록(같은 값이라 무해) → 문서 기록으로 수렴한다.
 * 반대 순서면 "문서는 처리됨, 클레임만 실패"가 재전송에서도 무시되어 영구히 남는다.
 */
export const commitEntitlement = async <R extends string>(
  deps: CommitDeps,
  uid: string,
  decide: (existing: EntitlementDoc) => Decision<R>,
): Promise<CommitOutcome<R>> => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { doc, updateTime } = await deps.store.get(uid);
    const decision = decide(doc);
    if ("skip" in decision) return { kind: "skipped", reason: decision.skip };

    await deps.claims.setPremiumUntil(uid, toClaimSeconds(decision.write.premiumUntil));
    if ((await deps.store.write(uid, decision.write, updateTime)) === "ok") {
      return { kind: "written", doc: decision.write };
    }
  }
  throw new Error(`entitlements/${uid} 쓰기 충돌이 ${MAX_ATTEMPTS}회 반복됨`);
};
```

- [ ] **Step 4: 통과 확인**

Run: `cd billing-proxy && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add billing-proxy/src
git commit -m "feat(billing): 클레임 먼저·문서 나중 + 충돌 재시도 반영 루틴

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Paddle 웹훅 — 서명 검증, 파싱, 핸들러

**Files:**
- Create: `billing-proxy/src/signature.ts`, `billing-proxy/src/paddleEvent.ts`, `billing-proxy/src/handlers/webhook.ts`
- Test: `billing-proxy/src/__tests__/helpers/signForTest.ts`(테스트 헬퍼 — 파일명에 `.test`가 없어 vitest가 테스트로 수집하지 않는다), `billing-proxy/src/__tests__/signature.test.ts`, `billing-proxy/src/__tests__/paddleEvent.test.ts`, `billing-proxy/src/__tests__/webhook.test.ts`

**Interfaces:**
- Consumes: `commitEntitlement`, `CommitDeps`, `isStaleEvent`, `applySubscriptionEvent`, `UserNotFoundError`, `Env`
- Produces:
  - `verifyPaddleSignature(rawBody: string, header: string | null, secret: string, nowSec: number, toleranceSec?: number): Promise<boolean>`
  - `type ParsedWebhook = { kind: "ignored" } | { kind: "invalid"; reason: string } | { kind: "subscription"; uid: string | null; event: PaddleSubscriptionEvent }`
  - `parseWebhook(body: unknown): ParsedWebhook`
  - `handleWebhook(request: Request, env: Pick<Env, "PADDLE_WEBHOOK_SECRET">, deps: CommitDeps, now: Date): Promise<Response>`

- [ ] **Step 1: 테스트 작성**

`billing-proxy/src/__tests__/helpers/signForTest.ts`:

```ts
/** Paddle과 같은 방식으로 서명 헤더를 만든다(테스트 전용). */
export const signForTest = async (body: string, secret: string, ts: number): Promise<string> => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${body}`)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  return `ts=${ts};h1=${hex}`;
};
```

`billing-proxy/src/__tests__/signature.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { verifyPaddleSignature } from "../signature";
import { signForTest } from "./helpers/signForTest";

const SECRET = "pdl_ntfset_test_secret";
const BODY = '{"event_id":"evt_1"}';
const TS = 1_791_590_400;

describe("verifyPaddleSignature", () => {
  it("올바른 서명이면 true", async () => {
    expect(await verifyPaddleSignature(BODY, await signForTest(BODY, SECRET, TS), SECRET, TS + 10)).toBe(true);
  });

  it("본문이 바뀌면 false", async () => {
    const header = await signForTest(BODY, SECRET, TS);
    expect(await verifyPaddleSignature('{"event_id":"evt_2"}', header, SECRET, TS)).toBe(false);
  });

  it("시크릿이 다르면 false", async () => {
    expect(await verifyPaddleSignature(BODY, await signForTest(BODY, "other", TS), SECRET, TS)).toBe(false);
  });

  it("5분보다 오래된 ts면 false", async () => {
    expect(await verifyPaddleSignature(BODY, await signForTest(BODY, SECRET, TS), SECRET, TS + 301)).toBe(false);
  });

  it("헤더가 없거나 형식이 틀리면 false", async () => {
    expect(await verifyPaddleSignature(BODY, null, SECRET, TS)).toBe(false);
    expect(await verifyPaddleSignature(BODY, "garbage", SECRET, TS)).toBe(false);
    expect(await verifyPaddleSignature(BODY, `ts=${TS}`, SECRET, TS)).toBe(false);
  });

  it("시크릿이 비어 있으면 false(설정 누락이 검증 통과로 이어지지 않게)", async () => {
    expect(await verifyPaddleSignature(BODY, await signForTest(BODY, "", TS), "", TS)).toBe(false);
  });
});
```

`billing-proxy/src/__tests__/paddleEvent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseWebhook } from "../paddleEvent";

const payload = (overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  event_id: "evt_1",
  event_type: "subscription.updated",
  occurred_at: "2026-10-10T00:00:00.000000Z",
  data: {
    id: "sub_1",
    status: "active",
    customer_id: "ctm_1",
    custom_data: { uid: "u1" },
    current_billing_period: { starts_at: "2026-10-10T00:00:00Z", ends_at: "2026-11-10T00:00:00Z" },
    scheduled_change: null,
    ...data,
  },
  ...overrides,
});

describe("parseWebhook", () => {
  it("구독 이벤트를 내부 형태로 바꾼다", () => {
    expect(parseWebhook(payload())).toEqual({
      kind: "subscription",
      uid: "u1",
      event: {
        eventId: "evt_1",
        occurredAt: "2026-10-10T00:00:00.000000Z",
        status: "active",
        customerId: "ctm_1",
        subscriptionId: "sub_1",
        currentPeriodEndsAt: "2026-11-10T00:00:00Z",
        scheduledCancelAt: null,
      },
    });
  });

  it("예약 해지는 scheduledCancelAt으로, 일시정지 예약은 무시한다", () => {
    const cancel = parseWebhook(payload({}, { scheduled_change: { action: "cancel", effective_at: "2026-11-10T00:00:00Z" } }));
    expect(cancel.kind === "subscription" && cancel.event.scheduledCancelAt).toBe("2026-11-10T00:00:00Z");
    const pause = parseWebhook(payload({}, { scheduled_change: { action: "pause", effective_at: "2026-11-10T00:00:00Z" } }));
    expect(pause.kind === "subscription" && pause.event.scheduledCancelAt).toBeNull();
  });

  it("해지된 구독은 기간이 null일 수 있다", () => {
    const parsed = parseWebhook(payload({ event_type: "subscription.canceled" }, { status: "canceled", current_billing_period: null }));
    expect(parsed.kind === "subscription" && parsed.event.currentPeriodEndsAt).toBeNull();
  });

  it("custom_data.uid가 없으면 uid null", () => {
    const parsed = parseWebhook(payload({}, { custom_data: null }));
    expect(parsed.kind === "subscription" && parsed.uid).toBeNull();
  });

  it("구독 이벤트가 아니면 ignored", () => {
    expect(parseWebhook(payload({ event_type: "transaction.completed" }))).toEqual({ kind: "ignored" });
  });

  it("필수 필드가 없거나 모르는 상태면 invalid", () => {
    expect(parseWebhook(payload({}, { status: "weird" })).kind).toBe("invalid");
    expect(parseWebhook(payload({ event_id: undefined })).kind).toBe("invalid");
    expect(parseWebhook(null).kind).toBe("invalid");
  });
});
```

`billing-proxy/src/__tests__/webhook.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { handleWebhook } from "../handlers/webhook";
import { UserNotFoundError } from "../claims";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import { signForTest } from "./helpers/signForTest";

const SECRET = "whsec";
const NOW = new Date("2026-10-10T00:00:05.000Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const body = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    event_id: "evt_1",
    event_type: "subscription.created",
    occurred_at: "2026-10-10T00:00:00.000Z",
    data: {
      id: "sub_1",
      status: "active",
      customer_id: "ctm_1",
      custom_data: { uid: "u1" },
      current_billing_period: { ends_at: "2026-11-10T00:00:00.000Z" },
      scheduled_change: null,
    },
    ...overrides,
  });

const request = async (raw: string, header?: string) =>
  new Request("https://billing.example/webhooks/paddle", {
    method: "POST",
    headers: { "Paddle-Signature": header ?? (await signForTest(raw, SECRET, NOW_SEC)) },
    body: raw,
  });

const deps = (existing: EntitlementDoc = EMPTY_ENTITLEMENT) => ({
  store: {
    get: vi.fn(async () => ({ doc: existing, updateTime: null })),
    write: vi.fn(async () => "ok" as const),
  },
  claims: { setPremiumUntil: vi.fn(async () => undefined) },
});

describe("handleWebhook", () => {
  it("서명이 틀리면 401이고 아무것도 쓰지 않는다", async () => {
    const d = deps();
    const res = await handleWebhook(await request(body(), "ts=1;h1=00"), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(401);
    expect(d.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("active 구독이면 클레임과 문서를 반영하고 200", async () => {
    const d = deps();
    const res = await handleWebhook(await request(body()), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
    expect(d.claims.setPremiumUntil).toHaveBeenCalledWith("u1", Math.floor(Date.parse("2026-11-13T00:00:00.000Z") / 1000));
    expect(d.store.write.mock.calls[0][1]).toMatchObject({ status: "active", customerId: "ctm_1", lastWebhookEventId: "evt_1" });
  });

  it("이미 처리한 이벤트면 200이고 쓰지 않는다", async () => {
    const d = deps({ ...EMPTY_ENTITLEMENT, lastWebhookEventId: "evt_1" });
    const res = await handleWebhook(await request(body()), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.write).not.toHaveBeenCalled();
  });

  it("uid가 없으면 200(재시도해도 해결 안 됨)", async () => {
    const d = deps();
    const raw = body({ data: { id: "sub_1", status: "active", customer_id: "ctm_1", custom_data: null, current_billing_period: null, scheduled_change: null } });
    const res = await handleWebhook(await request(raw), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.get).not.toHaveBeenCalled();
  });

  it("Auth 사용자가 삭제됐으면 200(무한 재전송 방지)", async () => {
    const d = deps();
    d.claims.setPremiumUntil.mockRejectedValue(new UserNotFoundError("u1"));
    const res = await handleWebhook(await request(body()), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
  });

  it("구독 외 이벤트는 200으로 무시한다", async () => {
    const d = deps();
    const res = await handleWebhook(await request(body({ event_type: "transaction.completed" })), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(200);
    expect(d.store.get).not.toHaveBeenCalled();
  });

  it("문서 쓰기 실패는 던진다(라우터가 500 → Paddle 재전송)", async () => {
    const d = deps();
    d.store.write.mockRejectedValue(new Error("Firestore 엔타이틀먼트 쓰기 실패 (503)"));
    await expect(handleWebhook(await request(body()), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW)).rejects.toThrow("503");
  });

  it("JSON이 깨졌으면 400", async () => {
    const d = deps();
    const res = await handleWebhook(await request("{not json"), { PADDLE_WEBHOOK_SECRET: SECRET }, d, NOW);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd billing-proxy && npm test`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`billing-proxy/src/signature.ts`:

```ts
const enc = new TextEncoder();

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Paddle-Signature: ts=<unix초>;h1=<hex HMAC-SHA256("ts:원문 body")>.
 * 원문 body는 JSON.parse 전의 문자열 그대로여야 한다(공백 하나만 달라도 서명이 깨진다).
 */
export const verifyPaddleSignature = async (
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec: number,
  toleranceSec = 300,
): Promise<boolean> => {
  if (!header || !secret) return false;
  const parts = new Map(
    header.split(";").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    }),
  );
  const ts = Number(parts.get("ts"));
  const h1 = parts.get("h1");
  if (!Number.isInteger(ts) || !h1) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false;

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${rawBody}`)));
  return timingSafeEqual(toHex(signature), h1);
};
```

`billing-proxy/src/paddleEvent.ts`:

```ts
import type { PaddleSubscriptionEvent } from "./entitlement";

const SUBSCRIPTION_EVENTS = new Set(["subscription.created", "subscription.updated", "subscription.canceled"]);
const STATUSES = new Set(["active", "trialing", "past_due", "paused", "canceled"]);

export type ParsedWebhook =
  | { kind: "ignored" }
  | { kind: "invalid"; reason: string }
  | { kind: "subscription"; uid: string | null; event: PaddleSubscriptionEvent };

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null;
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export const parseWebhook = (body: unknown): ParsedWebhook => {
  if (!isObject(body)) return { kind: "invalid", reason: "본문이 객체가 아님" };
  const eventType = str(body.event_type);
  if (eventType === null) return { kind: "invalid", reason: "event_type 없음" };
  if (!SUBSCRIPTION_EVENTS.has(eventType)) return { kind: "ignored" };

  const eventId = str(body.event_id);
  const occurredAt = str(body.occurred_at);
  const data = isObject(body.data) ? body.data : null;
  const subscriptionId = str(data?.id);
  const customerId = str(data?.customer_id);
  const status = str(data?.status);
  if (!eventId || !occurredAt || !data || !subscriptionId || !customerId || !status || !STATUSES.has(status)) {
    return { kind: "invalid", reason: `필수 필드 누락 또는 알 수 없는 상태(${status})` };
  }

  const period = isObject(data.current_billing_period) ? data.current_billing_period : null;
  const scheduled = isObject(data.scheduled_change) ? data.scheduled_change : null;
  const customData = isObject(data.custom_data) ? data.custom_data : null;

  return {
    kind: "subscription",
    uid: str(customData?.uid),
    event: {
      eventId,
      occurredAt,
      status: status as PaddleSubscriptionEvent["status"],
      customerId,
      subscriptionId,
      currentPeriodEndsAt: str(period?.ends_at),
      scheduledCancelAt: scheduled?.action === "cancel" ? str(scheduled.effective_at) : null,
    },
  };
};
```

`billing-proxy/src/handlers/webhook.ts`:

```ts
import { UserNotFoundError } from "../claims";
import { commitEntitlement, type CommitDeps } from "../commit";
import { applySubscriptionEvent, isStaleEvent } from "../entitlement";
import type { Env } from "../env";
import { parseWebhook } from "../paddleEvent";
import { verifyPaddleSignature } from "../signature";

const ok = () => new Response("ok", { status: 200 });

/**
 * 200은 "다시 보내지 마"라는 뜻이다. 재전송으로 해결되지 않는 문제(uid 없음, 삭제된 사용자,
 * 형식 오류)는 로그만 남기고 200, 일시적 실패(Firestore·Auth 오류)만 예외 → 500으로 재전송을 받는다.
 */
export const handleWebhook = async (
  request: Request,
  env: Pick<Env, "PADDLE_WEBHOOK_SECRET">,
  deps: CommitDeps,
  now: Date,
): Promise<Response> => {
  const raw = await request.text();
  const valid = await verifyPaddleSignature(
    raw,
    request.headers.get("Paddle-Signature"),
    env.PADDLE_WEBHOOK_SECRET,
    Math.floor(now.getTime() / 1000),
  );
  if (!valid) return new Response("Invalid signature", { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = parseWebhook(body);
  if (parsed.kind === "ignored") return ok();
  if (parsed.kind === "invalid") {
    console.error("Paddle 웹훅 형식 오류:", parsed.reason);
    return ok();
  }
  if (parsed.uid === null) {
    console.error("Paddle 웹훅에 custom_data.uid 없음:", parsed.event.subscriptionId);
    return ok();
  }

  const { uid, event } = parsed;
  try {
    await commitEntitlement(deps, uid, (existing) =>
      isStaleEvent(existing, event) ? { skip: "STALE" } : { write: applySubscriptionEvent(existing, event, now) },
    );
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      console.error("Paddle 웹훅 대상 사용자가 없음:", uid, event.subscriptionId);
      return ok();
    }
    throw error;
  }
  return ok();
};
```

- [ ] **Step 4: 통과 확인**

Run: `cd billing-proxy && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add billing-proxy/src
git commit -m "feat(billing): Paddle 웹훅 서명 검증과 구독 상태 반영

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 사용자 엔드포인트(`/checkout`·`/trial`·`/portal`) + 허용 목록 + 라우터 + README

**Files:**
- Create: `billing-proxy/src/allowlist.ts`, `billing-proxy/src/paddle.ts`, `billing-proxy/src/handlers/account.ts`, `billing-proxy/src/router.ts`, `billing-proxy/src/index.ts`, `billing-proxy/README.md`
- Test: `billing-proxy/src/__tests__/allowlist.test.ts`, `billing-proxy/src/__tests__/paddle.test.ts`, `billing-proxy/src/__tests__/router.test.ts`

**Interfaces:**
- Consumes: `CommitDeps`, `commitEntitlement`, `applyTrial`, `isPremiumAt`, `handleWebhook`, `EntitlementStore`, `ClaimsClient`, `GoogleTokenProvider`, `parseServiceAccount`, `verifyFirebaseIdToken`, `isAllowedOrigin`
- Produces:
  - `isBillingAllowed(uid: string, raw: string | undefined): boolean`
  - `class PaddleClient { constructor(apiBase: string, apiKey: string, priceId: string, fetchFn?); createCheckoutTransaction(uid: string, customerId: string | null): Promise<string>; createPortalUrl(customerId: string, subscriptionId: string | null): Promise<string> }`
  - `interface BillingDeps extends CommitDeps { paddle: Pick<PaddleClient, "createCheckoutTransaction" | "createPortalUrl"> }`
  - `handleRequest(request: Request, env: Env, getDeps: () => BillingDeps, now?: Date): Promise<Response>`
  - HTTP 계약(클라이언트 Task 9가 사용):
    - `POST /checkout` → 200 `{ transactionId }` | 401 | 403 `{ error: "NOT_ALLOWED" }` | 409 `{ error: "ALREADY_SUBSCRIBED" }`
    - `POST /trial` → 200 `{ premiumUntil }` | 401 | 403 `{ error: "NOT_ALLOWED" }` | 409 `{ error: "TRIAL_ALREADY_USED" | "ALREADY_PREMIUM" }`
    - `POST /portal` → 200 `{ url }` | 401 | 403 `{ error: "NOT_ALLOWED" }` | 404 `{ error: "NO_CUSTOMER" }`

- [ ] **Step 1: 테스트 작성**

`billing-proxy/src/__tests__/allowlist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isBillingAllowed } from "../allowlist";

describe("isBillingAllowed", () => {
  it("목록에 있는 uid만 허용한다(공백 무시)", () => {
    expect(isBillingAllowed("u1", "u0, u1 ,u2")).toBe(true);
    expect(isBillingAllowed("u3", "u0,u1")).toBe(false);
  });

  it("값이 없거나 비어 있으면 아무도 허용하지 않는다", () => {
    expect(isBillingAllowed("u1", undefined)).toBe(false);
    expect(isBillingAllowed("u1", "")).toBe(false);
    expect(isBillingAllowed("u1", " , ")).toBe(false);
  });

  it("정확히 *일 때만 전원 허용", () => {
    expect(isBillingAllowed("anyone", "*")).toBe(true);
    expect(isBillingAllowed("anyone", " * ")).toBe(true);
    expect(isBillingAllowed("anyone", "*,u1")).toBe(false);
  });
});
```

`billing-proxy/src/__tests__/paddle.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { PaddleClient } from "../paddle";

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("PaddleClient", () => {
  it("거래를 서버 가격·토큰 uid로 만든다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ data: { id: "txn_1" } }));
    const client = new PaddleClient("https://sandbox-api.paddle.com", "key", "pri_1", fetchFn);

    await expect(client.createCheckoutTransaction("u1", null)).resolves.toBe("txn_1");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://sandbox-api.paddle.com/transactions");
    expect(init.headers.Authorization).toBe("Bearer key");
    expect(JSON.parse(init.body)).toEqual({ items: [{ price_id: "pri_1", quantity: 1 }], custom_data: { uid: "u1" } });
  });

  it("기존 고객이면 customer_id를 붙인다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ data: { id: "txn_1" } }));
    await new PaddleClient("https://x", "key", "pri_1", fetchFn).createCheckoutTransaction("u1", "ctm_1");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).customer_id).toBe("ctm_1");
  });

  it("포털 세션의 overview URL을 돌려준다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ data: { urls: { general: { overview: "https://portal/ov" } } } }));
    const url = await new PaddleClient("https://x", "key", "pri_1", fetchFn).createPortalUrl("ctm_1", "sub_1");
    expect(url).toBe("https://portal/ov");
    expect(fetchFn.mock.calls[0][0]).toBe("https://x/customers/ctm_1/portal-sessions");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ subscription_ids: ["sub_1"] });
  });

  it("Paddle 오류는 던진다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRes({ error: {} }, 400));
    await expect(new PaddleClient("https://x", "key", "pri_1", fetchFn).createCheckoutTransaction("u1", null)).rejects.toThrow("400");
  });
});
```

`billing-proxy/src/__tests__/router.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRequest, type BillingDeps } from "../router";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import type { Env } from "../env";

vi.mock("@tododo/worker-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tododo/worker-auth")>()),
  verifyFirebaseIdToken: vi.fn(),
}));
import { verifyFirebaseIdToken } from "@tododo/worker-auth";

const NOW = new Date("2026-10-10T00:00:00.000Z");
const ENV: Env = {
  FIREBASE_PROJECT_ID: "tododo-83576",
  CLIENT_APP_URL: "https://tododo-83576.web.app",
  PADDLE_API_BASE: "https://sandbox-api.paddle.com",
  PADDLE_PRICE_ID: "pri_1",
  BILLING_ALLOWED_UIDS: "u1",
  PADDLE_API_KEY: "key",
  PADDLE_WEBHOOK_SECRET: "whsec",
  GOOGLE_SERVICE_ACCOUNT: "{}",
};

const makeDeps = (existing: EntitlementDoc = EMPTY_ENTITLEMENT) => ({
  store: { get: vi.fn(async () => ({ doc: existing, updateTime: null })), write: vi.fn(async () => "ok" as const) },
  claims: { setPremiumUntil: vi.fn(async () => undefined) },
  paddle: {
    createCheckoutTransaction: vi.fn(async () => "txn_1"),
    createPortalUrl: vi.fn(async () => "https://portal/ov"),
  },
});

const post = (path: string, body?: unknown) =>
  new Request(`https://billing.example${path}`, {
    method: "POST",
    headers: { Authorization: "Bearer id-token", Origin: "https://tododo-83576.web.app", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const call = (request: Request, deps: BillingDeps) => handleRequest(request, ENV, () => deps, NOW);

describe("router", () => {
  beforeEach(() => {
    vi.mocked(verifyFirebaseIdToken).mockReset().mockResolvedValue({ uid: "u1", premium: false, premiumUntil: null });
  });

  it("OPTIONS는 204 + 허용 origin CORS", async () => {
    const res = await call(new Request("https://billing.example/checkout", { method: "OPTIONS", headers: { Origin: "https://tododo-83576.web.app" } }), makeDeps());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
  });

  it("토큰이 없거나 틀리면 401", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValue(new Error("bad"));
    expect((await call(post("/checkout"), makeDeps())).status).toBe(401);
  });

  it("허용 목록 밖이면 403 NOT_ALLOWED이고 Paddle을 부르지 않는다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "stranger", premium: false, premiumUntil: null });
    const deps = makeDeps();
    for (const path of ["/checkout", "/trial", "/portal"]) {
      const res = await call(post(path), deps);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "NOT_ALLOWED" });
    }
    expect(deps.paddle.createCheckoutTransaction).not.toHaveBeenCalled();
    expect(deps.claims.setPremiumUntil).not.toHaveBeenCalled();
  });

  it("/checkout은 본문의 uid를 무시하고 토큰 uid로 거래를 만든다", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, customerId: "ctm_1" });
    const res = await call(post("/checkout", { uid: "victim" }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transactionId: "txn_1" });
    expect(deps.paddle.createCheckoutTransaction).toHaveBeenCalledWith("u1", "ctm_1");
  });

  it("/checkout은 살아 있는 Paddle 구독이 있으면 409 ALREADY_SUBSCRIBED", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, source: "paddle", status: "active", premiumUntil: "2026-11-13T00:00:00.000Z" });
    const res = await call(post("/checkout"), deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "ALREADY_SUBSCRIBED" });
  });

  it("/checkout은 해지돼 기간이 끝난 사용자에게는 다시 허용한다", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, source: "paddle", status: "canceled", premiumUntil: "2026-10-01T00:00:00.000Z" });
    expect((await call(post("/checkout"), deps)).status).toBe(200);
  });

  it("/trial 성공은 200 + premiumUntil", async () => {
    const res = await call(post("/trial"), makeDeps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ premiumUntil: "2026-10-17T00:00:00.000Z" });
  });

  it("/trial 재사용은 409 TRIAL_ALREADY_USED", async () => {
    const res = await call(post("/trial"), makeDeps({ ...EMPTY_ENTITLEMENT, trialUsedAt: "2026-01-01T00:00:00.000Z" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "TRIAL_ALREADY_USED" });
  });

  it("/portal은 고객이 없으면 404 NO_CUSTOMER, 있으면 URL", async () => {
    expect((await call(post("/portal"), makeDeps())).status).toBe(404);
    const res = await call(post("/portal"), makeDeps({ ...EMPTY_ENTITLEMENT, customerId: "ctm_1", subscriptionId: "sub_1" }));
    expect(await res.json()).toEqual({ url: "https://portal/ov" });
  });

  it("예상 못한 예외는 CORS가 붙은 500", async () => {
    const deps = makeDeps();
    deps.paddle.createCheckoutTransaction.mockRejectedValue(new Error("boom"));
    const res = await call(post("/checkout"), deps);
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
  });

  it("의존성 생성이 실패해도(시크릿 누락) CORS가 붙은 500", async () => {
    const res = await handleRequest(post("/checkout"), ENV, () => { throw new Error("GOOGLE_SERVICE_ACCOUNT 없음"); }, NOW);
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
  });

  it("모르는 경로는 404", async () => {
    expect((await call(post("/nope"), makeDeps())).status).toBe(404);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd billing-proxy && npm test`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`billing-proxy/src/allowlist.ts`:

```ts
/**
 * 샌드박스 기간 게이트. 운영 Firestore가 샌드박스 결제에 연결되므로 공개 테스트 카드로
 * 누구나 프리미엄을 얻지 못하게 막는다. 설정 누락이 게이트 개방으로 이어지지 않도록
 * 비어 있으면 아무도 허용하지 않고, 전원 허용은 정확히 "*"일 때만이다.
 */
export const isBillingAllowed = (uid: string, raw: string | undefined): boolean => {
  const value = (raw ?? "").trim();
  if (value === "*") return true;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .includes(uid);
};
```

`billing-proxy/src/paddle.ts`:

```ts
export class PaddleClient {
  constructor(
    private readonly apiBase: string,
    private readonly apiKey: string,
    private readonly priceId: string,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.apiBase}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Paddle ${path} 실패 (${res.status})`);
    return (await res.json()) as T;
  }

  /** 가격·uid는 서버가 정한다 — 브라우저가 custom_data를 넣으면 남의 uid로 결제를 연결할 수 있다. */
  async createCheckoutTransaction(uid: string, customerId: string | null): Promise<string> {
    const { data } = await this.post<{ data: { id: string } }>("/transactions", {
      items: [{ price_id: this.priceId, quantity: 1 }],
      custom_data: { uid },
      ...(customerId ? { customer_id: customerId } : {}),
    });
    return data.id;
  }

  async createPortalUrl(customerId: string, subscriptionId: string | null): Promise<string> {
    const { data } = await this.post<{ data: { urls: { general: { overview: string } } } }>(
      `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
      subscriptionId ? { subscription_ids: [subscriptionId] } : {},
    );
    return data.urls.general.overview;
  }
}
```

`billing-proxy/src/handlers/account.ts`:

```ts
import { commitEntitlement } from "../commit";
import { applyTrial, isPremiumAt } from "../entitlement";
import type { BillingDeps } from "../router";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const handleCheckout = async (uid: string, deps: BillingDeps, now: Date): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  // 살아 있는 구독 위에 또 결제하면 이중 청구된다. 해지 예약 상태도 포털에서 "해지 취소"로 되살린다.
  if (doc.source === "paddle" && doc.status !== "canceled" && isPremiumAt(doc, now)) {
    return json({ error: "ALREADY_SUBSCRIBED" }, 409);
  }
  const transactionId = await deps.paddle.createCheckoutTransaction(uid, doc.customerId);
  return json({ transactionId });
};

export const handleTrial = async (uid: string, deps: BillingDeps, now: Date): Promise<Response> => {
  const outcome = await commitEntitlement(deps, uid, (existing) => applyTrial(existing, now));
  if (outcome.kind === "skipped") return json({ error: outcome.reason }, 409);
  return json({ premiumUntil: outcome.doc.premiumUntil });
};

export const handlePortal = async (uid: string, deps: BillingDeps): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  if (!doc.customerId) return json({ error: "NO_CUSTOMER" }, 404);
  return json({ url: await deps.paddle.createPortalUrl(doc.customerId, doc.subscriptionId) });
};
```

`billing-proxy/src/router.ts`:

```ts
import { isAllowedOrigin, verifyFirebaseIdToken } from "@tododo/worker-auth";
import { isBillingAllowed } from "./allowlist";
import type { CommitDeps } from "./commit";
import type { Env } from "./env";
import { handleCheckout, handlePortal, handleTrial } from "./handlers/account";
import { handleWebhook } from "./handlers/webhook";
import type { PaddleClient } from "./paddle";

export interface BillingDeps extends CommitDeps {
  paddle: Pick<PaddleClient, "createCheckoutTransaction" | "createPortalUrl">;
}

type AccountRoute = (uid: string, deps: BillingDeps, now: Date) => Promise<Response>;

const ACCOUNT_ROUTES = new Map<string, AccountRoute>([
  ["/checkout", handleCheckout],
  ["/trial", handleTrial],
  ["/portal", (uid, deps) => handlePortal(uid, deps)],
]);

const withCors = (response: Response, origin: string | null, env: Env): Response => {
  const headers = new Headers(response.headers);
  if (isAllowedOrigin(origin, env)) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, headers });
};

const authenticate = async (request: Request, env: Env): Promise<string | null> => {
  const idToken = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    return (await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID)).uid;
  } catch {
    return null;
  }
};

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * getDeps는 try 안에서 호출한다 — 시크릿 누락으로 의존성 생성이 실패해도 CORS가 붙은 500이 나가야
 * 브라우저에서 진짜 원인이 CORS 에러로 가려지지 않는다(ai-proxy와 같은 이유).
 */
export const handleRequest = async (
  request: Request,
  env: Env,
  getDeps: () => BillingDeps,
  now: Date = new Date(),
): Promise<Response> => {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");

  try {
    if (url.pathname === "/webhooks/paddle" && request.method === "POST") {
      return await handleWebhook(request, env, getDeps(), now);
    }
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), origin, env);

    const route = request.method === "POST" ? ACCOUNT_ROUTES.get(url.pathname) : undefined;
    if (!route) return withCors(new Response("Not Found", { status: 404 }), origin, env);

    const uid = await authenticate(request, env);
    if (!uid) return withCors(json({ error: "UNAUTHORIZED" }, 401), origin, env);
    if (!isBillingAllowed(uid, env.BILLING_ALLOWED_UIDS)) {
      return withCors(json({ error: "NOT_ALLOWED" }, 403), origin, env);
    }
    return withCors(await route(uid, getDeps(), now), origin, env);
  } catch (error) {
    console.error(`처리되지 않은 예외 (${url.pathname}):`, error);
    return withCors(new Response("Internal Server Error", { status: 500 }), origin, env);
  }
};
```

`billing-proxy/src/index.ts`:

```ts
import { ClaimsClient } from "./claims";
import { EntitlementStore } from "./entitlementStore";
import type { Env } from "./env";
import { GoogleTokenProvider, parseServiceAccount } from "./googleAuth";
import { PaddleClient } from "./paddle";
import { handleRequest, type BillingDeps } from "./router";

// 같은 isolate 안에서는 Google 액세스 토큰 캐시를 재사용한다.
let cached: { env: Env; deps: BillingDeps } | null = null;

const getDeps = (env: Env): BillingDeps => {
  if (cached?.env === env) return cached.deps;
  const tokens = new GoogleTokenProvider(parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT));
  const getToken = () => tokens.getToken();
  const deps: BillingDeps = {
    store: new EntitlementStore(env.FIREBASE_PROJECT_ID, getToken),
    claims: new ClaimsClient(env.FIREBASE_PROJECT_ID, getToken),
    paddle: new PaddleClient(env.PADDLE_API_BASE, env.PADDLE_API_KEY, env.PADDLE_PRICE_ID),
  };
  cached = { env, deps };
  return deps;
};

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env, () => getDeps(env)),
};
```

`billing-proxy/README.md`:

````markdown
# billing-proxy

프리미엄 결제/구독(Paddle Billing) Worker. 스펙: `docs/superpowers/specs/2026-10-04-premium-billing-paddle-design.md`

| 경로 | 인증 | 설명 |
|---|---|---|
| `POST /checkout` | Firebase ID 토큰 | 서버가 Paddle 거래 생성 → `{ transactionId }` |
| `POST /trial` | Firebase ID 토큰 | 카드 없는 7일 체험(계정당 1회) |
| `POST /portal` | Firebase ID 토큰 | Paddle 고객 포털 URL |
| `POST /webhooks/paddle` | `Paddle-Signature` | `subscription.created/updated/canceled` 반영 |

## 배포 준비 (사용자 작업 — 비밀값은 본인 터미널에서)

1. **Paddle 샌드박스**(sandbox-vendors.paddle.com)
   - Catalog: 상품 "ToDoDo 프리미엄" + 월간 KRW 가격 → `pri_…`를 `wrangler.toml`의 `PADDLE_PRICE_ID`에.
   - Developer tools > Authentication: API 키(→ `PADDLE_API_KEY`), Client-side token(→ 클라이언트 `VITE_PADDLE_CLIENT_TOKEN`).
   - Checkout > Checkout settings: Default payment link = `https://tododo-83576.web.app` (transactionId로 결제창을 열려면 필수).
   - Developer tools > Notifications: 대상 URL `https://tododo-billing-proxy.<subdomain>.workers.dev/webhooks/paddle`, 이벤트 `subscription.created`·`subscription.updated`·`subscription.canceled` → secret key(→ `PADDLE_WEBHOOK_SECRET`).
2. **GCP 결제 전용 서비스 계정**(reminder-proxy 계정과 별도): 역할 `Cloud Datastore User` + `Firebase Authentication Admin` → JSON 키.
3. **시크릿 등록** (`cd billing-proxy`):
   ```bash
   npx wrangler secret put PADDLE_API_KEY
   npx wrangler secret put PADDLE_WEBHOOK_SECRET
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT < ~/billing-service-account.json
   ```
4. 첫 배포는 수동 `npx wrangler deploy`로 확인하고, 이후는 main push 시 CI가 배포한다.

## 로컬·프리뷰 테스트

Paddle 웹훅은 localhost에 닿지 않는다. `npx wrangler versions upload`로 만든 프리뷰 URL을 샌드박스 Notification 대상으로 임시 등록하고, 클라이언트는 `VITE_BILLING_PROXY_URL`을 그 URL로 덮어써 테스트한다. `past_due`·즉시 해지는 Paddle 대시보드의 웹훅 시뮬레이터로 보낸다.

## 실결제 전환

Paddle 운영 계정 승인 → `PADDLE_API_BASE=https://api.paddle.com`, 운영 키·가격 id·웹훅 secret·클라이언트 토큰 교체 → `BILLING_ALLOWED_UIDS="*"` → 클라이언트 `VITE_BILLING_ENABLED=true`.

## 알려진 한계

- 즉시 해지된 사용자가 이미 받은 ID 토큰은 만료(최대 1시간)까지 서버 접근이 가능하다.
- 웹훅이 3일 넘게 실패하면 정상 구독자도 유예가 끝나 잠길 수 있다.
````

- [ ] **Step 4: 통과 확인**

Run: `cd billing-proxy && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add billing-proxy
git commit -m "feat(billing): 결제·체험·포털 엔드포인트와 샌드박스 허용 목록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: firestore.rules · grant 스크립트 · E2E 시드를 `premiumUntil`로

**Files:**
- Modify: `firestore.rules:53-56`
- Modify: `scripts/grantEntitlement.ts`
- Modify: `client/e2e/utils/premium.ts`

**Interfaces:**
- Consumes: 클레임 `premiumUntil`(초), 문서 필드 목록(Task 2의 `EntitlementDoc`와 같은 키)
- Produces: `npm run grant:entitlement -- --uid <uid> --plan premium [--until <ISO>]` / `--plan free`

- [ ] **Step 1: rules 수정** — `calendarIntegrations` 블록을 교체

```
    match /calendarIntegrations/{userId} {
      // premiumUntil(epoch 초) 커스텀 클레임이 지금보다 미래여야 한다. 만료 시각만 비교하므로
      // 체험 종료·해지 후 기간 만료 시 별도 회수 작업이 필요 없다(billing-proxy가 설정).
      allow read, write: if request.auth != null && request.auth.uid == userId
                          && request.auth.token.premiumUntil is number
                          && request.auth.token.premiumUntil > request.time.toMillis() / 1000;
    }
```

`entitlements` 블록 주석(68~73행)의 "나중에 결제 웹훅을 붙이면"을 "결제 웹훅(billing-proxy)은"으로 고친다.

- [ ] **Step 2: grant 스크립트 수정** — `scripts/grantEntitlement.ts`

헤더 주석의 사용법에 `--until` 줄을 추가하고, `ParsedArgs`·`parseArgs`·`run`을 교체:

```ts
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run grant:entitlement -- --uid <uid> --plan premium [--until 2027-01-01T00:00:00.000Z]
```

```ts
interface ParsedArgs {
  uid: string;
  plan: "premium" | "free";
  /** premium일 때만 쓴다. 기본은 사실상 무기한. */
  until: Date;
}

const DEFAULT_UNTIL = "2099-12-31T00:00:00.000Z";

const parseArgs = (argv: string[]): ParsedArgs => {
  const valueOf = (flag: string) => {
    const index = argv.indexOf(flag);
    return index !== -1 ? argv[index + 1] : undefined;
  };
  const uid = valueOf("--uid");
  const plan = valueOf("--plan");
  const until = new Date(valueOf("--until") ?? DEFAULT_UNTIL);

  if (!uid) throw new Error("--uid <uid> 인자가 필요합니다");
  if (plan !== "premium" && plan !== "free") {
    throw new Error("--plan은 premium 또는 free여야 합니다");
  }
  if (Number.isNaN(until.getTime())) throw new Error("--until은 ISO 날짜여야 합니다");
  if (plan === "premium" && until.getTime() <= Date.now()) throw new Error("--until은 미래여야 합니다");
  return { uid, plan, until };
};

const run = async () => {
  const { uid, plan, until } = parseArgs(process.argv.slice(2));
  const isPremium = plan === "premium";
  const premiumUntil = isPremium ? until.toISOString() : null;
  const now = new Date().toISOString();

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const auth = getAuth();

  // uid 존재 여부를 먼저 확인한다 — 여기서 실패하면(오타 등) 문서를 쓰기 전에 중단된다.
  // 기존 커스텀 클레임도 함께 얻어 아래에서 병합한다.
  const { premium: _legacy, ...existingClaims } = (await auth.getUser(uid)).customClaims ?? {};

  // billing-proxy와 같은 순서(클레임 먼저)로 쓴다.
  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    premiumUntil: premiumUntil === null ? 0 : Math.floor(Date.parse(premiumUntil) / 1000),
  });
  console.log(`${uid} 커스텀 클레임 갱신 완료 (premiumUntil: ${premiumUntil ?? "없음"})`);

  await db.doc(`entitlements/${uid}`).set(
    {
      plan,
      status: isPremium ? "active" : "none",
      source: "manual",
      premiumUntil,
      cancelAt: null,
      updatedAt: now,
    },
    { merge: true },
  );
  console.log(`entitlements/${uid} 문서 갱신 완료 (plan: ${plan})`);

  console.log(
    "열려 있는 클라이언트는 문서 변경을 감지해 토큰을 바로 갱신한다. 닫혀 있던 클라이언트는 다음 로그인/토큰 갱신 때 반영된다.",
  );
};
```

(`merge: true`라 `trialUsedAt`·Paddle 필드 등 이 스크립트가 다루지 않는 필드는 보존된다.)

- [ ] **Step 3: 스크립트 타입 확인**

Run: `cd /Users/river/tododo && npx tsx scripts/grantEntitlement.ts; echo "exit=$?"`
Expected: Firebase 초기화 전에 `엔타이틀먼트 부여/회수 실패: Error: --uid <uid> 인자가 필요합니다`와 `exit=1`(구문·import 오류가 없다는 뜻). 실제 실행은 Task 12에서 한다.

Run: `cd /Users/river/tododo && npx tsx scripts/grantEntitlement.ts --uid x --plan premium --until 2020-01-01T00:00:00.000Z; echo "exit=$?"`
Expected: `--until은 미래여야 합니다`, `exit=1`

- [ ] **Step 4: E2E 시드 수정** — `client/e2e/utils/premium.ts`의 `fields`에 한 줄 추가하고 주석 보강

```ts
        premiumUntil: { stringValue: new Date(Date.now() + 365 * 86_400_000).toISOString() },
```

함수 주석의 "UI 잠금 판정(useIsPremium)만 풀면 되고"를 "UI 잠금 판정(useIsPremium: premiumUntil > now)만 풀면 되고"로 고친다.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules scripts/grantEntitlement.ts client/e2e/utils/premium.ts
git commit -m "feat(entitlement): rules·운영자 부여·E2E 시드를 premiumUntil 만료 시각 기준으로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(rules는 자동 테스트 인프라가 없다. Task 10에서 Rules Playground로 확인한다.)

---

### Task 8: 클라이언트 엔타이틀먼트 — 새 타입, 실시간 동기화, 시간 기준 판단

**Files:**
- Modify: `client/src/features/entitlement/types/entitlement.type.ts`, `client/src/features/entitlement/types/index.ts`
- Create: `client/src/features/entitlement/utils/isPremiumEntitlement.ts`
- Modify: `client/src/features/entitlement/api/entitlementApi.ts`, `client/src/features/entitlement/api/index.ts`
- Modify: `client/src/features/entitlement/hooks/useEntitlement.ts`, `client/src/features/entitlement/hooks/useIsPremium.ts`, `client/src/features/entitlement/hooks/index.ts`
- Create: `client/src/features/entitlement/hooks/useEntitlementSync.ts`
- Modify: `client/src/features/entitlement/index.ts`, `client/src/App.tsx`, `client/CLAUDE.md`
- Test: `client/src/features/entitlement/hooks/__tests__/useEntitlement.test.tsx`(교체), `client/src/features/entitlement/hooks/__tests__/useEntitlementSync.test.tsx`, `client/src/features/entitlement/api/__tests__/entitlementApi.test.ts`(수정)

**Interfaces:**
- Produces:
  - `type EntitlementStatus = "none" | "trialing" | "active" | "past_due" | "canceled"`; `type EntitlementSource = "manual" | "trial" | "paddle" | null`
  - `interface Entitlement { plan; status; source; premiumUntil: string | null; trialUsedAt: string | null; cancelAt: string | null; currentPeriodEnd: string | null; customerId: string | null; subscriptionId: string | null; lastWebhookEventId: string | null; lastEventOccurredAt: string | null; updatedAt: string }`
  - `isPremiumEntitlement(entitlement: Entitlement | undefined, nowMs: number): boolean`
  - `normalizeEntitlement(data: Partial<Entitlement> | undefined): Entitlement`, `getEntitlement(): Promise<Entitlement>`, `subscribeEntitlement(uid: string, onNext: (e: Entitlement) => void, onError: (e: Error) => void): () => void`
  - `entitlementQueryKey(uid: string | undefined): readonly ["entitlement", string | undefined]`
  - `useEntitlement()` (기존 시그니처 유지), `useIsPremium(): { isPremium: boolean; isLoading: boolean }`
  - `useEntitlementSync(): void`, `syncClaimWithEntitlement(entitlement: Entitlement): Promise<void>`

- [ ] **Step 1: 타입·유틸 교체**

`entitlement.type.ts` 전체:

```ts
type EntitlementPlan = "free" | "premium";

type EntitlementStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

/** manual = 운영자 스크립트, trial = 카드 없는 체험, paddle = 결제 웹훅. */
type EntitlementSource = "manual" | "trial" | "paddle" | null;

/**
 * entitlements/{uid}. 쓰기는 billing-proxy·운영자 스크립트만 한다(rules write:false).
 * 프리미엄 여부는 premiumUntil 하나로만 판단한다 — 서버(rules·Worker)의 premiumUntil 클레임과 같은 기준.
 */
interface Entitlement {
  plan: EntitlementPlan;
  status: EntitlementStatus;
  source: EntitlementSource;
  /** ISO. 이 시각보다 이전이면 프리미엄. 클레임 premiumUntil(초)과 같은 순간. */
  premiumUntil: string | null;
  /** 체험을 쓴 시각. 값이 있으면 다시 체험할 수 없다. */
  trialUsedAt: string | null;
  /** 예약 해지가 실제로 끝나는 시각(표시용). */
  cancelAt: string | null;
  currentPeriodEnd: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  lastWebhookEventId: string | null;
  lastEventOccurredAt: string | null;
  updatedAt: string;
}

/** entitlements/{uid} 문서가 없을 때 클라이언트가 취급하는 기본값. */
const DEFAULT_ENTITLEMENT: Entitlement = {
  plan: "free",
  status: "none",
  source: null,
  premiumUntil: null,
  trialUsedAt: null,
  cancelAt: null,
  currentPeriodEnd: null,
  customerId: null,
  subscriptionId: null,
  lastWebhookEventId: null,
  lastEventOccurredAt: null,
  updatedAt: "",
};

export { DEFAULT_ENTITLEMENT };
export type { Entitlement, EntitlementPlan, EntitlementStatus, EntitlementSource };
```

`types/index.ts`가 `EntitlementSource`도 재수출하는지 확인하고 없으면 추가한다.

`utils/isPremiumEntitlement.ts`:

```ts
import type { Entitlement } from "../types";

/** 서버와 같은 판단식: premiumUntil > 지금. 같은 순간은 프리미엄이 아니다. */
export const isPremiumEntitlement = (entitlement: Entitlement | undefined, nowMs: number): boolean =>
  !!entitlement?.premiumUntil && Date.parse(entitlement.premiumUntil) > nowMs;
```

- [ ] **Step 2: 테스트 작성**

`hooks/__tests__/useEntitlement.test.tsx` 전체 교체:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEntitlement } from "../useEntitlement";
import { useIsPremium } from "../useIsPremium";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "../../types";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("../../api", () => ({
  getEntitlement: vi.fn(),
  entitlementQueryKey: (uid: string | undefined) => ["entitlement", uid] as const,
}));

const NOW = new Date("2026-10-10T00:00:00.000Z");

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const entitlement = (overrides: Partial<Entitlement>): Entitlement => ({ ...DEFAULT_ENTITLEMENT, ...overrides });

describe("useEntitlement", () => {
  it("getEntitlement 결과를 그대로 반환한다", async () => {
    const { getEntitlement } = await import("../../api");
    vi.mocked(getEntitlement).mockResolvedValue(entitlement({ plan: "premium" }));
    const { result } = renderHook(() => useEntitlement(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.plan).toBe("premium");
  });
});

describe("useIsPremium", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const render = async (value: Entitlement) => {
    const { getEntitlement } = await import("../../api");
    vi.mocked(getEntitlement).mockResolvedValue(value);
    const hook = renderHook(() => useIsPremium(), { wrapper: createWrapper() });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    return hook;
  };

  it("premiumUntil이 미래면 true(status와 무관)", async () => {
    const { result } = await render(entitlement({ status: "past_due", premiumUntil: "2026-10-11T00:00:00.000Z" }));
    expect(result.current.isPremium).toBe(true);
  });

  it("premiumUntil이 지났으면 false(status가 active여도)", async () => {
    const { result } = await render(entitlement({ status: "active", plan: "premium", premiumUntil: "2026-10-09T00:00:00.000Z" }));
    expect(result.current.isPremium).toBe(false);
  });

  it("premiumUntil이 없으면 false", async () => {
    const { result } = await render(entitlement({ plan: "premium", status: "active" }));
    expect(result.current.isPremium).toBe(false);
  });

  it("열려 있는 동안 만료 시각이 지나면 스스로 잠긴다", async () => {
    const { result } = await render(entitlement({ premiumUntil: "2026-10-10T00:00:30.000Z" }));
    expect(result.current.isPremium).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current.isPremium).toBe(false);
  });
});
```

`hooks/__tests__/useEntitlementSync.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "../../types";

// vi.mock 팩토리는 파일 맨 위로 끌어올려지므로, 팩토리가 즉시 읽는 값은 vi.hoisted로 만든다.
const { user, unsubscribe, emitter } = vi.hoisted(() => ({
  user: { uid: "user-1", getIdTokenResult: vi.fn(), getIdToken: vi.fn() },
  unsubscribe: vi.fn(),
  emitter: { emit: null as ((e: Entitlement) => void) | null },
}));
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: user }, googleProvider: {} }));
vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));
vi.mock("../../api", () => ({
  entitlementQueryKey: (uid: string | undefined) => ["entitlement", uid] as const,
  subscribeEntitlement: vi.fn((_uid: string, onNext: (e: Entitlement) => void) => {
    emitter.emit = onNext;
    return unsubscribe;
  }),
}));

import { useEntitlementSync, syncClaimWithEntitlement } from "../useEntitlementSync";

const UNTIL = "2026-11-13T00:00:00.000Z";
const UNTIL_SEC = Math.floor(Date.parse(UNTIL) / 1000);

describe("syncClaimWithEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("문서와 클레임이 다르면 토큰을 강제 갱신한다", async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: {} });
    await syncClaimWithEntitlement({ ...DEFAULT_ENTITLEMENT, premiumUntil: UNTIL });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });

  it("같으면 갱신하지 않는다(무한 갱신 방지)", async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { premiumUntil: UNTIL_SEC } });
    await syncClaimWithEntitlement({ ...DEFAULT_ENTITLEMENT, premiumUntil: UNTIL });
    expect(user.getIdToken).not.toHaveBeenCalled();
  });

  it("문서 premiumUntil이 null이고 클레임이 0/없음이면 같은 것으로 본다", async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { premiumUntil: 0 } });
    await syncClaimWithEntitlement(DEFAULT_ENTITLEMENT);
    user.getIdTokenResult.mockResolvedValue({ claims: {} });
    await syncClaimWithEntitlement(DEFAULT_ENTITLEMENT);
    expect(user.getIdToken).not.toHaveBeenCalled();
  });
});

describe("useEntitlementSync", () => {
  it("스냅샷을 쿼리 캐시에 넣고 언마운트 시 구독을 해제한다", async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { premiumUntil: UNTIL_SEC } });
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { unmount } = renderHook(() => useEntitlementSync(), { wrapper });

    emitter.emit?.({ ...DEFAULT_ENTITLEMENT, premiumUntil: UNTIL });
    await waitFor(() =>
      expect(queryClient.getQueryData(["entitlement", "user-1"])).toMatchObject({ premiumUntil: UNTIL }),
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
```

`api/__tests__/entitlementApi.test.ts`:
- 상단 `vi.mock("firebase/firestore", …)` 팩토리에 `onSnapshot: vi.fn()`을 추가한다(새 import 때문에 없으면 undefined export 오류).
- 기존 두 테스트의 기대 객체에 새 필드(`premiumUntil: null`, `trialUsedAt: null`, `cancelAt: null`, `lastEventOccurredAt: null`)를 추가한다.
- `describe("getEntitlement")` 안에 아래 테스트를 추가한다.

```ts
  it("문서의 새 필드를 그대로 읽고 없으면 null로 채운다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ plan: "premium", status: "trialing", premiumUntil: "2026-10-17T00:00:00.000Z", trialUsedAt: "2026-10-10T00:00:00.000Z" }),
    } as never);

    const { getEntitlement } = await import("../entitlementApi");
    const result = await getEntitlement();

    expect(result).toMatchObject({ premiumUntil: "2026-10-17T00:00:00.000Z", trialUsedAt: "2026-10-10T00:00:00.000Z", cancelAt: null });
  });
```

그리고 파일 끝에 `subscribeEntitlement` 테스트를 추가한다.

```ts
describe("subscribeEntitlement", () => {
  it("스냅샷을 정규화해서 넘기고 해제 함수를 돌려준다", async () => {
    const { onSnapshot } = await import("firebase/firestore");
    const off = vi.fn();
    vi.mocked(onSnapshot).mockImplementation(((_ref: unknown, next: (snap: unknown) => void) => {
      next({ exists: () => false });
      return off;
    }) as never);

    const { subscribeEntitlement } = await import("../entitlementApi");
    const onNext = vi.fn();
    const unsubscribe = subscribeEntitlement("user-1", onNext, vi.fn());

    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ plan: "free", premiumUntil: null }));
    expect(unsubscribe).toBe(off);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd client && npx vitest run src/features/entitlement`
Expected: FAIL — `useEntitlementSync` 모듈 없음, 만료 테스트 실패 등

- [ ] **Step 4: 구현**

`api/entitlementApi.ts` 전체:

```ts
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "../types";

const getEntitlementDocRef = (uid: string) => doc(db, "entitlements", uid);

export const entitlementQueryKey = (uid: string | undefined) => ["entitlement", uid] as const;

/**
 * 문서가 없으면 free로 취급한다 — calendarIntegrations 문서가 없을 때 connected: false로
 * 취급하는 기존 관례와 동일. 누락 필드는 기본값으로 채운다(예전 문서 호환).
 */
export const normalizeEntitlement = (data: Partial<Entitlement> | undefined): Entitlement => {
  if (!data) return DEFAULT_ENTITLEMENT;
  const pick = <K extends keyof Entitlement>(key: K): Entitlement[K] => data[key] ?? DEFAULT_ENTITLEMENT[key];
  return {
    plan: pick("plan"),
    status: pick("status"),
    source: pick("source"),
    premiumUntil: pick("premiumUntil"),
    trialUsedAt: pick("trialUsedAt"),
    cancelAt: pick("cancelAt"),
    currentPeriodEnd: pick("currentPeriodEnd"),
    customerId: pick("customerId"),
    subscriptionId: pick("subscriptionId"),
    lastWebhookEventId: pick("lastWebhookEventId"),
    lastEventOccurredAt: pick("lastEventOccurredAt"),
    updatedAt: pick("updatedAt"),
  };
};

export const getEntitlement = async (): Promise<Entitlement> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  const snap = await getDoc(getEntitlementDocRef(uid));
  return normalizeEntitlement(snap.exists() ? (snap.data() as Partial<Entitlement>) : undefined);
};

/** 결제·체험·포털 해지·다른 기기 변경을 모두 같은 경로로 받기 위해 문서를 실시간 구독한다. */
export const subscribeEntitlement = (
  uid: string,
  onNext: (entitlement: Entitlement) => void,
  onError: (error: Error) => void,
): (() => void) =>
  onSnapshot(
    getEntitlementDocRef(uid),
    (snap) => onNext(normalizeEntitlement(snap.exists() ? (snap.data() as Partial<Entitlement>) : undefined)),
    onError,
  );
```

`api/index.ts`:

```ts
export { getEntitlement, subscribeEntitlement, normalizeEntitlement, entitlementQueryKey } from "./entitlementApi";
```

`hooks/useEntitlement.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { auth } from "@/shared/lib/firebase";
import { getEntitlement, entitlementQueryKey } from "../api";

export const useEntitlement = () => {
  const uid = auth.currentUser?.uid;
  return useQuery({
    queryKey: entitlementQueryKey(uid),
    queryFn: getEntitlement,
    enabled: !!uid,
    // 최신 값은 useEntitlementSync(onSnapshot)가 캐시에 밀어 넣으므로 다시 요청할 필요가 없다.
    staleTime: Infinity,
  });
};
```

`hooks/useIsPremium.ts`:

```ts
import { useEffect, useState } from "react";
import { isPremiumEntitlement } from "../utils/isPremiumEntitlement";
import { useEntitlement } from "./useEntitlement";

/** setTimeout 지연 상한(약 24.8일). 그보다 먼 만료는 그때 가서 다시 렌더될 일이 생긴다. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * 소비 측(캘린더 연동, 인사이트 등)이 entitlements 문서 구조를 몰라도 되도록 boolean만 노출한다.
 * 로딩 중에는 isLoading으로 구분해 "잠김"이 잘못 확정 노출되는 걸 막는다.
 * 만료 시각이 지나면 아무 이벤트 없이도 잠기도록 그 시점에 한 번 다시 렌더한다.
 */
export const useIsPremium = () => {
  const { data, isLoading } = useEntitlement();
  const [, setTick] = useState(0);
  const until = data?.premiumUntil ? Date.parse(data.premiumUntil) : null;

  useEffect(() => {
    if (until === null) return;
    const delay = until - Date.now();
    if (delay <= 0 || delay > MAX_TIMEOUT_MS) return;
    const id = setTimeout(() => setTick((tick) => tick + 1), delay + 1);
    return () => clearTimeout(id);
  }, [until]);

  return { isPremium: isPremiumEntitlement(data, Date.now()), isLoading };
};
```

`hooks/useEntitlementSync.ts`:

```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { auth } from "@/shared/lib/firebase";
import { entitlementQueryKey, subscribeEntitlement } from "../api";
import type { Entitlement } from "../types";

const toClaimSeconds = (premiumUntil: string | null): number =>
  premiumUntil === null ? 0 : Math.floor(Date.parse(premiumUntil) / 1000);

/**
 * 문서와 ID 토큰의 premiumUntil 클레임이 다르면 토큰을 강제 갱신한다. 이게 없으면 결제 직후에도
 * 서버(rules·Worker)는 토큰이 자연 갱신될 때까지(최대 1시간) 예전 권한으로 판단한다.
 * 스냅샷이 올 때만 비교하므로 클레임 쓰기가 실패해도 갱신이 무한 반복되지 않는다.
 */
export const syncClaimWithEntitlement = async (entitlement: Entitlement): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  const { claims } = await user.getIdTokenResult();
  const current = typeof claims.premiumUntil === "number" ? claims.premiumUntil : 0;
  if (current !== toClaimSeconds(entitlement.premiumUntil)) await user.getIdToken(true);
};

/** 인증 레이아웃(App)에서 1회 마운트한다. */
export const useEntitlementSync = () => {
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    return subscribeEntitlement(
      uid,
      (entitlement) => {
        queryClient.setQueryData(entitlementQueryKey(uid), entitlement);
        syncClaimWithEntitlement(entitlement).catch((error) =>
          Sentry.captureException(error, { tags: { feature: "entitlement" } }),
        );
      },
      (error) => Sentry.captureException(error, { tags: { feature: "entitlement" } }),
    );
  }, [uid, queryClient]);
};
```

`hooks/index.ts`에 `export { useEntitlementSync } from "./useEntitlementSync";` 추가.
`features/entitlement/index.ts`의 첫 줄을 `export { useEntitlement, useIsPremium, useUpgradeInterest, useEntitlementSync } from "./hooks";`로 바꾸고 다음을 추가:

```ts
export { isPremiumEntitlement } from "./utils/isPremiumEntitlement";
export type { EntitlementSource } from "./types";
```

`App.tsx`: import에 `import { useEntitlementSync } from "@/features/entitlement/hooks/useEntitlementSync";`(App 청크 크리티컬 패스라 배럴 대신 직접 경로)를 추가하고 `useNotificationClickNavigation();` 다음 줄에 `useEntitlementSync();`를 추가.

`client/CLAUDE.md` 데이터 모델의 Entitlement 문단 전체를 교체:

```markdown
`Entitlement`(구독/플랜 상태) 타입 정의는 `client/src/features/entitlement/types/entitlement.type.ts` 참고. `entitlements/{uid}` 문서가 없으면 free로 취급하고(백필 불필요), 클라이언트는 이 컬렉션에 쓸 수 없다(firestore.rules `write: if false`). 쓰기는 결제 Worker(`billing-proxy`: Paddle 웹훅·7일 체험)와 운영자 스크립트(`npm run grant:entitlement -- --uid <uid> --plan premium|free [--until <ISO>]`)만 하며, 둘 다 문서와 Firebase Auth 커스텀 클레임 `premiumUntil`(epoch 초)을 함께 설정한다. 프리미엄 판단은 어디서나 `premiumUntil > 지금` 하나다 — `firestore.rules`·Worker는 클레임으로, 클라이언트는 문서로 판단한다. 앱 루트의 `useEntitlementSync`가 문서를 실시간 구독하다 클레임과 다르면 ID 토큰을 강제 갱신하므로, 열려 있는 클라이언트에서는 결제 직후 바로 반영된다. 프리미엄 여부는 `useIsPremium()` 훅으로만 확인하고, 다른 기능에서 `plan`/`status` 필드로 판단하지 않는다.
```

- [ ] **Step 5: 통과 확인**

Run: `cd client && npx vitest run src/features/entitlement && npx tsc -b`
Expected: PASS. tsc가 다른 곳에서 `Entitlement` 리터럴 누락 필드로 실패하면 그 자리에 새 필드를 `null`로 채운다.

- [ ] **Step 6: Commit**

```bash
git add client/src/features/entitlement client/src/App.tsx client/CLAUDE.md
git commit -m "feat(entitlement): 문서 실시간 구독과 premiumUntil 기준 판단, 클레임 즉시 갱신

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 클라이언트 결제 기반 — 설정, API, Paddle 로더, 결제·체험·포털 훅, CTA

**Files:**
- Create: `client/src/features/billing/config.ts`, `client/src/features/billing/api/billingApi.ts`, `client/src/features/billing/lib/paddle.ts`, `client/src/features/billing/hooks/useCheckout.ts`, `client/src/features/billing/hooks/useStartTrial.ts`, `client/src/features/billing/hooks/useOpenPortal.ts`, `client/src/features/billing/hooks/index.ts`
- Create: `client/src/features/entitlement/hooks/usePremiumCta.ts`
- Modify: `client/src/features/entitlement/hooks/index.ts`, `client/src/features/entitlement/index.ts`
- Modify: `client/src/features/aiPlan/components/aiPlanModal.tsx:~30,128-135`, `client/src/features/calendarIntegration/components/calendarConnectionButton.tsx:~16,94-97`, `client/src/features/insights/pages/insightsPage.tsx:22,75-76`
- Modify: `client/src/layouts/profileMenu/profileMenu.tsx`
- Modify: `client/.env.example`, `.github/workflows/ci.yml`(deploy job env)
- Test: `client/src/features/billing/api/__tests__/billingApi.test.ts`, `client/src/features/billing/hooks/__tests__/useCheckout.test.tsx`, `client/src/features/entitlement/hooks/__tests__/usePremiumCta.test.tsx`

**Interfaces:**
- Consumes: Worker HTTP 계약(Task 6), `useEntitlement`, `isPremiumEntitlement`, `useToast`, `authorizedFetch`
- Produces:
  - `BILLING_ENABLED: boolean`, `BILLING_PROXY_URL: string`, `PADDLE_CLIENT_TOKEN: string`, `PADDLE_ENV: "sandbox" | "production"`, `PREMIUM_MONTHLY_PRICE_LABEL: string`
  - `class BillingApiError extends Error { status: number; code: string | null }`
  - `createCheckout(): Promise<string>`, `startTrial(): Promise<{ premiumUntil: string }>`, `createPortalUrl(): Promise<string>`
  - `loadPaddle(): Promise<PaddleJs>`, `onPaddleEvent(listener: (event: { name: string }) => void): () => void`
  - `type CheckoutPhase = "idle" | "opening" | "confirming" | "slow"`, `CONFIRM_SLOW_MS = 30_000`, `useCheckout(): { phase: CheckoutPhase; start: () => Promise<void> }`
  - `useStartTrial(): UseMutationResult<…>`, `useOpenPortal(): UseMutationResult<…>`
  - `usePremiumCta(featureLabel: string): { ctaLabel: string; onCtaClick: () => void }`

- [ ] **Step 1: 설정·API·로더 작성**

`billing/config.ts`:

```ts
/**
 * 진입점(잠금 안내 CTA·프로필 메뉴) 노출 여부. 운영 빌드에서는 실결제 전환 전까지 끈다.
 * 꺼져 있어도 /premium 라우트는 열려 있다 — 허용 목록 계정이 운영에서 샌드박스 결제를 확인하는 길.
 */
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === "true";
export const BILLING_PROXY_URL = (import.meta.env.VITE_BILLING_PROXY_URL as string | undefined) ?? "";
export const PADDLE_CLIENT_TOKEN = (import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined) ?? "";
export const PADDLE_ENV: "sandbox" | "production" =
  import.meta.env.VITE_PADDLE_ENV === "production" ? "production" : "sandbox";
/** 표시용. 실제 청구 금액은 billing-proxy의 PADDLE_PRICE_ID가 정한다 — Paddle 가격을 바꾸면 함께 바꾼다. */
export const PREMIUM_MONTHLY_PRICE_LABEL = "월 3,900원";
```

`billing/api/billingApi.ts`:

```ts
import { authorizedFetch } from "@/shared/lib/authorizedFetch";
import { BILLING_PROXY_URL } from "../config";

export class BillingApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`billing-proxy 요청 실패 (${status}${code ? ` ${code}` : ""})`);
    this.name = "BillingApiError";
  }
}

const post = async <T>(path: string): Promise<T> => {
  if (!BILLING_PROXY_URL) throw new BillingApiError(0, "NOT_CONFIGURED");
  const res = await authorizedFetch(BILLING_PROXY_URL, path, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new BillingApiError(res.status, body?.error ?? null);
  }
  return (await res.json()) as T;
};

export const createCheckout = async (): Promise<string> =>
  (await post<{ transactionId: string }>("/checkout")).transactionId;

export const startTrial = (): Promise<{ premiumUntil: string }> => post("/trial");

export const createPortalUrl = async (): Promise<string> => (await post<{ url: string }>("/portal")).url;
```

`billing/lib/paddle.ts`:

```ts
import { PADDLE_CLIENT_TOKEN, PADDLE_ENV } from "../config";

const PADDLE_SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

export interface PaddleEvent {
  name: string;
}

export interface PaddleJs {
  Environment: { set: (env: "sandbox") => void };
  Initialize: (options: { token: string; eventCallback: (event: PaddleEvent) => void }) => void;
  Checkout: { open: (options: { transactionId: string }) => void; close: () => void };
}

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

const listeners = new Set<(event: PaddleEvent) => void>();
let loading: Promise<PaddleJs> | null = null;

/** Paddle.Initialize는 한 번만 부를 수 있어 이벤트를 여기서 받아 구독자들에게 나눠 준다. */
export const onPaddleEvent = (listener: (event: PaddleEvent) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 결제 버튼을 누른 순간에만 스크립트를 받는다 — 결제하지 않는 사용자의 번들 비용은 0이다. */
export const loadPaddle = (): Promise<PaddleJs> => {
  if (loading) return loading;
  loading = new Promise<PaddleJs>((resolve, reject) => {
    if (!PADDLE_CLIENT_TOKEN) {
      reject(new Error("VITE_PADDLE_CLIENT_TOKEN이 설정되지 않았습니다"));
      return;
    }
    const script = document.createElement("script");
    script.src = PADDLE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const paddle = window.Paddle;
      if (!paddle) {
        reject(new Error("Paddle.js 로드 후 window.Paddle이 없습니다"));
        return;
      }
      if (PADDLE_ENV === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({
        token: PADDLE_CLIENT_TOKEN,
        eventCallback: (event) => listeners.forEach((listener) => listener(event)),
      });
      resolve(paddle);
    };
    script.onerror = () => reject(new Error("Paddle.js를 불러오지 못했습니다"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null; // 다음 클릭에서 다시 시도할 수 있게
    throw error;
  });
  return loading;
};
```

- [ ] **Step 2: 테스트 작성**

`billing/api/__tests__/billingApi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config", () => ({ BILLING_PROXY_URL: "https://billing.example" }));
vi.mock("@/shared/lib/authorizedFetch", () => ({ authorizedFetch: vi.fn() }));

import { authorizedFetch } from "@/shared/lib/authorizedFetch";
import { BillingApiError, createCheckout, createPortalUrl, startTrial } from "../billingApi";

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("billingApi", () => {
  beforeEach(() => vi.mocked(authorizedFetch).mockReset());

  it("createCheckout은 본문 없이 POST하고 transactionId를 돌려준다", async () => {
    vi.mocked(authorizedFetch).mockResolvedValue(jsonRes({ transactionId: "txn_1" }));
    await expect(createCheckout()).resolves.toBe("txn_1");
    expect(authorizedFetch).toHaveBeenCalledWith("https://billing.example", "/checkout", { method: "POST" });
  });

  it("오류 응답은 status와 code가 담긴 BillingApiError", async () => {
    vi.mocked(authorizedFetch).mockResolvedValue(jsonRes({ error: "NOT_ALLOWED" }, 403));
    await expect(startTrial()).rejects.toMatchObject({ status: 403, code: "NOT_ALLOWED" });
    vi.mocked(authorizedFetch).mockResolvedValue(new Response("boom", { status: 500 }));
    const error = await createPortalUrl().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BillingApiError);
    expect(error).toMatchObject({ status: 500, code: null });
  });
});
```

`billing/hooks/__tests__/useCheckout.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "@/features/entitlement/types";

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock("@/shared", () => ({ useToast: () => toast }));
vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

let entitlement: Entitlement = DEFAULT_ENTITLEMENT;
vi.mock("@/features/entitlement/hooks/useEntitlement", () => ({ useEntitlement: () => ({ data: entitlement }) }));

vi.mock("../../api/billingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/billingApi")>()),
  createCheckout: vi.fn(),
}));

let emitPaddle: ((e: { name: string }) => void) | null = null;
const paddle = { Checkout: { open: vi.fn(), close: vi.fn() } };
vi.mock("../../lib/paddle", () => ({
  loadPaddle: vi.fn(async () => paddle),
  onPaddleEvent: vi.fn((listener: (e: { name: string }) => void) => {
    emitPaddle = listener;
    return () => {
      emitPaddle = null;
    };
  }),
}));

import { BillingApiError, createCheckout } from "../../api/billingApi";
import { CONFIRM_SLOW_MS, useCheckout } from "../useCheckout";

const NOW = new Date("2026-10-10T00:00:00.000Z");

describe("useCheckout", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    entitlement = DEFAULT_ENTITLEMENT;
    vi.mocked(createCheckout).mockResolvedValue("txn_1");
  });
  afterEach(() => vi.useRealTimers());

  it("연타해도 /checkout은 한 번만 부른다", async () => {
    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      void result.current.start();
      void result.current.start();
    });
    expect(createCheckout).toHaveBeenCalledTimes(1);
    expect(paddle.Checkout.open).toHaveBeenCalledWith({ transactionId: "txn_1" });
  });

  it("결제 완료 → 확인 중 → 문서가 active가 되면 성공 토스트", async () => {
    const { result, rerender } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitPaddle?.({ name: "checkout.completed" }));
    expect(result.current.phase).toBe("confirming");
    expect(paddle.Checkout.close).toHaveBeenCalled();

    entitlement = { ...DEFAULT_ENTITLEMENT, status: "active", source: "paddle", premiumUntil: "2026-11-13T00:00:00.000Z" };
    rerender();
    expect(result.current.phase).toBe("idle");
    expect(toast.success).toHaveBeenCalledWith("프리미엄이 시작됐어요", expect.any(String));
  });

  it("30초 안에 반영되지 않으면 slow로 바뀌고 실패로 끝내지 않는다", async () => {
    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitPaddle?.({ name: "checkout.completed" }));
    await act(async () => {
      vi.advanceTimersByTime(CONFIRM_SLOW_MS + 1);
    });
    expect(result.current.phase).toBe("slow");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("결제창을 닫으면 idle로 돌아간다", async () => {
    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitPaddle?.({ name: "checkout.closed" }));
    expect(result.current.phase).toBe("idle");
  });

  it("403 NOT_ALLOWED면 준비 중 안내, 그 외 오류는 실패 토스트", async () => {
    vi.mocked(createCheckout).mockRejectedValueOnce(new BillingApiError(403, "NOT_ALLOWED"));
    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    expect(toast.info).toHaveBeenCalledWith("아직 준비 중이에요", expect.any(String));
    expect(result.current.phase).toBe("idle");

    vi.mocked(createCheckout).mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      await result.current.start();
    });
    expect(toast.error).toHaveBeenCalledWith("결제창을 열지 못했어요", expect.any(String));
  });
});
```

`entitlement/hooks/__tests__/usePremiumCta.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

vi.mock("../useUpgradeInterest", () => ({ useUpgradeInterest: () => ({ submitInterest: vi.fn(), isPending: false }) }));

import { useInterestCta, useNavigateToPremiumCta } from "../usePremiumCta";

describe("usePremiumCta", () => {
  it("결제가 꺼져 있을 때 쓰는 구현은 기존 '관심 있어요'", () => {
    const { result } = renderHook(() => useInterestCta("구글 캘린더 연동 기능"));
    expect(result.current.ctaLabel).toBe("관심 있어요");
  });

  it("결제가 켜져 있을 때 쓰는 구현은 /premium으로 이동", () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={["/insights"]}>{children}</MemoryRouter>;
    const { result } = renderHook(() => ({ cta: useNavigateToPremiumCta("통계"), location: useLocation() }), { wrapper });
    expect(result.current.cta.ctaLabel).toBe("프리미엄 알아보기");
    act(() => result.current.cta.onCtaClick());
    expect(result.current.location.pathname).toBe("/premium");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd client && npx vitest run src/features/billing src/features/entitlement/hooks/__tests__/usePremiumCta.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 훅 구현**

`billing/hooks/useCheckout.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared";
import { useEntitlement } from "@/features/entitlement/hooks/useEntitlement";
import { isPremiumEntitlement } from "@/features/entitlement/utils/isPremiumEntitlement";
import { BillingApiError, createCheckout } from "../api/billingApi";
import { loadPaddle, onPaddleEvent } from "../lib/paddle";

export type CheckoutPhase = "idle" | "opening" | "confirming" | "slow";
/** 이 시간 안에 웹훅이 반영되지 않으면 안내 문구를 바꾼다(실패로 처리하지는 않는다). */
export const CONFIRM_SLOW_MS = 30_000;

export const useCheckout = () => {
  const toast = useToast();
  const { data: entitlement } = useEntitlement();
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  // 상태 업데이트는 비동기라 같은 틱의 연타를 막지 못한다. ref로 즉시 잠근다.
  const busyRef = useRef(false);

  const subscribed =
    entitlement?.status === "active" &&
    entitlement.source === "paddle" &&
    isPremiumEntitlement(entitlement, Date.now());

  useEffect(() => {
    if ((phase === "confirming" || phase === "slow") && subscribed) {
      busyRef.current = false;
      setPhase("idle");
      toast.success("프리미엄이 시작됐어요", "이제 모든 프리미엄 기능을 쓸 수 있어요");
    }
  }, [phase, subscribed, toast]);

  useEffect(() => {
    if (phase !== "confirming") return;
    const id = setTimeout(() => setPhase("slow"), CONFIRM_SLOW_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const start = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase("opening");
    try {
      const transactionId = await createCheckout();
      const paddle = await loadPaddle();
      const off = onPaddleEvent((event) => {
        if (event.name === "checkout.completed") {
          off();
          paddle.Checkout.close();
          setPhase("confirming");
        } else if (event.name === "checkout.closed") {
          off();
          busyRef.current = false;
          setPhase("idle");
        }
      });
      paddle.Checkout.open({ transactionId });
    } catch (error) {
      busyRef.current = false;
      setPhase("idle");
      if (error instanceof BillingApiError && error.code === "NOT_ALLOWED") {
        toast.info("아직 준비 중이에요", "곧 구독을 열어드릴게요");
      } else if (error instanceof BillingApiError && error.code === "ALREADY_SUBSCRIBED") {
        toast.info("이미 구독 중이에요", "구독 관리에서 확인할 수 있어요");
      } else {
        toast.error("결제창을 열지 못했어요", "잠시 후 다시 시도해주세요");
        Sentry.captureException(error, { tags: { feature: "billing" } });
      }
    }
  };

  return { phase, start };
};
```

`billing/hooks/useStartTrial.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared";
import { BillingApiError, startTrial } from "../api/billingApi";

/** 성공 후 화면 전환은 useEntitlementSync(onSnapshot)가 처리한다 — 여기서 캐시를 직접 고치지 않는다. */
export const useStartTrial = () => {
  const toast = useToast();
  return useMutation({
    mutationFn: startTrial,
    onSuccess: () => toast.success("7일 무료 체험이 시작됐어요", "모든 프리미엄 기능을 써보세요"),
    onError: (error) => {
      if (error instanceof BillingApiError && error.code === "NOT_ALLOWED") {
        toast.info("아직 준비 중이에요", "곧 체험을 열어드릴게요");
      } else if (error instanceof BillingApiError && error.status === 409) {
        toast.info("이미 체험을 사용했어요", "구독하면 계속 이용할 수 있어요");
      } else {
        toast.error("체험을 시작하지 못했어요", "잠시 후 다시 시도해주세요");
        Sentry.captureException(error, { tags: { feature: "billing" } });
      }
    },
  });
};
```

`billing/hooks/useOpenPortal.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared";
import { createPortalUrl } from "../api/billingApi";

/** 비동기 호출 뒤 새 창을 열면 팝업 차단에 걸리므로 같은 탭에서 Paddle 포털로 이동한다. */
export const useOpenPortal = () => {
  const toast = useToast();
  return useMutation({
    mutationFn: createPortalUrl,
    onSuccess: (url) => window.location.assign(url),
    onError: (error) => {
      toast.error("구독 관리 화면을 열지 못했어요", "잠시 후 다시 시도해주세요");
      Sentry.captureException(error, { tags: { feature: "billing" } });
    },
  });
};
```

`billing/hooks/index.ts`:

```ts
export { useCheckout, CONFIRM_SLOW_MS, type CheckoutPhase } from "./useCheckout";
export { useStartTrial } from "./useStartTrial";
export { useOpenPortal } from "./useOpenPortal";
```

`entitlement/hooks/usePremiumCta.ts`:

```ts
import { useNavigate } from "react-router-dom";
import { BILLING_ENABLED } from "@/features/billing/config";
import { useUpgradeInterest } from "./useUpgradeInterest";

interface PremiumCta {
  ctaLabel: string;
  onCtaClick: () => void;
}

/** 결제 전: 피드백 채널에 관심을 남긴다(수요 파악용). */
export const useInterestCta = (featureLabel: string): PremiumCta => {
  const { submitInterest } = useUpgradeInterest(featureLabel);
  return { ctaLabel: "관심 있어요", onCtaClick: submitInterest };
};

/** 결제 후: 프리미엄 페이지로 보낸다. */
export const useNavigateToPremiumCta = (_featureLabel: string): PremiumCta => {
  const navigate = useNavigate();
  return { ctaLabel: "프리미엄 알아보기", onCtaClick: () => navigate("/premium") };
};

/**
 * 잠금 안내 3곳(AI 플랜·캘린더 연동·통계)이 공유하는 CTA. 빌드 시점 상수로 구현을 고르므로
 * 렌더마다 같은 훅이 호출되어 훅 규칙을 지킨다. 결제가 꺼진 빌드는 라우터 없이도 동작한다
 * (기존 컴포넌트 테스트가 MemoryRouter 없이 렌더한다).
 */
export const usePremiumCta: (featureLabel: string) => PremiumCta = BILLING_ENABLED
  ? useNavigateToPremiumCta
  : useInterestCta;
```

`entitlement/hooks/index.ts`에 `export { usePremiumCta } from "./usePremiumCta";`, `entitlement/index.ts` 첫 줄 export 목록에 `usePremiumCta` 추가.

- [ ] **Step 5: 호출부 3곳 교체**

각 파일에서 `useUpgradeInterest` 대신 `usePremiumCta`를 import·호출하고 `ctaLabel="관심 있어요"` / `onCtaClick={submitInterest}`를 반환값으로 바꾼다. 예시(`insightsPage.tsx`):

```tsx
import { useIsPremium, usePremiumCta, PremiumGate, PremiumLockedNotice } from "@/features/entitlement";
// …
  const premiumCta = usePremiumCta("완료 통계/인사이트 기능");
// …
            <PremiumLockedNotice
              title="완료 통계는 프리미엄 기능입니다"
              description="완료율, 연속 달성일, 우선순위별 분포 등 나만의 생산성 인사이트를 확인하려면 프리미엄 구독이 필요합니다"
              ctaLabel={premiumCta.ctaLabel}
              onCtaClick={premiumCta.onCtaClick}
            />
```

`aiPlanModal.tsx`와 `calendarConnectionButton.tsx`도 같은 방식으로(기존 `useUpgradeInterest(...)`에 넘기던 featureLabel 문자열을 그대로 `usePremiumCta`에 넘긴다). `calendarConnectionButton.tsx:95`의 description "양방향으로 동기화하려면"은 실제 동작(단방향)과 다르므로 "할 일을 구글 캘린더에 동기화하려면 프리미엄 구독이 필요합니다"로 고친다(해당 테스트에 이 문구 단언이 있으면 함께 수정).

- [ ] **Step 6: 프로필 메뉴 항목** — `profileMenu.tsx`

```tsx
import { useNavigate } from "react-router-dom";
import { BILLING_ENABLED } from "@/features/billing/config";
// …

/** 결제가 켜진 빌드에서만 렌더한다 — 꺼진 빌드의 기존 테스트가 라우터 없이 렌더하므로 useNavigate를 격리한다. */
const PremiumMenuRow = ({ onNavigate }: { onNavigate: () => void }) => {
  const navigate = useNavigate();
  return (
    <MenuRow
      onClick={() => {
        onNavigate();
        navigate("/premium");
      }}
    >
      프리미엄
    </MenuRow>
  );
};
```

`<MenuList>` 안 로그아웃 위에 `{BILLING_ENABLED && <PremiumMenuRow onNavigate={close} />}` 추가.

- [ ] **Step 7: 환경변수**

`client/.env.example` 끝에 추가:

```
# 결제(billing-proxy + Paddle). VITE_BILLING_ENABLED=true일 때만 잠금 안내·프로필 메뉴에 진입점이 보인다.
# 운영 빌드는 실결제 전환 전까지 비워 둔다(/premium은 URL로 직접 접근 가능, 허용 목록 밖이면 "준비 중").
VITE_BILLING_ENABLED=
VITE_BILLING_PROXY_URL=
# Paddle > Developer tools > Authentication > Client-side token (공개용)
VITE_PADDLE_CLIENT_TOKEN=
# sandbox | production
VITE_PADDLE_ENV=sandbox
```

`.github/workflows/ci.yml`의 deploy job Build env에 추가(`VITE_BILLING_ENABLED`는 의도적으로 넣지 않는다):

```yaml
          VITE_BILLING_PROXY_URL: ${{ secrets.VITE_BILLING_PROXY_URL }}
          VITE_PADDLE_CLIENT_TOKEN: ${{ secrets.VITE_PADDLE_CLIENT_TOKEN }}
          VITE_PADDLE_ENV: sandbox
```

- [ ] **Step 8: 통과 확인**

Run: `cd client && npx vitest run src/features/billing src/features/entitlement src/features/insights src/features/aiPlan src/features/calendarIntegration src/layouts/profileMenu && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add client .github/workflows/ci.yml
git commit -m "feat(billing): 결제·체험·포털 훅과 Paddle.js 지연 로드, 프리미엄 CTA 플래그

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `/premium` 페이지

**Files:**
- Create: `client/src/features/billing/utils/premiumView.ts`, `client/src/features/billing/pages/premiumPage.tsx`, `client/src/features/billing/pages/premiumPage.styles.tsx`
- Modify: `client/src/router.tsx`
- Test: `client/src/features/billing/utils/__tests__/premiumView.test.ts`, `client/src/features/billing/pages/__tests__/premiumPage.test.tsx`

**Interfaces:**
- Consumes: `useEntitlement`, `useCheckout`, `useStartTrial`, `useOpenPortal`, `isPremiumEntitlement`, `PREMIUM_MONTHLY_PRICE_LABEL`
- Produces:
  - `type PremiumView = { kind: "offer"; canTrial: boolean } | { kind: "trialing"; until: Date; daysLeft: number } | { kind: "active"; nextBillingAt: Date | null; canManage: boolean } | { kind: "canceling"; until: Date } | { kind: "pastDue" }`
  - `getPremiumView(entitlement: Entitlement, nowMs: number): PremiumView`
  - `formatMonthDay(date: Date): string`
  - 라우트 `/premium` (보호 라우트, lazy)

- [ ] **Step 1: 화면 상태 계산 테스트** — `billing/utils/__tests__/premiumView.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "@/features/entitlement/types";
import { formatMonthDay, getPremiumView } from "../premiumView";

const NOW = Date.parse("2026-10-10T00:00:00.000Z");
const e = (overrides: Partial<Entitlement>): Entitlement => ({ ...DEFAULT_ENTITLEMENT, ...overrides });

describe("getPremiumView", () => {
  it("비프리미엄, 체험 미사용 → offer(canTrial)", () => {
    expect(getPremiumView(DEFAULT_ENTITLEMENT, NOW)).toEqual({ kind: "offer", canTrial: true });
  });

  it("체험 만료 → offer(체험 불가)", () => {
    expect(getPremiumView(e({ status: "trialing", trialUsedAt: "2026-10-01T00:00:00.000Z", premiumUntil: "2026-10-08T00:00:00.000Z" }), NOW)).toEqual({
      kind: "offer",
      canTrial: false,
    });
  });

  it("체험 중 → 남은 일수(올림)", () => {
    const view = getPremiumView(e({ status: "trialing", trialUsedAt: "2026-10-09T12:00:00.000Z", premiumUntil: "2026-10-16T12:00:00.000Z" }), NOW);
    expect(view).toEqual({ kind: "trialing", until: new Date("2026-10-16T12:00:00.000Z"), daysLeft: 7 });
  });

  it("구독 중 → 다음 결제일, 고객이 있으면 관리 가능", () => {
    const view = getPremiumView(
      e({ status: "active", source: "paddle", premiumUntil: "2026-11-13T00:00:00.000Z", currentPeriodEnd: "2026-11-10T00:00:00.000Z", customerId: "ctm_1" }),
      NOW,
    );
    expect(view).toEqual({ kind: "active", nextBillingAt: new Date("2026-11-10T00:00:00.000Z"), canManage: true });
  });

  it("운영자 부여(manual) → active, 결제일·관리 없음", () => {
    expect(getPremiumView(e({ status: "active", source: "manual", premiumUntil: "2099-12-31T00:00:00.000Z" }), NOW)).toEqual({
      kind: "active",
      nextBillingAt: null,
      canManage: false,
    });
  });

  it("해지 예약 → canceling", () => {
    expect(getPremiumView(e({ status: "active", premiumUntil: "2026-11-10T00:00:00.000Z", cancelAt: "2026-11-10T00:00:00.000Z", customerId: "ctm_1" }), NOW)).toEqual({
      kind: "canceling",
      until: new Date("2026-11-10T00:00:00.000Z"),
    });
  });

  it("past_due는 만료 여부와 무관하게 pastDue", () => {
    expect(getPremiumView(e({ status: "past_due", premiumUntil: "2026-10-01T00:00:00.000Z" }), NOW)).toEqual({ kind: "pastDue" });
  });

  it("해지 완료 → offer", () => {
    expect(getPremiumView(e({ status: "canceled", premiumUntil: "2026-10-09T00:00:00.000Z", trialUsedAt: null }), NOW)).toEqual({
      kind: "offer",
      canTrial: true,
    });
  });
});

describe("formatMonthDay", () => {
  it("로컬 날짜로 표시한다(자정 근처 UTC 값이 로컬 기준으로 바뀌어야 한다)", () => {
    const date = new Date("2026-11-03T15:30:00.000Z");
    expect(formatMonthDay(date)).toBe(`${date.getMonth() + 1}월 ${date.getDate()}일`);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/billing/utils`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `billing/utils/premiumView.ts`

```ts
import type { Entitlement } from "@/features/entitlement/types";
import { isPremiumEntitlement } from "@/features/entitlement/utils/isPremiumEntitlement";

export type PremiumView =
  | { kind: "offer"; canTrial: boolean }
  | { kind: "trialing"; until: Date; daysLeft: number }
  | { kind: "active"; nextBillingAt: Date | null; canManage: boolean }
  | { kind: "canceling"; until: Date }
  | { kind: "pastDue" };

const DAY_MS = 86_400_000;

export const getPremiumView = (entitlement: Entitlement, nowMs: number): PremiumView => {
  // 결제 실패는 이용 가능 여부와 무관하게 결제 수단 변경을 먼저 안내한다.
  if (entitlement.status === "past_due") return { kind: "pastDue" };
  if (!isPremiumEntitlement(entitlement, nowMs)) return { kind: "offer", canTrial: entitlement.trialUsedAt === null };

  const until = new Date(entitlement.premiumUntil as string);
  if (entitlement.status === "trialing") {
    return { kind: "trialing", until, daysLeft: Math.ceil((until.getTime() - nowMs) / DAY_MS) };
  }
  if (entitlement.cancelAt) return { kind: "canceling", until: new Date(entitlement.cancelAt) };
  return {
    kind: "active",
    nextBillingAt: entitlement.currentPeriodEnd ? new Date(entitlement.currentPeriodEnd) : null,
    canManage: entitlement.customerId !== null,
  };
};

/** 로컬 게터로 표시한다 — UTC 문자열을 잘라 쓰면 KST에서 하루 밀린다. */
export const formatMonthDay = (date: Date): string => `${date.getMonth() + 1}월 ${date.getDate()}일`;
```

Run: `cd client && npx vitest run src/features/billing/utils`
Expected: PASS

- [ ] **Step 4: 페이지 테스트** — `billing/pages/__tests__/premiumPage.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "@/features/entitlement/types";

let entitlement: Entitlement | undefined = DEFAULT_ENTITLEMENT;
vi.mock("@/features/entitlement/hooks/useEntitlement", () => ({
  useEntitlement: () => ({ data: entitlement, isLoading: entitlement === undefined }),
}));

const checkout = { phase: "idle" as string, start: vi.fn() };
const trial = { mutate: vi.fn(), isPending: false };
const portal = { mutate: vi.fn(), isPending: false };
vi.mock("../../hooks", () => ({
  useCheckout: () => checkout,
  useStartTrial: () => trial,
  useOpenPortal: () => portal,
}));

import PremiumPage from "../premiumPage";

const NOW = new Date("2026-10-10T00:00:00.000Z");
const set = (overrides: Partial<Entitlement>) => {
  entitlement = { ...DEFAULT_ENTITLEMENT, ...overrides };
};

describe("PremiumPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    entitlement = DEFAULT_ENTITLEMENT;
    checkout.phase = "idle";
  });
  afterEach(() => vi.useRealTimers());

  it("체험 전: 혜택·가격·체험(주)·바로 구독(보조)", () => {
    render(<PremiumPage />);
    expect(screen.getByText("AI 할 일 플랜")).toBeInTheDocument();
    expect(screen.getByText("월 3,900원")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "7일 무료 체험" }));
    expect(trial.mutate).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "바로 구독하기" }));
    expect(checkout.start).toHaveBeenCalled();
  });

  it("체험을 썼으면 체험 버튼이 없다", () => {
    set({ trialUsedAt: "2026-09-01T00:00:00.000Z" });
    render(<PremiumPage />);
    expect(screen.queryByRole("button", { name: "7일 무료 체험" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "구독하기" })).toBeInTheDocument();
  });

  it("체험 중: 남은 일수와 구독하기", () => {
    set({ status: "trialing", trialUsedAt: "2026-10-09T00:00:00.000Z", premiumUntil: "2026-10-16T00:00:00.000Z" });
    render(<PremiumPage />);
    expect(screen.getByText(/6일 남음/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "구독하기" })).toBeInTheDocument();
  });

  it("구독 중: 다음 결제일과 구독 관리", () => {
    set({ status: "active", source: "paddle", premiumUntil: "2026-11-13T00:00:00.000Z", currentPeriodEnd: "2026-11-10T00:00:00.000Z", customerId: "ctm_1" });
    render(<PremiumPage />);
    expect(screen.getByText(/다음 결제일/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "구독 관리" }));
    expect(portal.mutate).toHaveBeenCalled();
  });

  it("해지 예약: 이용 가능 기한", () => {
    set({ status: "active", premiumUntil: "2026-11-10T00:00:00.000Z", cancelAt: "2026-11-10T00:00:00.000Z", customerId: "ctm_1" });
    render(<PremiumPage />);
    expect(screen.getByText(/까지 이용 가능/)).toBeInTheDocument();
  });

  it("결제 실패: 경고와 결제 수단 변경", () => {
    set({ status: "past_due", premiumUntil: "2026-11-13T00:00:00.000Z", customerId: "ctm_1" });
    render(<PremiumPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("결제에 실패했어요");
    fireEvent.click(screen.getByRole("button", { name: "결제 수단 변경" }));
    expect(portal.mutate).toHaveBeenCalled();
  });

  it("결제 확인 중에는 버튼이 비활성이고 안내를 보여준다", () => {
    checkout.phase = "confirming";
    render(<PremiumPage />);
    expect(screen.getByText("결제 확인 중…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "바로 구독하기" })).toBeDisabled();
  });

  it("오래 걸리면 완료 안내로 바뀐다", () => {
    checkout.phase = "slow";
    render(<PremiumPage />);
    expect(screen.getByText(/결제는 완료됐어요/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: 페이지 구현**

`billing/pages/premiumPage.styles.tsx`:

```tsx
import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

export const PremiumContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const PremiumBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
`;

export const Heading = styled.h1`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

export const Card = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.secondary};
`;

export const BenefitList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const Benefit = styled.li`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: ${colors.brand.strong};
`;

export const BenefitText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const BenefitTitle = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

export const BenefitDescription = styled.span`
  font-size: 13px;
  color: ${colors.text.secondary};
`;

export const Price = styled.p`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

export const StatusText = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${colors.text.primary};
`;

export const HintText = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.text.secondary};
`;

export const Warning = styled.div`
  padding: 12px;
  border-radius: ${radius.md};
  background-color: ${colors.danger.background};
  color: ${colors.danger.text};
  font-size: 14px;
  font-weight: 600;
`;

export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const BaseButton = styled.button`
  min-height: 44px;
  padding: 0 16px;
  border-radius: ${radius.md};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const PrimaryButton = styled(BaseButton)`
  border: none;
  background-color: ${colors.brand.strong};
  color: #fff;

  &:hover:not(:disabled) {
    background-color: ${colors.brand.strongHover};
  }
`;

export const SecondaryButton = styled(BaseButton)`
  border: 1px solid ${colors.border.secondary};
  background-color: transparent;
  color: ${colors.text.primary};
`;
```

(흰 글자 `#fff`는 기존 brand.strong 솔리드 버튼들과 같은 관례다. 다른 파일이 흰색을 토큰으로 쓰고 있으면 그 토큰으로 바꾼다 — `git grep -n "brand.strong" client/src -- '*.styles.tsx' | head`로 확인.)

`billing/pages/premiumPage.tsx`:

```tsx
import { BarChart3, CalendarDays, Sparkles, type LucideIcon } from "lucide-react";
import { useEntitlement } from "@/features/entitlement/hooks/useEntitlement";
import { DEFAULT_ENTITLEMENT } from "@/features/entitlement/types";
import { PREMIUM_MONTHLY_PRICE_LABEL } from "../config";
import { useCheckout, useOpenPortal, useStartTrial } from "../hooks";
import { formatMonthDay, getPremiumView } from "../utils/premiumView";
import {
  Actions,
  Benefit,
  BenefitDescription,
  BenefitList,
  BenefitText,
  BenefitTitle,
  Card,
  Heading,
  HintText,
  PremiumBody,
  PremiumContainer,
  Price,
  PrimaryButton,
  SecondaryButton,
  StatusText,
  Warning,
} from "./premiumPage.styles";

const BENEFITS: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Sparkles, title: "AI 할 일 플랜", description: "목표를 적으면 실행 단계와 날짜를 나눠 제안해요" },
  { icon: CalendarDays, title: "구글 캘린더 연동", description: "할 일을 구글 캘린더에 동기화해요" },
  { icon: BarChart3, title: "완료 통계", description: "완료율·연속 달성일·우선순위 분포를 확인해요" },
];

const PremiumPage = () => {
  const { data, isLoading } = useEntitlement();
  const checkout = useCheckout();
  const trial = useStartTrial();
  const portal = useOpenPortal();

  if (isLoading) return null;

  const view = getPremiumView(data ?? DEFAULT_ENTITLEMENT, Date.now());
  const checkoutBusy = checkout.phase !== "idle";
  const busy = checkoutBusy || trial.isPending || portal.isPending;

  const renderStatus = () => {
    switch (view.kind) {
      case "offer":
        return (
          <Actions>
            {view.canTrial && (
              <PrimaryButton type="button" disabled={busy} onClick={() => trial.mutate()}>
                7일 무료 체험
              </PrimaryButton>
            )}
            {view.canTrial ? (
              <SecondaryButton type="button" disabled={busy} onClick={() => void checkout.start()}>
                바로 구독하기
              </SecondaryButton>
            ) : (
              <PrimaryButton type="button" disabled={busy} onClick={() => void checkout.start()}>
                구독하기
              </PrimaryButton>
            )}
            {view.canTrial && <HintText>체험은 카드 등록 없이 계정당 한 번 쓸 수 있어요</HintText>}
          </Actions>
        );
      case "trialing":
        return (
          <>
            <StatusText>
              {formatMonthDay(view.until)}까지 체험 중 ({view.daysLeft}일 남음)
            </StatusText>
            <PrimaryButton type="button" disabled={busy} onClick={() => void checkout.start()}>
              구독하기
            </PrimaryButton>
            <HintText>지금 구독하면 바로 첫 결제가 되고, 남은 체험 기간은 이어지지 않아요</HintText>
          </>
        );
      case "active":
        return (
          <>
            <StatusText>
              {view.nextBillingAt ? `다음 결제일 ${formatMonthDay(view.nextBillingAt)}` : "프리미엄 이용 중"}
            </StatusText>
            {view.canManage && (
              <SecondaryButton type="button" disabled={busy} onClick={() => portal.mutate()}>
                구독 관리
              </SecondaryButton>
            )}
          </>
        );
      case "canceling":
        return (
          <>
            <StatusText>{formatMonthDay(view.until)}까지 이용 가능</StatusText>
            <SecondaryButton type="button" disabled={busy} onClick={() => portal.mutate()}>
              구독 관리
            </SecondaryButton>
            <HintText>구독 관리에서 해지를 취소할 수 있어요</HintText>
          </>
        );
      case "pastDue":
        return (
          <>
            <Warning role="alert">결제에 실패했어요. 결제 수단을 확인해 주세요</Warning>
            <PrimaryButton type="button" disabled={busy} onClick={() => portal.mutate()}>
              결제 수단 변경
            </PrimaryButton>
          </>
        );
    }
  };

  return (
    <PremiumContainer>
      <PremiumBody>
        <Heading>ToDoDo 프리미엄</Heading>
        <Card>
          <BenefitList>
            {BENEFITS.map(({ icon: Icon, title, description }) => (
              <Benefit key={title}>
                <Icon size={20} aria-hidden="true" />
                <BenefitText>
                  <BenefitTitle>{title}</BenefitTitle>
                  <BenefitDescription>{description}</BenefitDescription>
                </BenefitText>
              </Benefit>
            ))}
          </BenefitList>
          <Price>{PREMIUM_MONTHLY_PRICE_LABEL}</Price>
        </Card>
        <Card aria-live="polite">
          {renderStatus()}
          {checkout.phase === "confirming" && <HintText>결제 확인 중…</HintText>}
          {checkout.phase === "slow" && <HintText>결제는 완료됐어요. 반영까지 잠시 걸릴 수 있어요</HintText>}
        </Card>
      </PremiumBody>
    </PremiumContainer>
  );
};

export default PremiumPage;
```

`router.tsx`: lazy import 추가 후 보호 라우트 children 마지막에 추가.

```tsx
const PremiumPage = lazy(() => import("@/features/billing/pages/premiumPage"));
```

```tsx
      {
        path: "premium",
        element: withSuspense(<PremiumPage />),
      },
```

- [ ] **Step 6: 통과 확인 + 전체 회귀 + 번들 예산**

Run: `cd client && npx vitest run src/features/billing`
Expected: PASS
Run: `cd client && VITE_FIREBASE_API_KEY= npx vitest run && TZ=America/New_York VITE_FIREBASE_API_KEY= npx vitest run`
Expected: 전체 PASS (두 타임존)
Run: `cd client && npx tsc -b && npm run lint && VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 npm run build && npm run check:bundle`
Expected: PASS. 번들 예산 초과 시 `/premium`이나 Paddle 로더가 초기 청크에 들어갔는지 확인한다(라우트는 lazy, Paddle.js는 런타임 script 태그라 번들에 들어가지 않아야 한다).

- [ ] **Step 7: Commit**

```bash
git add client/src/features/billing client/src/router.tsx
git commit -m "feat(billing): 구독 상태별 /premium 페이지

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 샌드박스 실측 확인과 수동 E2E (사용자 사전 작업 필요)

코드 작업이 아니라 검증 체크리스트다. 사용자의 Paddle 샌드박스·GCP 서비스 계정 준비(`billing-proxy/README.md` "배포 준비" 1~3)가 끝난 뒤 진행한다.

- [ ] **Step 1: billing-proxy 프리뷰 업로드** — `cd billing-proxy && npx wrangler versions upload`, 출력된 프리뷰 URL을 샌드박스 Notification 대상으로 임시 등록. 클라이언트는 `client/.env.local`에 `VITE_BILLING_ENABLED=true`, `VITE_BILLING_PROXY_URL=<프리뷰 URL>`, `VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_ENV=sandbox`를 넣고 `npm run dev`.
- [ ] **Step 2: 스펙의 실측 4건 확인** (`npx wrangler tail`이 프리뷰를 지원하지 않으면 Paddle 대시보드 Notifications 로그에서 본문 확인)
  - 거래의 `custom_data.uid`가 `subscription.created` 본문 `data.custom_data`에 들어오는가. **들어오지 않으면 멈추고 보고한다** — `transaction.completed`에서 `subscriptionId → uid` 매핑을 저장하는 후속 태스크가 필요하다.
  - `past_due` 이벤트(시뮬레이터)의 `current_billing_period`가 다음 기간인가 — 어느 쪽이든 `max(기존, ends_at+3일)`이라 동작은 맞지만 결과를 기록한다.
  - 샌드박스 결제창에 KRW 금액과 카카오페이·네이버페이가 보이는가.
  - Paddle 재전송 시 `Paddle-Signature`의 `ts`가 새로 서명되는가(대시보드에서 "Replay"로 확인). 옛 ts로 오면 5분 허용 오차 때문에 401 — 그 경우 허용 오차 재검토.
- [ ] **Step 3: 시나리오** (허용 목록 계정, 360px 모바일 웹 포함)
  1. `/premium` → 바로 구독하기 → 테스트 카드 `4242 4242 4242 4242` → "결제 확인 중…" → 수 초 내 "프리미엄이 시작됐어요" → 새로고침 없이 AI 플랜·캘린더 연동·통계 열림(캘린더 연동은 rules 통과까지 확인).
  2. 구독 관리 → 포털에서 해지 → `/premium`이 "M월 D일까지 이용 가능" → 포털에서 해지 취소 → "다음 결제일".
  3. 별도 계정(허용 목록에 추가) → 7일 무료 체험 → 열림 → 다시 체험 시도 불가 → 체험 중 구독 → active.
  4. 시뮬레이터로 `past_due` → 경고 배너 / `canceled` → 즉시 잠김.
  5. 허용 목록 밖 계정으로 `/premium` 직접 접근 → 버튼 → "아직 준비 중이에요".
- [ ] **Step 4: Rules Playground** — `calendarIntegrations/{uid}` 읽기를 `premiumUntil` = 과거/미래/없음 토큰으로 각각 시뮬레이션(미래만 허용).
- [ ] **Step 5: 결과 보고** — 실측 4건 결과와 시나리오 통과 여부를 사용자에게 보고하고, 문제가 있으면 수정 태스크를 추가한다.

### Task 12: 배포 (사용자 승인 후)

- [ ] **Step 1:** billing-proxy 첫 수동 배포(`npx wrangler deploy`, 사용자 터미널), 운영 Notification 대상 URL을 운영 Worker로 교체, 무토큰 `POST /checkout` → 401 확인.
- [ ] **Step 2:** GitHub Secrets `VITE_BILLING_PROXY_URL`, `VITE_PADDLE_CLIENT_TOKEN` 등록.
- [ ] **Step 3:** develop → main 릴리스 PR 병합 → CI 전 job success 확인(Hosting·rules·ai-proxy·calendar-proxy·reminder-proxy·billing-proxy).
- [ ] **Step 4:** **즉시** `GOOGLE_APPLICATION_CREDENTIALS=… npm run grant:entitlement -- --uid 2pq9Zu8vv1R7WpgN3x0HXnecvix1 --plan premium`으로 본인 계정 재부여(이 사이 수 분간 본인만 잠김).
- [ ] **Step 5:** 운영에서 `/premium` 직접 접근 → 샌드박스 결제 1회 → 반영 확인.
