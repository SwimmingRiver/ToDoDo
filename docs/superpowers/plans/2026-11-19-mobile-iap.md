# 모바일 인앱결제(IAP)·구독 출처 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `entitlements/{uid}`를 출처별 기록(`sources`)과 합친 값으로 바꾸고, billing-proxy가 Apple·Google 구독을 직접 검증·반영하며, 웹·앱이 같은 기준으로 프리미엄을 보여주게 한다.

**Architecture:** 순수 로직(타입·정규화·이주·`aggregate`)은 `@tododo/core`의 `entitlement` 모듈에 두고 billing-proxy·운영자 스크립트·웹·앱이 같이 쓴다. billing-proxy는 출처별 "결정 함수"만 새로 만들고, 쓰기는 기존 `commitEntitlement`(읽기 → 결정 → 클레임 → 사전조건 쓰기)를 그대로 탄다. 앱은 `expo-iap`로 구매하고, 서버 `/iap/*/verify` 응답 후 `getIdToken(true)`로 바로 켠다.

**Tech Stack:** Cloudflare Workers(TypeScript, Vitest), Firestore REST, Firebase Auth 커스텀 클레임, WebCrypto + `@peculiar/x509@1.14.3`(Apple 인증서 체인), App Store Server API / Notifications v2, Google Play Developer API v3 + Pub/Sub 푸시(OIDC), Expo SDK 57 + `expo-iap@6.4.4`, React(웹, Vitest), React Native(Jest).

**Spec:** `docs/superpowers/specs/2026-11-18-mobile-iap-design.md`

## Global Constraints

- `premiumUntil` 유예 = 만료 + `RENEWAL_GRACE_MS`(3일). 해지 예약(자동 갱신 끔)일 때는 유예 없이 만료 시각 그대로다.
- 대표 출처 동률 순서: `paddle > apple > google > manual > trial`.
- 서버(firestore.rules·calendar-proxy·ai-proxy·worker-auth)의 판단 코드는 고치지 않는다. 클레임 이름·단위(`premiumUntil`, epoch 초)도 그대로다.
- 커밋 순서는 "클레임 먼저 → 문서(사전조건) 나중"이다. 새 경로도 모두 `commitEntitlement`를 쓴다.
- 체험은 웹·앱 합쳐 계정당 한 번이다. 기준은 최상위 `trialUsedAt`.
- 상품 id:
  - Apple: `premium_monthly_trial`(7일 무료 소개 혜택), `premium_monthly`(혜택 없음). 같은 구독 그룹에 둔다.
  - Google: 상품 `premium_monthly`, 기본 요금제 `monthly`, 체험 offer `free-trial-7d`.
- 번들 id·패키지명: `com.swimmingriver.tododo`(iOS·Android 같음).
- **앱 안에는 웹 결제를 언급하거나 링크하는 문구를 넣지 않는다**(Apple 3.1.1/3.1.3). Paddle 출처를 앱에서 표시할 때는 "다른 기기나 웹에서 관리할 수 있어요" 수준까지만 쓰고 링크는 넣지 않는다.
- 약관·환불 정책(`client/src/features/legal/**`)은 **Task 19에서만** 고친다(스펙 11절, 11-19 사용자 결정). Task 1~18은 법률 문서를 건드리지 않고, 기존 탈퇴 안내 문구(웹 `SUBSCRIPTION_NOTICE`, 앱 `DELETE_MESSAGE`)에 스토어 경고를 **덧붙이기만** 한다. 문구 정리는 Task 19가 한다.
- 환불·해지 기준은 결제 경로와 무관하게 하나다: **결제일 14일 이내 전액 환불**, 해지 후 결제 기간까지 이용, 체험 계정당 1회. 예외는 Apple 두 가지(환불은 Apple이 결정, 탈퇴로 자동 해지 불가)뿐이다(스펙 11절).
- 시크릿은 코드·커밋·로그에 넣지 않는다. `wrangler secret put`은 사용자가 자기 터미널에서 실행한다.
- 구현 서브에이전트: **git hooks 우회 금지**(`--no-verify` 등 쓰지 않음). 커밋 전 해당 패키지 테스트·타입체크를 돌린다.
- `packages/core`를 바꾸면 `npm run build`로 `dist`를 갱신해서 같이 커밋한다(CI가 dist 차이를 막는다).
- 웹 테스트는 `VITE_FIREBASE_API_KEY= npx vitest run`으로 돌린다(CI와 같은 조건).
- 새 의존성은 정확한 버전으로 고정한다: `@peculiar/x509@1.14.3`, `expo-iap@6.4.4`.

## Review Focus

1. **이미 Paddle로 구독 중인 실사용자 문서(`sources` 없음)** → 배포 후 첫 쓰기(어느 출처든)에서 Paddle 권한이 그대로 살아 있어야 한다. 테스트: Task 1 `migrates legacy paddle doc`, Task 3 `legacy paddle doc + trial request keeps paddle`.
2. **Apple(또는 Google) 구독이 살아 있는 상태에서 Paddle 해지 웹훅이 옴** → 합친 `premiumUntil`은 Apple 기준으로 유지된다. 테스트: Task 3 `paddle cancel keeps apple premium`.
3. **스토어 알림이 앱의 verify 요청보다 먼저 옴(연결 문서 없음)** → 200으로 받고 아무것도 쓰지 않는다. 이어서 verify가 오면 최신 상태로 반영된다. 테스트: Task 9 `webhook before link is a no-op`, Task 12 같은 이름.
4. **TestFlight·심사관 구매(Sandbox 거래)를 운영 서버로 verify** → Production API가 "거래 없음"을 돌려주면 Sandbox API로 다시 조회해서 반영한다. 출처 기록에 `environment: "Sandbox"`가 남는다. 테스트: Task 8 `falls back to sandbox on 404`.
5. **Android 구매 직후 verify가 네트워크 오류로 실패** → 앱이 거래를 finish하지 않는다. 다음 실행 때 같은 토큰으로 다시 verify하면 같은 결과가 나오고(멱등), acknowledge는 아직 안 된 경우에만 한 번 한다. 테스트: Task 12 `re-verify same token is idempotent`, Task 15 `unfinished purchase is re-verified on start`.
6. **Google 구독이 자동 갱신 중인 계정의 탈퇴에서 Play API 해지가 실패** → 아무것도 지우지 않고 502. 토큰(`sources.google.purchaseToken`)을 지운 뒤에는 다시 해지할 방법이 없어, 계정만 사라지고 청구가 계속된다. 테스트: Task 17 `google cancel failure → 502, nothing deleted`.

---

## 파일 구조

| 경로 | 책임 |
|---|---|
| `packages/core/src/entitlement/{types,normalize,aggregate,manual,index}.ts` | 공용 타입, 느슨한 입력 → `EntitlementDoc`(이주 포함), 합치기, 운영자 부여 |
| `billing-proxy/src/entitlement.ts` | core 재수출 + Paddle·체험 결정 함수(기존 파일 유지) |
| `billing-proxy/src/entitlementStore.ts` | 중첩 맵·불리언 Firestore 인코딩 |
| `billing-proxy/src/storeLinks.ts` | `storeLinks` 읽기·쓰기·uid로 삭제 + 연결 판정 |
| `billing-proxy/src/accountToken.ts` | uid → `appAccountToken`(UUID v4 형식) |
| `billing-proxy/src/apple/{jws,rootCa,decide,serverApi}.ts` | JWS 체인 검증, Apple 루트 인증서, 상태 → SourceRecord, App Store Server API |
| `billing-proxy/src/google/{oidc,playApi,decide}.ts` | Pub/Sub 푸시 토큰 검증, Play API, 상태 → SourceRecord |
| `billing-proxy/src/handlers/{iapApple,iapGoogle,accountToken}.ts` | verify·웹훅·토큰 엔드포인트 |
| `scripts/grantEntitlement.ts` | `sources.manual`만 쓰기 |
| `client/src/features/entitlement/**`, `client/src/features/billing/**`, `client/src/features/account/components/accountDeletionDialog.tsx` | 웹 표시·배너·탈퇴 경고 |
| `mobile/src/premium/{entitlementApi,useEntitlement,useEntitlementSync,useIsPremium}.ts` | 앱 구독 상태 읽기 |
| `mobile/src/premium/iap/{purchaseClient,verifyApi,usePurchase,resumePending}.ts` | 앱 구매·복원·미처리 거래 재검증 |
| `mobile/src/premium/PremiumSection.tsx`, `mobile/src/screens/AccountScreen.tsx` | 앱 화면 |
| `billing-proxy/src/handlers/deleteAccount.ts`, `billing-proxy/src/google/playApi.ts` | 탈퇴 시 Google 구독 해지(Task 17) |
| `billing-proxy/src/apple/consumption.ts`, `billing-proxy/src/apple/serverApi.ts` | Apple 환불 요청 회신(Task 18) |
| `client/src/features/legal/**` | 약관·환불·개인정보 문서 개정(Task 19) |

---

### Task 1: core `entitlement` 모듈 (타입·정규화·이주·합치기·운영자 부여)

**Files:**
- Create: `packages/core/src/entitlement/types.ts`, `normalize.ts`, `aggregate.ts`, `manual.ts`, `index.ts`
- Create: `packages/core/src/entitlement/__tests__/normalize.test.ts`, `aggregate.test.ts`, `manual.test.ts`
- Modify: `packages/core/src/index.ts`(재수출 추가는 **하지 않는다**: 서브패스 `@tododo/core/dist/entitlement/index.js`로만 쓴다. firebase 없는 모듈이라 Worker 번들이 가볍다)
- Modify: `billing-proxy/package.json`(`"@tododo/core": "file:../packages/core"` 추가, `npm install`로 lock 갱신)
- Modify: `.github/workflows/ci.yml` `billingProxy` 경로 필터에 `'packages/core/**'` 추가

**Interfaces:**
- Produces (모두 `@tododo/core/dist/entitlement/index.js`에서 export):
  ```ts
  type EntitlementStatus = "none" | "trialing" | "active" | "past_due" | "canceled";
  type SourceKey = "paddle" | "apple" | "google" | "manual" | "trial";
  type PaymentSourceKey = "paddle" | "apple" | "google";
  type EntitlementSource = SourceKey | null;
  type StoreEnvironment = "Production" | "Sandbox";
  interface SourceRecord { status: EntitlementStatus; premiumUntil: string|null; cancelAt: string|null;
    currentPeriodEnd: string|null; autoRenew: boolean; startedAt: string|null; updatedAt: string }
  interface PaddleRecord extends SourceRecord { customerId: string; subscriptionId: string;
    lastWebhookEventId: string|null; lastEventOccurredAt: string|null }
  interface AppleRecord extends SourceRecord { originalTransactionId: string; productId: string;
    environment: StoreEnvironment; appAccountToken: string|null; lastNotificationUUID: string|null; lastSignedDate: string|null }
  interface GoogleRecord extends SourceRecord { purchaseToken: string; productId: string; basePlanId: string|null;
    environment: StoreEnvironment; obfuscatedAccountId: string|null; lastMessageId: string|null; lastEventTime: string|null }
  interface Sources { paddle?: PaddleRecord; apple?: AppleRecord; google?: GoogleRecord; manual?: SourceRecord; trial?: SourceRecord }
  interface DuplicateInfo { laterSource: PaymentSourceKey; detectedAt: string }
  interface EntitlementDoc { /* 기존 12개 필드 그대로 */ plan; status; source: EntitlementSource; premiumUntil; trialUsedAt;
    cancelAt; currentPeriodEnd; customerId; subscriptionId; lastWebhookEventId; lastEventOccurredAt; updatedAt;
    sources: Sources; duplicate: DuplicateInfo | null }
  const EMPTY_ENTITLEMENT: EntitlementDoc;            // sources: {}, duplicate: null
  const RENEWAL_GRACE_MS = 259_200_000; const TRIAL_MS = 604_800_000;
  const SOURCE_PRIORITY: readonly SourceKey[];         // ["paddle","apple","google","manual","trial"]
  normalizeEntitlement(data: unknown): EntitlementDoc;
  aggregate(doc: EntitlementDoc, now: Date): EntitlementDoc;
  applyManual(doc: EntitlementDoc, until: string | null, now: Date): EntitlementDoc;
  isPremiumAt(doc: Pick<EntitlementDoc,"premiumUntil">, now: Date): boolean;
  toClaimSeconds(premiumUntil: string | null): number;
  hasAutoRenewingStoreSubscription(doc: EntitlementDoc, now: Date): "apple" | "google" | null;
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`normalize.test.ts`:
- `returns EMPTY for undefined/null/non-object`
- `fills missing top-level fields with defaults` (예전 문서 호환: `{ plan: "premium", premiumUntil: X }` → 나머지 기본값, `sources` 이주)
- `migrates legacy paddle doc`: `sources` 없고 `source: "paddle", status: "active", premiumUntil: P, cancelAt: null, customerId: "ctm_1", subscriptionId: "sub_1", lastWebhookEventId: "evt_1", lastEventOccurredAt: T` → `sources.paddle`에 같은 값 + `autoRenew: true`, `startedAt: null`. `cancelAt`이 있으면 `autoRenew: false`.
- `migrates legacy trial and manual docs`: `source: "trial"` → `sources.trial`, `source: "manual"` → `sources.manual`(`autoRenew: false`)
- `legacy doc with source null has empty sources`
- `drops unknown source keys and records missing required ids` (`sources.foo` 버림, `sources.apple`에 `originalTransactionId` 없으면 버림)
- `rejects invalid enum values` (`status: "weird"` → `"none"`, `source: "x"` → `null`)

`aggregate.test.ts` (NOW = `2026-12-01T00:00:00.000Z`):
- `no sources → free, premiumUntil null, status none, source null`
- `picks max premiumUntil and its source's status/cancelAt/currentPeriodEnd`
- `tie broken by paddle > apple > google > manual > trial`
- `customerId/subscriptionId/lastWebhookEventId/lastEventOccurredAt come from sources.paddle even when apple is representative`
- `expired sources still count for max (premiumUntil in past → plan free, source = that source)`
- `duplicate: two auto-renewing valid payment sources → laterSource = later startedAt`
- `duplicate: null startedAt counts as earliest`
- `duplicate: canceling (autoRenew false) source is not counted`
- `duplicate: manual + apple is not duplicate`
- `duplicate: keeps existing detectedAt when laterSource unchanged, sets now when new`
- `trialUsedAt untouched`

`manual.test.ts`:
- `applyManual(until) sets sources.manual active with premiumUntil=until and aggregates`
- `applyManual(null) removes sources.manual only; paddle-premium doc stays premium`

- [ ] **Step 2: 실패 확인**

Run: `cd packages/core && npx vitest run src/entitlement`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

- `normalize.ts`: 입력을 필드별로 검사해 잘못된 값은 기본값으로. `sources`가 객체가 아니면(없으면) 최상위 `source`로 이주한다(위 테스트 규칙). 레코드별 필수 식별자: paddle `customerId`·`subscriptionId`, apple `originalTransactionId`·`productId`, google `purchaseToken`·`productId`. `environment`가 이상하면 `"Production"`.
- `aggregate.ts`: 규칙은 스펙 1절 그대로다. 결과의 `plan`은 `isPremiumAt`, `updatedAt`은 입력값 유지(호출자가 정함). 출처가 하나도 없으면 `status: "none"`, `source: null`, `cancelAt`·`currentPeriodEnd`·`premiumUntil` null.
- duplicate 판정 대상 = paddle·apple·google 중 `autoRenew && cancelAt === null && status !== "canceled" && premiumUntil > now`.
- `hasAutoRenewingStoreSubscription`: apple → google 순서로 위 조건을 만족하는 첫 출처를 돌려준다.

- [ ] **Step 4: 통과 확인 + 빌드**

Run: `cd packages/core && npx vitest run && TZ=America/New_York npx vitest run && npm run build && git status --short dist`
Expected: PASS, `dist/entitlement/*` 생성

- [ ] **Step 5: billing-proxy에 의존성 추가**

Run: `cd billing-proxy && npm install ../packages/core --save && npm run typecheck`
Expected: 성공(아직 import 없음)

- [ ] **Step 6: 커밋**

```bash
git add packages/core billing-proxy/package.json billing-proxy/package-lock.json .github/workflows/ci.yml
git commit -m "feat(core): 구독 출처별 기록과 합치기 규칙(entitlement 모듈)"
```

---

### Task 2: EntitlementStore 중첩 맵·불리언 인코딩

**Files:**
- Modify: `billing-proxy/src/entitlementStore.ts`
- Modify: `billing-proxy/src/entitlement.ts`(타입·상수를 core에서 재수출하고 로컬 정의 삭제. 기존 import 경로 `./entitlement`는 그대로 동작해야 한다)
- Test: `billing-proxy/src/__tests__/entitlementStore.test.ts`

**Interfaces:**
- Consumes: Task 1 `normalizeEntitlement`, `EntitlementDoc`
- Produces: `toFirestoreValue(value: unknown): FirestoreValue`, `fromFirestoreValue(value: FirestoreValue): unknown`(같은 파일 export, Task 5가 재사용). `EntitlementStore.get/write` 시그니처는 그대로.

- [ ] **Step 1: 실패하는 테스트**
  - `encodes sources as mapValue with booleanValue for autoRenew`
  - `round-trips a doc with paddle+apple sources and duplicate` (encode → fake Firestore → decode 후 `toEqual`)
  - `decodes legacy doc without sources into migrated sources` (Task 1 이주가 탄다)
  - `omits undefined source keys instead of writing null`
  - 기존 테스트는 전부 그대로 통과

- [ ] **Step 2: 실패 확인** — Run: `cd billing-proxy && npx vitest run src/__tests__/entitlementStore.test.ts` / Expected: FAIL

- [ ] **Step 3: 구현** — `FirestoreValue`에 `booleanValue`, `mapValue: { fields }`, `integerValue` 추가. decode는 generic `fromFirestoreValue`로 평범한 객체를 만든 뒤 `normalizeEntitlement`에 넘긴다. encode는 `EntitlementDoc` 전체를 generic `toFirestoreValue`로(undefined 키 생략). PATCH는 지금처럼 updateMask 없이 문서 전체를 바꾼다.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck` / Expected: 전부 PASS

- [ ] **Step 5: 커밋** — `git commit -m "feat(billing-proxy): 엔타이틀먼트 출처 맵 인코딩"`

---

### Task 3: Paddle·체험·체크아웃·탈퇴를 `sources` 기준으로

**Files:**
- Modify: `billing-proxy/src/entitlement.ts`(`applySubscriptionEvent`, `isStaleEvent`, `isForeignCancel`, `applyTrial`)
- Modify: `billing-proxy/src/paddleEvent.ts`(`PaddleSubscriptionEvent.startedAt: string | null` ← `data.started_at`)
- Modify: `billing-proxy/src/handlers/account.ts`(`handleCheckout`), `billing-proxy/src/handlers/deleteAccount.ts`
- Test: `billing-proxy/src/__tests__/entitlement.test.ts`, `webhook.test.ts`, `router.test.ts`, `deleteAccount.test.ts`, `paddleEvent.test.ts`

**Interfaces:**
- Consumes: Task 1 `aggregate`, `PaddleRecord`
- Produces: 시그니처 유지. `applySubscriptionEvent(existing, event, now): EntitlementDoc`는 `sources.paddle`만 바꾸고 `aggregate`한 결과를 돌려준다. `applyTrial(existing, now): Decision<TrialRejection>`는 `sources.trial` + `trialUsedAt`를 쓰고 `aggregate`. `isStaleEvent`/`isForeignCancel`은 `existing.sources.paddle` 기준.
- 다른 출처가 필요한 이후 태스크를 위해 `Decision<R>`(기존)을 그대로 쓴다.

- [ ] **Step 1: 실패하는 테스트**
  - 기존 `entitlement.test.ts` 기대값은 단일 출처라 최상위 필드가 그대로 맞아야 한다. `toMatchObject`에 `sources.paddle` 기대값만 추가한다.
  - `paddle cancel keeps apple premium`: `sources.apple` 유효(premiumUntil = NOW+20일) + Paddle canceled 이벤트 → `plan: "premium"`, `source: "apple"`, `sources.paddle.status: "canceled"`
  - `isForeignCancel reads sources.paddle` (최상위 `source`가 apple이어도 paddle 기록 기준으로 판정)
  - `legacy paddle doc + trial request keeps paddle` → `ALREADY_PREMIUM`
  - `trial rejected when any source premium` (apple만 유효 → `ALREADY_PREMIUM`)
  - `trial rejected when trialUsedAt set by store trial`
  - `handleCheckout returns ALREADY_SUBSCRIBED from sources.paddle even if representative is apple`
  - `handleCheckout uses sources.paddle.customerId`
  - `deleteAccount cancels sources.paddle subscription when not canceled; skips when only apple`
  - `paddleEvent parses started_at`

- [ ] **Step 2: 실패 확인** — Run: `cd billing-proxy && npx vitest run` / Expected: 새 테스트 FAIL

- [ ] **Step 3: 구현** — Paddle 레코드 계산식(기존 switch)은 그대로 `PaddleRecord`에 담는다. `autoRenew = scheduledCancelAt === null && status in {active, trialing, past_due}`, `startedAt = event.startedAt ?? existing.sources.paddle?.startedAt ?? null`. 기존 `past_due`의 `max(기존, 기간끝+3일)`에서 "기존"은 `sources.paddle.premiumUntil`이다.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck` / Expected: 전부 PASS

- [ ] **Step 5: 커밋** — `git commit -m "refactor(billing-proxy): Paddle·체험을 출처 기록 기준으로 반영"`

---

### Task 4: 운영자 스크립트는 `sources.manual`만

**Files:**
- Modify: `scripts/grantEntitlement.ts`

**Interfaces:**
- Consumes: Task 1 `normalizeEntitlement`, `applyManual`, `toClaimSeconds` (`../packages/core/dist/entitlement/index.js`에서 import. 루트 package가 CommonJS라 `tsx`가 ESM dist를 불러오는지 Step 2에서 확인)

- [ ] **Step 1: 구현** — Firestore 트랜잭션 안에서 읽기 → `normalizeEntitlement(snap.data())` → `applyManual(doc, plan === "premium" ? until : null, new Date())`. 클레임 먼저(`toClaimSeconds(next.premiumUntil)`), 그다음 트랜잭션 안에서 `set(next)`(merge 아님, 문서 전체). 트랜잭션 재시도로 클레임과 문서가 달라지면 커밋 후 문서 기준으로 클레임을 한 번 더 맞춘다. 로그에 "manual만 회수, 결제 출처가 있으면 계속 프리미엄"을 출력.
- [ ] **Step 2: 로드 확인** — Run: `npx tsx scripts/grantEntitlement.ts` (인자 없이) / Expected: `--uid <uid> 인자가 필요합니다` 에러로 종료(import 오류가 아님)
- [ ] **Step 3: 커밋** — `git commit -m "fix(scripts): 운영자 부여를 manual 출처로 한정"`

---

### Task 5: 스토어 연결(`storeLinks`)·계정 토큰·탈퇴 정리

**Files:**
- Create: `billing-proxy/src/storeLinks.ts`, `billing-proxy/src/accountToken.ts`, `billing-proxy/src/handlers/accountToken.ts`
- Modify: `billing-proxy/src/accountDataStore.ts`(`deleteUserData`에 `storeLinks` where `uid == uid` 삭제 추가), `billing-proxy/src/env.ts`(`IAP_ACCOUNT_TOKEN_SECRET: string`), `billing-proxy/src/router.ts`(`POST /iap/account-token`, 허용 목록 적용), `firestore.rules`
- Test: `billing-proxy/src/__tests__/storeLinks.test.ts`, `accountToken.test.ts`, `accountDataStore.test.ts`, `router.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type StoreKind = "apple" | "google";
  interface StoreLink { uid: string; linkedAt: string; accountToken: string | null }
  class StoreLinkStore { constructor(projectId, getToken, fetchFn?);
    get(store: StoreKind, id: string): Promise<{ link: StoreLink | null; updateTime: string | null }>;
    put(store: StoreKind, id: string, link: StoreLink, updateTime: string | null): Promise<"ok" | "conflict"> }
  type LinkDecision = { kind: "link" | "relink"; tokenMismatch: boolean } | { kind: "conflict" };
  decideLink(existing: StoreLink | null, uid: string, expectedToken: string, receivedToken: string | null): LinkDecision;
  deriveAccountToken(uid: string, secret: string): Promise<string>; // 소문자 UUID v4 형식
  ```
  - 문서 id: `apple_{originalTransactionId}`, `google_{sha256hex(purchaseToken)}`(Google 토큰은 길고 `/`가 섞일 수 있어 해시로 쓴다. 원래 토큰은 `sources.google.purchaseToken`에 있다).
  - `/iap/account-token` 응답: `{ appAccountToken: string }`
  - `BillingDeps`에 `storeLinks: Pick<StoreLinkStore, "get" | "put">` 추가.

- [ ] **Step 1: 실패하는 테스트**
  - `decideLink`: 스펙 2절 표 4행 그대로(없음+일치 → link, 없음+불일치/없음 → link + tokenMismatch true, 같은 uid → relink, 다른 uid → conflict)
  - `deriveAccountToken is deterministic, UUID v4 shaped (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), differs by uid, throws on empty secret`
  - `StoreLinkStore.put uses exists=false precondition when updateTime null`
  - `deleteUserData deletes storeLinks queried by uid field` (fake fetch가 `:runQuery`의 `fieldPath: "uid"`를 받는지)
  - `POST /iap/account-token requires auth and returns token`

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run` / Expected: FAIL

- [ ] **Step 3: 구현** — `deriveAccountToken`: `hmacSha256Hex(secret, uid)` 앞 32 hex를 쓰고 13번째 자리를 `4`, 17번째 자리를 `(n & 0x3) | 0x8`로 바꿔 8-4-4-4-12로 끊는다. `AccountDataStore.drain`은 지금 `userId` 필드만 조회하므로 필드 이름을 인자로 받게 바꾼다. 규칙 추가:
  ```
  match /storeLinks/{linkId} { allow read, write: if false; }
  ```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck` / Expected: PASS

- [ ] **Step 5: 커밋** — `git commit -m "feat(billing-proxy): 스토어 구독 계정 연결과 appAccountToken"`

---

### Task 6: Apple JWS 서명 검증

**Files:**
- Create: `billing-proxy/src/apple/jws.ts`, `billing-proxy/src/apple/rootCa.ts`
- Create: `billing-proxy/src/__tests__/helpers/appleTestChain.ts`(테스트용 루트·중간·리프 생성)
- Test: `billing-proxy/src/__tests__/appleJws.test.ts`
- Modify: `billing-proxy/package.json`(`@peculiar/x509` `1.14.3` 정확 고정)

**Interfaces:**
- Produces:
  ```ts
  class AppleJwsError extends Error {}
  verifyAppleJws<T>(jws: string, opts: { trustedRootsDer: Uint8Array[]; now: Date }): Promise<T>; // 실패 시 AppleJwsError
  const APPLE_ROOT_CA_G3_DER: Uint8Array;
  ```

- [ ] **Step 1: 루트 인증서 확보** — `https://www.apple.com/certificateauthority/AppleRootCA-G3.cer`를 내려받아 base64로 `rootCa.ts`에 넣는다. `shasum -a 256`으로 구한 지문을 Apple PKI 페이지에 공개된 SHA-256 지문과 맞춰 본 뒤, 그 값을 주석으로 남긴다. 내려받은 파일은 scratchpad의 빈 디렉터리에 둔다.

- [ ] **Step 2: 실패하는 테스트** (헬퍼가 P-256 체인을 만들고 리프 키로 ES256 JWS를 서명)
  - `accepts valid chain and returns payload`
  - `rejects root not in trusted list`
  - `rejects leaf not signed by intermediate`
  - `rejects expired leaf at now`
  - `rejects missing Apple OIDs` (리프 `1.2.840.113635.100.6.11.1`, 중간 `1.2.840.113635.100.6.2.1`)
  - `rejects tampered payload` / `rejects alg other than ES256`

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run src/__tests__/appleJws.test.ts` / Expected: FAIL

- [ ] **Step 4: 구현** — 헤더 `x5c` 3개 [리프, 중간, 루트]. 루트 DER이 신뢰 목록과 바이트 단위로 같은지 확인한다. 중간은 루트로, 리프는 중간으로 서명을 검증한다(`X509Certificate.verify`). 확장 OID, 유효기간(`now`)을 확인한다. 리프 공개키로 `ECDSA P-256 SHA-256` 서명을 검증한다. JWS 서명은 raw(r||s) 64바이트라 WebCrypto에 그대로 넘긴다.

- [ ] **Step 5: 통과 확인 + 번들 확인** — Run: `npx vitest run && npm run typecheck && npx wrangler deploy --dry-run --outdir "$(mktemp -d)"` / Expected: PASS, dry-run 번들 성공(Workers에서 x509가 Node 전용 API를 안 쓰는지)

- [ ] **Step 6: 커밋** — `git commit -m "feat(billing-proxy): Apple JWS 인증서 체인 검증"`

---

### Task 7: Apple 상태 → `AppleRecord` 결정 함수

**Files:**
- Create: `billing-proxy/src/apple/decide.ts`
- Test: `billing-proxy/src/__tests__/appleDecide.test.ts`

**Interfaces:**
- Consumes: Task 1 `AppleRecord`, `aggregate`, `RENEWAL_GRACE_MS`
- Produces:
  ```ts
  interface AppleTransaction { originalTransactionId: string; transactionId: string; bundleId: string; productId: string;
    purchaseDate: number; originalPurchaseDate: number; expiresDate: number; environment: "Production" | "Sandbox";
    appAccountToken?: string; offerType?: number; offerDiscountType?: string; revocationDate?: number }
  interface AppleRenewalInfo { autoRenewStatus: 0 | 1; gracePeriodExpiresDate?: number }
  interface AppleSnapshot { status: 1 | 2 | 3 | 4 | 5; transaction: AppleTransaction; renewal: AppleRenewalInfo | null;
    notificationUUID: string | null; signedDate: number | null }
  type AppleSkip = "STALE" | "DUPLICATE_NOTIFICATION" | "OTHER_SUBSCRIPTION";
  applyAppleSnapshot(existing: EntitlementDoc, snap: AppleSnapshot, now: Date): Decision<AppleSkip>;
  ```

- [ ] **Step 1: 실패하는 테스트** (스펙 4절 표의 Apple 열, 상태 코드 1=active 2=expired 3=billing retry 4=grace 5=revoked)
  - `status 1 autoRenew on → active, premiumUntil = expires + 3d, cancelAt null, autoRenew true`
  - `status 1 introductory free trial (offerType 1, offerDiscountType FREE_TRIAL) → trialing and sets trialUsedAt if null`
  - `trial purchase when trialUsedAt already set is still applied and keeps original trialUsedAt`
  - `status 1 autoRenew off → active, cancelAt = expires, premiumUntil = expires`
  - `status 4 grace → past_due, premiumUntil = max(existing apple, gracePeriodExpires + 3d)`
  - `status 3 billing retry → past_due, premiumUntil = now`
  - `status 2 / 5 → canceled, premiumUntil = now`
  - `revocationDate set → canceled, premiumUntil = now (refund)`
  - `refund on apple keeps paddle premium` (aggregate)
  - `same notificationUUID → skip DUPLICATE_NOTIFICATION`; `older signedDate → skip STALE`
  - `different originalTransactionId while existing apple record valid → skip OTHER_SUBSCRIPTION` (한 계정에 Apple 구독은 그룹당 하나라 정상 경로에선 안 생긴다. 로그 대상)
  - `records environment, productId, startedAt = originalPurchaseDate`

- [ ] **Step 2~4: 실패 확인 → 구현 → 통과** — Run: `npx vitest run src/__tests__/appleDecide.test.ts`
- [ ] **Step 5: 커밋** — `git commit -m "feat(billing-proxy): Apple 구독 상태 반영 규칙"`

---

### Task 8: App Store Server API 클라이언트

**Files:**
- Create: `billing-proxy/src/apple/serverApi.ts`
- Modify: `billing-proxy/src/env.ts`(`APPLE_BUNDLE_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`)
- Test: `billing-proxy/src/__tests__/appleServerApi.test.ts`

**Interfaces:**
- Consumes: Task 6 `verifyAppleJws`, Task 7 `AppleSnapshot`
- Produces:
  ```ts
  class AppleServerApi { constructor(cfg: { bundleId; issuerId; keyId; privateKeyPem }, verify: (jws) => Promise<unknown>, fetchFn?, now?);
    getSubscriptionSnapshot(transactionId: string): Promise<AppleSnapshot | null> } // 어느 환경에도 없으면 null
  ```

- [ ] **Step 1: 실패하는 테스트**
  - `signs ES256 JWT with kid, iss, aud appstoreconnect-v1, bid, exp ≤ iat+3600`
  - `calls GET https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{id}`
  - `falls back to sandbox on 404` (`api.storekit-sandbox.itunes.apple.com`)
  - `returns null when both 404`
  - `picks lastTransactions entry matching originalTransactionId, verifies both signed fields`
  - `throws on 5xx (caller returns 500 for retry)`

- [ ] **Step 2~4: 실패 확인 → 구현 → 통과** — `.p8`은 PKCS#8 PEM이라 `importKey("pkcs8", …, { name: "ECDSA", namedCurve: "P-256" })`. 토큰은 인스턴스 메모리에 50분 캐시.
- [ ] **Step 5: 커밋** — `git commit -m "feat(billing-proxy): App Store Server API 조회"`

---

### Task 9: Apple 엔드포인트 (`/iap/apple/verify`, `/webhooks/apple`)

**Files:**
- Create: `billing-proxy/src/handlers/iapApple.ts`
- Modify: `billing-proxy/src/router.ts`, `billing-proxy/src/index.ts`, `billing-proxy/wrangler.toml`(`APPLE_BUNDLE_ID = "com.swimmingriver.tododo"` var), `billing-proxy/README.md`(새 시크릿·App Store Connect 알림 URL 설정)
- Test: `billing-proxy/src/__tests__/iapApple.test.ts`, `router.test.ts`

**Interfaces:**
- Consumes: Task 5 `StoreLinkStore`·`decideLink`·`deriveAccountToken`, Task 6·7·8
- Produces:
  - `POST /iap/apple/verify` body `{ jws: string }` → 200 `{ premiumUntil: string | null }` / 400 `{ error: "INVALID_TRANSACTION" }` / 409 `{ error: "LINKED_TO_OTHER_ACCOUNT" }` / 403 `NOT_ALLOWED`
  - `POST /webhooks/apple` body `{ signedPayload }` → 200(반영·무시 모두) / 401(서명 불일치) / 500(일시 오류, Apple 재전송)
  - `BillingDeps`에 `apple: Pick<AppleServerApi, "getSubscriptionSnapshot">`, `verifyAppleJws: (jws: string) => Promise<unknown>` 추가

- [ ] **Step 1: 실패하는 테스트**
  - verify: `valid jws → link created, sources.apple written, claim set before doc`
  - verify: `bundleId mismatch → 400 INVALID_TRANSACTION`
  - verify: `linked to other uid → 409, nothing written`
  - verify: `token mismatch on unlinked → links and logs`
  - verify: `not allowed uid → 403`
  - webhook: `webhook before link is a no-op` (200, 쓰기 없음)
  - webhook: `DID_RENEW for linked → sources.apple updated with notificationUUID/signedDate`
  - webhook: `TEST notification → 200 no write`
  - webhook: `bad signature → 401`; `user deleted (UserNotFoundError) → 200`
  - webhook: `bundleId mismatch → 200 ignored with log`

- [ ] **Step 2~4: 실패 확인 → 구현 → 통과** — verify 흐름: JWS 검증 → `transaction.bundleId` 확인 → `storeLinks` 판정·쓰기 → `getSubscriptionSnapshot(transactionId)`(null이면 400 `INVALID_TRANSACTION`. JWS 거래만 보고 상태를 추정하지 않는다) → `commitEntitlement(applyAppleSnapshot)`. 웹훅은 `signedPayload` 검증 후 `data.signedTransactionInfo`·`data.signedRenewalInfo`·`data.status`로 스냅샷을 만든다(API 호출 없음). Sandbox도 반영한다(스펙 빌더 판단 기본값).
- [ ] **Step 5: 커밋** — `git commit -m "feat(billing-proxy): Apple 구매 검증과 서버 알림 처리"`

---

### Task 10: Google 인증·Play API·Pub/Sub 토큰 검증

**Files:**
- Modify: `billing-proxy/src/googleAuth.ts`(`signServiceAccountJwt(sa, nowSec, scope = GOOGLE_SCOPES)`, `GoogleTokenProvider` 생성자에 `scope` 옵션)
- Create: `billing-proxy/src/google/playApi.ts`, `billing-proxy/src/google/oidc.ts`
- Modify: `billing-proxy/src/env.ts`(`GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT`, `GOOGLE_PUBSUB_AUDIENCE`, `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`)
- Test: `billing-proxy/src/__tests__/googlePlayApi.test.ts`, `googleOidc.test.ts`

결정: Play용 서비스 계정은 **별도**(`GOOGLE_PLAY_SERVICE_ACCOUNT`)로 둔다. 기존 계정은 Firestore·Auth 권한이라, Play Console 재무 권한까지 한 키에 모으지 않는다.

**Interfaces:**
- Produces:
  ```ts
  interface PlaySubscription { subscriptionState: string; startTime: string | null; linkedPurchaseToken: string | null;
    acknowledgementState: string; testPurchase: boolean; obfuscatedAccountId: string | null;
    lineItems: { productId: string; expiryTime: string; autoRenewEnabled: boolean; basePlanId: string | null;
      offerId: string | null; inFreeTrial: boolean }[] }
  class PlayApi { constructor(packageName, getToken, fetchFn?);
    getSubscription(purchaseToken: string): Promise<PlaySubscription | null>;   // 404·410 → null
    acknowledge(productId: string, purchaseToken: string): Promise<void> }
  verifyPubSubPushToken(authHeader: string | null, opts: { audience: string; email: string; now: Date; fetchJwks?: () => Promise<JsonWebKey[]> }): Promise<boolean>;
  ```

- [ ] **Step 1: 실패하는 테스트**
  - `service account JWT carries given scope (androidpublisher)`; 기존 googleAuth 동작은 기본 scope 그대로
  - `getSubscription maps subscriptionsv2 response` (`externalAccountIdentifiers.obfuscatedExternalAccountId`, `lineItems[].autoRenewingPlan.autoRenewEnabled`, `offerDetails.basePlanId/offerId`, `testPurchase` 존재 → true, `inFreeTrial` = `lineItems[].offerPhase.freeTrial` 존재)
  - `getSubscription returns null on 404/410`, `throws on 5xx`
  - `acknowledge POSTs v3 purchases/subscriptions/{productId}/tokens/{token}:acknowledge`
  - OIDC: `accepts valid RS256 token with matching aud/email/email_verified`, `rejects wrong aud`, `rejects wrong email`, `rejects expired`, `rejects iss other than accounts.google.com / https://accounts.google.com`
- [ ] **Step 2~4: 실패 확인 → 구현 → 통과** — JWKS URL `https://www.googleapis.com/oauth2/v3/certs`, 1시간 캐시, kid 못 찾으면 한 번 다시 받기(worker-auth와 같은 방식).
- [ ] **Step 5: 커밋** — `git commit -m "feat(billing-proxy): Google Play API와 Pub/Sub 푸시 인증"`

---

### Task 11: Google 상태 → `GoogleRecord` 결정 함수

**Files:**
- Create: `billing-proxy/src/google/decide.ts`
- Test: `billing-proxy/src/__tests__/googleDecide.test.ts`

**Interfaces:**
- Consumes: Task 10 `PlaySubscription`, Task 1
- Produces:
  ```ts
  interface GoogleEvent { purchaseToken: string; messageId: string | null; eventTime: string | null }
  type GoogleSkip = "STALE" | "DUPLICATE_MESSAGE" | "PENDING" | "OTHER_SUBSCRIPTION";
  applyGoogleSubscription(existing: EntitlementDoc, sub: PlaySubscription, ev: GoogleEvent, now: Date): Decision<GoogleSkip>;
  ```

- [ ] **Step 1: 실패하는 테스트** (스펙 4절 Google 열)
  - `ACTIVE autoRenew → active, expiry + 3d`
  - `ACTIVE inFreeTrial → trialing, sets trialUsedAt if null`
  - `CANCELED with future expiry → active, autoRenew false, cancelAt = expiry, premiumUntil = expiry`
  - `IN_GRACE_PERIOD → past_due, premiumUntil = max(existing google, expiry + 3d)`
  - `ON_HOLD → past_due, premiumUntil = now`; `PAUSED / EXPIRED / PENDING_PURCHASE_CANCELED → canceled, now`
  - `PENDING → skip PENDING`
  - `same messageId → skip DUPLICATE_MESSAGE`; `older eventTime → STALE` (단 verify 호출은 `ev.eventTime = null`이라 항상 반영)
  - `linkedPurchaseToken equal to existing token → replaces record (upgrade/resubscribe), not OTHER_SUBSCRIPTION`
  - `different token while existing google valid and not linked → skip OTHER_SUBSCRIPTION`
  - `testPurchase → environment Sandbox`
- [ ] **Step 2~4: 실패 확인 → 구현 → 통과**
- [ ] **Step 5: 커밋** — `git commit -m "feat(billing-proxy): Google 구독 상태 반영 규칙"`

---

### Task 12: Google 엔드포인트 (`/iap/google/verify`, `/webhooks/google`)

**Files:**
- Create: `billing-proxy/src/handlers/iapGoogle.ts`
- Modify: `billing-proxy/src/router.ts`, `billing-proxy/src/index.ts`, `billing-proxy/wrangler.toml`(`GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PUBSUB_AUDIENCE`, `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL` var), `billing-proxy/README.md`(Pub/Sub 푸시 구독 설정, Play 권한)
- Test: `billing-proxy/src/__tests__/iapGoogle.test.ts`, `router.test.ts`

**Interfaces:**
- Consumes: Task 5, 10, 11
- Produces:
  - `POST /iap/google/verify` body `{ purchaseToken: string; productId: string }` → 200 `{ premiumUntil }` / 400 `INVALID_PURCHASE` / 409 `LINKED_TO_OTHER_ACCOUNT` / 403
  - `POST /webhooks/google` (Pub/Sub 푸시) → 200 / 401 / 500
  - `BillingDeps`에 `play: Pick<PlayApi, "getSubscription" | "acknowledge">`, `verifyPubSub: (authHeader: string | null) => Promise<boolean>`

- [ ] **Step 1: 실패하는 테스트**
  - verify: `valid token → link, sources.google, acknowledge when ACKNOWLEDGEMENT_STATE_PENDING`
  - verify: `re-verify same token is idempotent` (두 번째는 relink, acknowledge 안 함, 같은 premiumUntil)
  - verify: `productId not premium_monthly → 400`; `getSubscription null → 400`
  - verify: `linkedPurchaseToken whose link belongs to other uid → 409`
  - verify: `linkedPurchaseToken whose link belongs to same uid → new link, record replaced`
  - verify: `acknowledge failure after commit → 500 (app retries; commit is idempotent)`
  - webhook: `webhook before link is a no-op`
  - webhook: `new token with linkedPurchaseToken linked → follows old link's uid and creates new link`
  - webhook: `testNotification → 200`; `bad OIDC → 401`; `packageName mismatch → 200 ignored`
  - webhook: `voidedPurchaseNotification → re-fetch and apply` (환불은 상태 재조회로 반영)
- [ ] **Step 2~4: 실패 확인 → 구현 → 통과** — 웹훅은 알림 본문 상태를 믿지 않고 매번 `getSubscription`으로 다시 조회한다. `obfuscatedAccountId`와 `deriveAccountToken(uid)`가 다르면 로그만(Task 5 판정).
- [ ] **Step 5: 전체 확인** — Run: `cd billing-proxy && npx vitest run && npm run typecheck && npx wrangler deploy --dry-run --outdir "$(mktemp -d)"` / Expected: 전부 PASS
- [ ] **Step 6: 커밋** — `git commit -m "feat(billing-proxy): Google 구매 검증과 RTDN 처리"`

---

### Task 13: 웹 클라이언트 (타입·스토어 보기·이중 구독 배너·탈퇴 경고)

**Files:**
- Modify: `client/src/features/entitlement/types/entitlement.type.ts`(core 타입 재수출: `Entitlement = EntitlementDoc`, `DEFAULT_ENTITLEMENT = EMPTY_ENTITLEMENT`)
- Modify: `client/src/features/entitlement/api/entitlementApi.ts`(`normalizeEntitlement`를 core 것으로)
- Modify: `client/src/features/billing/utils/premiumView.ts`, `client/src/features/billing/pages/premiumPage.tsx`
- Create: `client/src/features/billing/components/duplicateSubscriptionBanner.tsx`(+ styles)
- Modify: `client/src/features/account/components/accountDeletionDialog.tsx`
- Test: `premiumView.test.ts`, `premiumPage.test.tsx`, `entitlementApi.test.ts`, `accountDeletionDialog` 테스트(있으면 수정, 없으면 `__tests__/accountDeletionDialog.test.tsx` 생성), `duplicateSubscriptionBanner.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`@tododo/core/dist/entitlement/index.js`)
- Produces: `PremiumView`에 `| { kind: "store"; store: "apple" | "google"; until: Date; canceling: boolean; pastDue: boolean }` 추가

- [ ] **Step 1: 실패하는 테스트**
  - `premiumView: representative apple and premium → store view (no checkout, no portal)`
  - `premiumView: apple past_due → store view with pastDue true (not paddle pastDue view)`
  - `premiumView: active canManage uses sources.paddle.customerId`
  - `premiumPage store view shows "App Store에서 구독 중이에요. 구독 관리는 App Store에서 할 수 있어요" and no 구독하기/구독 관리 buttons` (Google은 "Google Play")
  - `banner: laterSource paddle → "구독이 두 군데서 결제되고 있어요. 나중에 시작한 웹 구독을 해지해 주세요" + 구독 관리 버튼(portal)`
  - `banner: laterSource apple → "…나중에 시작한 App Store 구독을 해지해 주세요", no button`
  - `banner hidden when duplicate null`
  - `deletion dialog: auto-renewing apple → adds "App Store 구독은 탈퇴해도 자동으로 해지되지 않아요. 먼저 구독을 해지해 주세요." and keeps existing SUBSCRIPTION_NOTICE logic`
  - `deletion dialog hasSubscription reads sources.paddle`
  - `normalizeEntitlement migrates legacy doc` (core 위임 확인용 1건)
- [ ] **Step 2: 실패 확인** — Run: `cd client && VITE_FIREBASE_API_KEY= npx vitest run src/features/billing src/features/entitlement src/features/account` / Expected: FAIL
- [ ] **Step 3: 구현** — 배너는 `premiumPage` 상단과 앱 레이아웃 공용 위치 중 **프리미엄 페이지 상단**에만 둔다(범위 최소). 문구는 위 테스트의 문자열 그대로.
- [ ] **Step 4: 통과 확인** — Run: `VITE_FIREBASE_API_KEY= npx vitest run && TZ=America/New_York VITE_FIREBASE_API_KEY= npx vitest run && npx tsc -b && npm run lint` / Expected: 전부 PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(client): 스토어 구독 표시·이중 구독 안내·탈퇴 경고"`

---

### Task 14: 앱 구독 상태 읽기

**Files:**
- Create: `mobile/src/premium/entitlementApi.ts`, `useEntitlement.ts`, `useEntitlementSync.ts`, `useIsPremium.ts`, `index.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx`(로그인 상태에서 `useEntitlementSync()` 1회 마운트)
- Test: `mobile/src/premium/__tests__/useEntitlementSync.test.tsx`, `useIsPremium.test.tsx`

**Interfaces:**
- Consumes: Task 1 `normalizeEntitlement`, `isPremiumAt`, `toClaimSeconds`
- Produces: `useEntitlement(): { data: EntitlementDoc | undefined; isLoading: boolean }`, `useIsPremium(): { isPremium: boolean; isLoading: boolean }`, `refreshClaims(): Promise<void>`(= `auth.currentUser?.getIdToken(true)`), 쿼리 키 `["entitlement", uid]`

- [ ] **Step 1: 실패하는 테스트** (웹 `useEntitlementSync.test.tsx`·`useIsPremium`과 같은 시나리오)
  - `snapshot sets query data`; `claim mismatch → getIdToken(true)`; `claim equal → no refresh`
  - `useIsPremium flips to false at premiumUntil without new snapshot` (jest fake timers, 시스템 시간 mock)
  - `missing doc → free`
- [ ] **Step 2~4: 실패 확인 → 구현 → 통과** — Run: `cd mobile && npx jest src/premium && npx tsc --noEmit`
- [ ] **Step 5: 커밋** — `git commit -m "feat(mobile): 구독 상태 실시간 읽기와 클레임 동기화"`

---

### Task 15: 앱 구매·복원·미처리 거래 재검증

**Files:**
- Modify: `mobile/package.json`(`expo-iap` `6.4.4` 정확 고정), `mobile/app.json`(`plugins`에 `"expo-iap"`, `android.package: "com.swimmingriver.tododo"`가 없으면 추가)
- Create: `mobile/src/premium/iap/purchaseClient.ts`, `verifyApi.ts`, `usePurchase.ts`, `resumePending.ts`, `products.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx`(로그인 후 `resumePendingPurchases()` 1회)
- Test: `mobile/src/premium/iap/__tests__/usePurchase.test.tsx`, `resumePending.test.ts`, `verifyApi.test.ts`

**Interfaces:**
- Consumes: Task 5 `/iap/account-token`, Task 9·12 verify 응답 형태, Task 14 `refreshClaims`, `EXPO_PUBLIC_BILLING_PROXY_URL`
- Produces:
  ```ts
  // products.ts
  const APPLE_PRODUCTS = { trial: "premium_monthly_trial", plain: "premium_monthly" } as const;
  const GOOGLE_PRODUCT = { productId: "premium_monthly", basePlanId: "monthly", trialOfferId: "free-trial-7d" } as const;
  // purchaseClient.ts — expo-iap를 감싼 얇은 경계(테스트는 이 인터페이스를 mock)
  interface StorePurchase { platform: "ios" | "android"; productId: string; proof: string /* iOS JWS, Android purchaseToken */; raw: unknown }
  interface PurchaseClient { buy(opts: { withTrial: boolean; accountToken: string }): Promise<void>;
    listUnfinished(): Promise<StorePurchase[]>; finish(p: StorePurchase): Promise<void>;
    isTrialEligible(): Promise<boolean>; openManageSubscriptions(): Promise<void>;
    onPurchase(cb: (p: StorePurchase) => void, onError: (e: unknown) => void): () => void }
  // verifyApi.ts
  type VerifyResult = { ok: true } | { ok: false; reason: "LINKED_TO_OTHER_ACCOUNT" | "INVALID" | "NETWORK" };
  verifyPurchase(p: StorePurchase): Promise<VerifyResult>; fetchAccountToken(): Promise<string>;
  // usePurchase.ts
  usePurchase(): { buy(withTrial: boolean): Promise<void>; restore(): Promise<void>; phase: "idle"|"buying"|"verifying"; lastError: VerifyResult["reason"] | null }
  resumePendingPurchases(): Promise<void>;
  ```

- [ ] **Step 1: 설치·설정** — `cd mobile && npm install expo-iap@6.4.4 --save-exact`. 설치된 타입에서 iOS 구매 객체의 JWS 필드와 Android `purchaseToken` 필드, `requestPurchase`의 `appAccountToken`/`obfuscatedAccountIdAndroid`/`subscriptionOffers` 옵션 이름을 확인해서 `purchaseClient.ts`에서만 쓴다.
- [ ] **Step 2: 실패하는 테스트** (`PurchaseClient` mock)
  - `buy: fetches account token then calls client.buy with it`
  - `purchase event → verify → refreshClaims → finish` (호출 순서 검증)
  - `verify NETWORK failure → not finished, lastError NETWORK`
  - `verify LINKED_TO_OTHER_ACCOUNT → not finished, lastError LINKED_TO_OTHER_ACCOUNT` (거래를 끝내지 않아야 원래 계정으로 로그인한 뒤 복원할 수 있다)
  - `unfinished purchase is re-verified on start` (`resumePendingPurchases`가 `listUnfinished` 각각 verify, 성공한 것만 finish)
  - `restore = listUnfinished + available purchases re-verify`
  - `verifyApi posts {jws} to /iap/apple/verify on ios and {purchaseToken, productId} to /iap/google/verify on android with Bearer token`
  - `verifyApi maps 409 → LINKED_TO_OTHER_ACCOUNT, 400 → INVALID, fetch throw/5xx → NETWORK`
- [ ] **Step 3~4: 실패 확인 → 구현 → 통과** — Run: `npx jest src/premium && npx tsc --noEmit`
- [ ] **Step 5: 네이티브 빌드 확인** — `npx expo prebuild --clean` 후 iOS 시뮬레이터 빌드. Pods가 Maven에서 느리면 `ENTERPRISE_REPOSITORY`를 Google Maven Central 미러로 둔다. **다운로드 용량이 GB 단위면 먼저 사용자에게 알리고 동의를 받는다.** Expected: 앱이 뜨고 기존 화면이 그대로 동작(구매는 계정 생긴 뒤 실측).
- [ ] **Step 6: 커밋** — `git commit -m "feat(mobile): 인앱 구독 구매·복원과 서버 검증"`

---

### Task 16: 앱 프리미엄 화면·탈퇴 경고

**Files:**
- Create: `mobile/src/premium/PremiumSection.tsx`, `mobile/src/premium/premiumView.ts`
- Modify: `mobile/src/screens/AccountScreen.tsx`
- Test: `mobile/src/premium/__tests__/premiumView.test.ts`, `PremiumSection.test.tsx`, `mobile/src/screens/__tests__/AccountScreen.test.tsx`(있으면 수정)

**Interfaces:**
- Consumes: Task 14 `useEntitlement`, Task 15 `usePurchase`, `PurchaseClient.isTrialEligible/openManageSubscriptions`, Task 1 `hasAutoRenewingStoreSubscription`
- Produces: `getMobilePremiumView(doc, nowMs, trialEligible): { kind: "offer"; withTrial: boolean } | { kind: "store"; store; until; canceling } | { kind: "external"; until } | { kind: "trialing"; until } | { kind: "pastDue"; store: "apple"|"google"|null }`, 그리고 `duplicateNotice(doc, platform): string | null`

- [ ] **Step 1: 실패하는 테스트**
  - `offer withTrial only when trialUsedAt null AND store eligible`
  - `paddle or manual representative → external view` (렌더 문구 "다른 기기나 웹에서 관리할 수 있어요", 링크·버튼 없음)
  - `store view shows next billing / 종료일 and "구독 관리" button opening store`
  - `pastDue store → "결제 수단을 확인해 주세요" + 스토어 관리 열기`
  - `duplicate laterSource apple on ios → "구독이 두 군데서 결제되고 있어요. 나중에 시작한 App Store 구독을 해지해 주세요" + 관리 버튼`
  - `duplicate laterSource paddle → 앱에서는 배너 없음(null)` (스펙 6절 빌더 판단: 3.1.3 위험을 피해 띄우지 않는다)
  - `offer view renders 구매 복원 button, 이용약관·개인정보처리방침 links, and 3.1.2 auto-renew disclosure` — 고지 문구:
    "월 4,900원, 1개월마다 자동 갱신돼요. 현재 기간이 끝나기 24시간 전까지 해지하지 않으면 다음 기간 요금이 청구돼요. 구독 관리와 해지는 App Store(Google Play) 계정 설정에서 할 수 있어요."
    약관·방침 링크는 기존 웹 법률 페이지 URL(`https://tododo-app.com/terms`, `https://tododo-app.com/privacy`, `client/src/router.tsx` 59–60행)로 연다. 문서 내용은 바꾸지 않는다.
  - `LINKED_TO_OTHER_ACCOUNT error shows "이 구독은 다른 계정에서 사용 중이에요"`
  - `AccountScreen: auto-renewing store sub → delete alert message appends "App Store 구독은 탈퇴해도 자동으로 해지되지 않아요. 먼저 구독을 해지해 주세요." and offers "구독 관리" action`; 기존 `DELETE_MESSAGE`는 그대로
- [ ] **Step 2: 실패 확인** — Run: `cd mobile && npx jest src/premium src/screens` / Expected: FAIL
- [ ] **Step 3: 구현** — `AccountScreen` 이메일 섹션 아래에 `PremiumSection`. 앱 표시 가격은 스토어 상품 정보의 현지화 가격을 우선 쓰고, 못 받으면 고지 문구의 4,900원.
- [ ] **Step 4: 통과 확인** — Run: `npx jest && npx tsc --noEmit` / Expected: 전부 PASS
- [ ] **Step 5: 시뮬레이터 확인** — 비구독 계정으로 내 정보 탭에 혜택·복원·고지가 보이는지, 운영자 부여 계정(manual)이면 external 보기가 뜨는지 확인(구매 자체는 계정 생긴 뒤).
- [ ] **Step 6: 커밋** — `git commit -m "feat(mobile): 프리미엄 화면과 스토어 구독 탈퇴 경고"`

---

> **Task 17~19 (11-19 추가)**: 스펙 개정(`f7ff604`, 7절·4절·11절)에서 나왔다. Task 1~16이 이미 진행 중인 브랜치에 이어서 붙인다. 17·18은 billing-proxy만, 19는 웹·앱 문구만 고치므로 서로 독립이다. 19는 반드시 16 다음이다(같은 탈퇴 문구를 고친다).

### Task 17: 탈퇴 시 Google 구독 자동 해지

**왜:** Google은 개발자가 서버에서 구독 자동 갱신을 끌 수 있다(`purchases.subscriptionsv2.cancel`). 웹 Paddle처럼 탈퇴하면 같이 해지해서 "탈퇴했는데 매달 결제"를 막는다. Apple은 이런 API가 없어서 Task 13·16의 경고가 그대로 유일한 수단이다(스펙 7절).

**Files:**
- Modify: `billing-proxy/src/google/playApi.ts`(`cancelSubscription` 추가)
- Modify: `billing-proxy/src/handlers/deleteAccount.ts`(`AccountDeletionDeps.google`, Google 해지 단계), `billing-proxy/src/index.ts`(deps 연결)
- Test: `billing-proxy/src/__tests__/googlePlayApi.test.ts`, `deleteAccount.test.ts`

**Interfaces:**
- Consumes: Task 10 `PlayApi`, Task 1 `GoogleRecord`(`purchaseToken`, `autoRenew`, `status`)
- Produces:
  ```ts
  // PlayApi
  cancelSubscription(purchaseToken: string): Promise<"canceled" | "already_inactive">; // 그 밖의 실패는 throw
  // AccountDeletionDeps
  google: Pick<PlayApi, "cancelSubscription">;
  ```
  - 탈퇴 실패 응답: `502 { error: "GOOGLE_CANCEL_FAILED" }` (기존 `PADDLE_CANCEL_FAILED`와 같은 모양)

- [ ] **Step 1: 실패하는 테스트**
  - `cancelSubscription POSTs v3 applications/{pkg}/purchases/subscriptionsv2/tokens/{token}:cancel with developer cancellation type` (토큰은 URL 인코딩)
  - `cancelSubscription returns already_inactive for already-canceled/expired response`, `throws on 5xx and on 401/403`
  - `deleteAccount: auto-renewing google → cancel then delete data then delete auth` (호출 순서 검증)
  - `deleteAccount: google cancel failure → 502 GOOGLE_CANCEL_FAILED, nothing deleted`
  - `deleteAccount: google already_inactive → continues deletion`
  - `deleteAccount: google autoRenew false or status canceled → no cancel call`
  - `deleteAccount: paddle and google both live → paddle cancel, google cancel, then delete` / `paddle cancel failure → google not called`
  - `deleteAccount: only apple → no server cancel call` (기존 테스트 유지)
- [ ] **Step 2: 실패 확인** — Run: `cd billing-proxy && npx vitest run` / Expected: 새 테스트 FAIL
- [ ] **Step 3: 구현** — 순서: Paddle 해지 → Google 해지 → `deleteUserData` → `deleteUser`. **토큰이 든 문서를 지우기 전에 해지한다.** 요청 본문의 취소 유형 필드 이름과 값, "이미 해지됨"을 뜻하는 오류 응답(상태 코드와 reason)은 **구현 시점의 Play Developer API 문서로 확인**해서 `playApi.ts` 안에서만 다룬다(스펙 "빌더에게 맡기는 것"). `revoke`는 쓰지 않는다(환불+즉시 종료라 의도와 다르다). 해당 함수 주석의 "스토어(apple·google) 구독은 서버가 해지할 수 없어" 문장은 "Apple 구독은"으로 고친다.
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck && npx wrangler deploy --dry-run --outdir "$(mktemp -d)"` / Expected: 전부 PASS
- [ ] **Step 5: 웹·앱 탈퇴 경고 정리** — Task 13·16의 경고 조건을 **Apple 자동 갱신 중일 때만**으로 좁힌다(Google은 서버가 해지하므로 "해지되지 않아요" 경고가 틀린 말이 된다). Google 자동 갱신 중이면 경고 대신 "Google Play 구독은 탈퇴하면 함께 해지돼요"를 덧붙인다. 테스트: `deletion dialog: auto-renewing google → "함께 해지돼요" notice, no "해지되지 않아요" warning`(웹·앱 각각). Run: `cd client && VITE_FIREBASE_API_KEY= npx vitest run src/features/account && cd ../mobile && npx jest src/screens`
- [ ] **Step 6: 커밋** — `git commit -m "feat(billing-proxy): 탈퇴 시 Google Play 구독 자동 해지"` (Step 5는 별도 커밋 `fix(client,mobile): 탈퇴 경고는 Apple 구독에만`)

---

### Task 18: Apple 환불 요청(`CONSUMPTION_REQUEST`)에 14일 기준 회신

**왜:** App Store 결제 환불은 Apple이 결정한다. 대신 환불 요청이 들어오면 Apple이 알림을 보내고, 개발자가 이용 정보와 **환불 선호**를 회신할 수 있다. 여기에 우리 기준(구매 14일 이내 승인 희망, 지나면 거절 희망)을 담아 Apple 판단을 웹·Google과 같은 기준에 가깝게 맞춘다(스펙 4절·11절). 현재 `handleAppleWebhook`은 이 알림을 "반영할 것 없음"으로 무시한다.

**Files:**
- Create: `billing-proxy/src/apple/consumption.ts`(순수 결정 함수)
- Modify: `billing-proxy/src/apple/serverApi.ts`(`sendConsumptionInfo`), `billing-proxy/src/handlers/iapApple.ts`(`CONSUMPTION_REQUEST` 분기)
- Test: `billing-proxy/src/__tests__/appleConsumption.test.ts`, `appleServerApi.test.ts`, `iapApple.test.ts`

**Interfaces:**
- Consumes: Task 6 `verifyAppleJws`, Task 8 `AppleServerApi`(JWT 서명·환경별 base URL 재사용), Task 9 웹훅 파싱
- Produces:
  ```ts
  // consumption.ts
  const REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
  type RefundPreference = "grant" | "decline";
  decideRefundPreference(purchaseDateMs: number, nowMs: number): RefundPreference; // 경계: 정확히 14일 = grant
  buildConsumptionBody(pref: RefundPreference, ctx: { appAccountToken: string | null }): unknown; // 필드는 Step 3에서 확정
  // AppleServerApi
  sendConsumptionInfo(transactionId: string, environment: StoreEnvironment, body: unknown): Promise<void>; // 실패는 throw
  ```

- [ ] **Step 1: 실패하는 테스트**
  - `decideRefundPreference: 13d23h → grant, exactly 14d → grant, 14d+1ms → decline` (시스템 시간 mock, 절대 날짜 하드코딩 금지)
  - `webhook CONSUMPTION_REQUEST → sendConsumptionInfo called with transactionId from signedTransactionInfo and notification environment`
  - `webhook CONSUMPTION_REQUEST → entitlement not written` (상태 불변)
  - `webhook CONSUMPTION_REQUEST, sendConsumptionInfo throws → still 200 with error log`
  - `webhook CONSUMPTION_REQUEST for unlinked transaction → still replies` (판단이 구매일만으로 정해지므로 연결 여부와 무관. 탈퇴한 계정의 환불 요청도 같은 기준)
  - `sendConsumptionInfo PUTs to production or sandbox base by environment with bearer JWT`
  - `REFUND after CONSUMPTION_REQUEST still revokes sources.apple` (기존 동작 회귀 방지)
- [ ] **Step 2: 실패 확인** — Run: `cd billing-proxy && npx vitest run` / Expected: FAIL
- [ ] **Step 3: 구현** — **엔드포인트 버전(v1/v2)과 본문 필드 이름·값(환불 선호, 고객 동의, 전달 상태 등)은 구현 시점의 App Store Server API "Send Consumption Information" 문서로 확인**한다. 우리가 모르는 값(이용 시간, 계정 나이 등)은 문서가 허용하는 "모름/선언 안 함" 값으로 채운다. 구매일은 알림의 `signedTransactionInfo.purchaseDate`(이 거래의 결제일, 갱신 결제면 갱신일)다. **고객 동의 필드가 필수이고 `true`여야만 보낼 수 있다면**, Task 19에서 개인정보처리방침에 "환불 요청 시 Apple에 이용 정보 제공"을 고지하기 전까지는 회신하지 않고 로그만 남긴다(플래그 `APPLE_CONSUMPTION_REPLY_ENABLED` var, 기본 `"false"`). 회신 기한(알림 후 12시간)은 웹훅 안에서 바로 보내므로 따로 관리하지 않는다.
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run && npm run typecheck && npx wrangler deploy --dry-run --outdir "$(mktemp -d)"` / Expected: 전부 PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(billing-proxy): Apple 환불 요청에 14일 기준으로 환불 선호 회신"`

---

### Task 19: 약관·환불·개인정보 문서 개정과 탈퇴 문구 정리

**왜:** 지금 문서는 웹 Paddle 결제만 설명한다(`refund.ts` "Paddle로 처리", `terms.ts` 제2조 "탈퇴하면 구독 즉시 해지"). 앱 결제가 생기면 틀린 문장이 되고, 스토어 심사에서도 약관 링크(Task 16)가 이 문서를 연다. 스펙 11절의 통일 기준으로 고친다. 개인정보처리방침도 새로 받는 스토어 식별자(`originalTransactionId`, `purchaseToken`)와 처리 주체(Apple·Google)를 아직 적지 않았다.

**반영 시점:** 이 태스크의 커밋은 **앱 IAP 출시와 같은 릴리스**로 나간다. 먼저 운영에 나가면 아직 없는 결제 경로를 설명하게 된다. 사용자가 개정판 번호·시행일·공지 여부를 정하기 전에는 **Step 0에서 멈춘다.**

**Files:**
- Modify: `client/src/features/legal/content/{refund,terms,privacy}.ts`, `client/src/features/legal/config.ts`(`LEGAL_REVISIONS` 새 판)
- Modify: `client/src/features/account/components/accountDeletionDialog.tsx`(`SUBSCRIPTION_NOTICE`), `mobile/src/screens/AccountScreen.tsx`(`DELETE_MESSAGE`)
- Test: `client/src/features/legal/content/__tests__/content.test.ts`, `client/src/features/legal/pages/__tests__/*`, `accountDeletionDialog.test.tsx`, `mobile/src/screens/__tests__/AccountScreen.test.tsx`

- [ ] **Step 0: 사용자 확인 (구현 전 필수)**
  - 새 판의 시행일과 변경 요약(`change`). 약관 11조·방침 13조에 따라 시행 7일 전에 배포돼야 한다.
  - **판 구조**: `config.ts` 주석대로 지금 구조는 판마다 설정값만 다르고 본문은 하나다. 본문이 바뀌는 이번 개정은 (a) 판별 본문을 두도록 구조를 바꾸거나 (b) 시행일 공지만 먼저 배포하고 본문은 시행일에 교체하는 방식 중 하나가 필요하다. 어느 쪽인지 사용자에게 묻는다.
  - 최종 문구의 법률 확인(전자상거래법 청약철회) 완료 여부.
  - `trial-reuse-after-deletion`(탈퇴 후 재가입 체험 재지급)의 방침 개정을 이번 판에 묶을지.
- [ ] **Step 1: 실패하는 테스트**
  - `refund: states 14-day full refund once for all payment channels` (공통 문장 1개)
  - `refund: App Store exception mentions Apple decides and reportaproblem.apple.com`
  - `refund: Google Play request via contact email with order number (GPA.)`
  - `refund: processing says refund goes through the channel that charged (Paddle, Google, Apple) and other live subscriptions keep premium`
  - `terms 제2조: web·Google Play subscriptions end on deletion; App Store must be canceled at Apple`
  - `terms 제4조: in-app purchases processed by Apple or Google with their terms`
  - `terms 제5조: app subscriptions canceled in store subscription settings`
  - `terms 제6조: in-app trial via store free trial, once per account across web and app`
  - `privacy: lists App Store / Google Play subscription identifiers and Apple·Google as payment processors` (+ Task 18 Step 3에서 동의가 필요하다고 확인됐으면 `consumption info shared with Apple on refund request`)
  - `deletion notice (web·app) wording matches 스펙 7절 per source` (Task 17 Step 5 문구와 같은 문자열)
  - 기존 `pricingSection` "결제 후 14일 이내 전액 환불" 테스트는 그대로 통과(웹 결제 화면이라 바꾸지 않는다)
- [ ] **Step 2: 실패 확인** — Run: `cd client && VITE_FIREBASE_API_KEY= npx vitest run src/features/legal src/features/account` / Expected: FAIL
- [ ] **Step 3: 구현** — 스펙 11절 "문서 개정 범위" 그대로. 앱 안에서 보이는 문서이므로 **웹 결제로 유도하는 문장을 넣지 않는다**(Global Constraints). 환불 정책의 웹 결제 절은 결제 경로 설명으로만 쓴다. Step 0에서 정한 판 구조·시행일로 `LEGAL_REVISIONS`에 새 판을 추가한다.
- [ ] **Step 4: 통과 확인** — Run: `VITE_FIREBASE_API_KEY= npx vitest run && TZ=America/New_York VITE_FIREBASE_API_KEY= npx vitest run && npx tsc -b && npm run lint && cd ../mobile && npx jest && npx tsc --noEmit` / Expected: 전부 PASS
- [ ] **Step 5: 화면 확인** — 로컬에서 `/refund`·`/terms`·`/privacy`의 변경 예정 공지와 시행일 이후 본문, 웹 탈퇴 다이얼로그를 출처별(Paddle·Google·Apple 가짜 문서)로 확인
- [ ] **Step 6: 커밋** — `git commit -m "docs(legal): 결제 경로 통일 환불 기준과 앱 결제 약관 개정"`

---

## 구현 후, 계정이 생긴 뒤 (이 계획의 태스크 아님, 사용자 몫 포함)

- 사용자가 스펙 "선행 조건" 체크리스트를 끝낸다(Apple Developer·소규모 사업자, App Store Connect 상품 2개, Play Console 상품·offer, Pub/Sub 푸시, 서비스 계정).
- 사용자가 자기 터미널에서 `wrangler secret put`: `IAP_ACCOUNT_TOKEN_SECRET`, `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `GOOGLE_PLAY_SERVICE_ACCOUNT`.
- 실측: 스펙 "테스트 > 실측" 항목 전부. 특히 Google `inFreeTrial`(`offerPhase.freeTrial`)과 유예 기간 중 `expiryTime` 의미를 실제 응답으로 확인한다.
- 실측(Task 17·18): Google 테스트 트랙 구독 계정 탈퇴 → Play 구독 화면에서 해지 확인, Play Console 환불 + **권한 회수** → 프리미엄 회수 확인(스펙 11절 운영 절차), Apple 샌드박스 환불 요청 → `CONSUMPTION_REQUEST` 수신·회신 응답 확인.
- 스토어 제출 전: Task 19 Step 0의 사용자 결정(시행일·판 구조·법률 확인)이 끝나고, 개정 문서가 IAP와 같은 릴리스에 들어가는지 확인.
