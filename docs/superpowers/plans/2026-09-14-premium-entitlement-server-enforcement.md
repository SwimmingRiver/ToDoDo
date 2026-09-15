# 프리미엄 엔타이틀먼트 서버 사이드 강제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `calendarIntegrations` Firestore 규칙과 calendar-proxy(Cloudflare Worker)의 프리미엄 관련 엔드포인트에, 지금까지 클라이언트 UI에만 있던 "이 사용자가 프리미엄인가" 검사를 서버 사이드로 추가한다.

**Architecture:** PM이 `scripts/grantEntitlement.ts`로 프리미엄을 부여/회수할 때 `entitlements/{uid}` Firestore 문서(클라이언트 UI용 소스)와 Firebase Auth 커스텀 클레임 `premium`(서버 검증용)을 동시에 설정한다. `firestore.rules`와 calendar-proxy는 Firestore를 조회하지 않고 이미 검증되는 ID 토큰에 실린 이 커스텀 클레임만 읽어서 판단한다.

**Tech Stack:** Firestore Security Rules, Cloudflare Workers(TypeScript, Vitest), firebase-admin(Node 스크립트)

**Spec:** `docs/superpowers/specs/2026-09-14-premium-entitlement-server-enforcement-design.md`

## Global Constraints

- 커스텀 클레임 키는 정확히 `premium` (boolean)이어야 한다 — `firestore.rules`(`request.auth.token.premium`)와 calendar-proxy(`payload.premium`)가 같은 이름을 읽는다.
- calendar-proxy가 프리미엄이 아닌 요청을 막을 때는 정확히 `403` + JSON 바디 `{ "error": "PREMIUM_REQUIRED" }`를 반환한다.
- `oauthCallback`과 `disconnect` 핸들러는 게이트하지 않는다 (스펙의 "계획 단계에서 발견한 기술적 제약"과 "트레이드오프" 절 참고).
- firestore.rules와 grantEntitlement 스크립트에는 자동 테스트를 추가하지 않는다 — 프로젝트에 rules 테스트 인프라가 없고(스펙에서 의도적으로 범위 밖), 스크립트는 1회성 관리 도구다. 대신 각 태스크에 수동 검증 절차를 명시한다.
- 새 admin 스크립트는 `scripts/backfillArchivedField.ts`와 동일한 패턴(`GOOGLE_APPLICATION_CREDENTIALS` 환경변수 + `applicationDefault()`)을 따른다.

---

## Task 1: calendar-proxy — ID 토큰 검증이 premium 클레임도 반환하도록 확장

**Files:**
- Modify: `calendar-proxy/src/auth.ts`
- Test: `calendar-proxy/src/__tests__/auth.test.ts`

**Interfaces:**
- Produces: `verifyFirebaseIdToken(idToken: string, firebaseProjectId: string): Promise<{ uid: string; premium: boolean }>` — Task 2가 이 반환 타입에 의존한다. `premium`은 토큰 payload의 `premium` 커스텀 클레임이 정확히 `true`일 때만 `true`, 그 외(누락, `false`, 다른 타입)는 `false`.

- [ ] **Step 1: 실패하는 테스트 작성**

`calendar-proxy/src/__tests__/auth.test.ts`의 `describe("verifyFirebaseIdToken", ...)` 블록 안, 마지막 `it("형식이 잘못된 토큰이면...")` 테스트 다음에 추가:

```ts
  it("premium 클레임이 true면 premium:true를 반환한다", async () => {
    const { token, jwk } = await makeSignedToken({ premium: true });
    stubJwksFetch(jwk);

    const result = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    expect(result.premium).toBe(true);
  });

  it("premium 클레임이 없으면 premium:false를 반환한다", async () => {
    const { token, jwk } = await makeSignedToken();
    stubJwksFetch(jwk);

    const result = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    expect(result.premium).toBe(false);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd calendar-proxy && npx vitest run src/__tests__/auth.test.ts`
Expected: 새로 추가한 2개 테스트가 `result.premium`이 `undefined`라서 FAIL. 기존 테스트는 그대로 PASS.

- [ ] **Step 3: 최소 구현**

`calendar-proxy/src/auth.ts`에서 `VerifiedToken` 인터페이스와 payload 타입, 반환문을 수정:

```ts
interface VerifiedToken {
  uid: string;
  premium: boolean;
}
```

```ts
  const payload = decodeJwtPart(payloadB64) as {
    aud?: string;
    iss?: string;
    exp?: number;
    sub?: string;
    premium?: boolean;
  };
```

```ts
  return { uid: payload.sub, premium: payload.premium === true };
```

(이 세 군데만 바꾸면 됨 — 나머지 검증 로직은 그대로.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd calendar-proxy && npx vitest run src/__tests__/auth.test.ts`
Expected: 전체 PASS (기존 6개 + 신규 2개 = 8개).

- [ ] **Step 5: 타입체크**

Run: `cd calendar-proxy && npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add calendar-proxy/src/auth.ts calendar-proxy/src/__tests__/auth.test.ts
git commit -m "feat(calendar-proxy): ID 토큰 검증이 premium 커스텀 클레임도 반환하도록 확장"
```

---

## Task 2: calendar-proxy 핸들러에 프리미엄 게이트 적용

**Files:**
- Modify: `calendar-proxy/src/handlers/oauthStart.ts`
- Modify: `calendar-proxy/src/handlers/events.ts`
- Modify: `calendar-proxy/src/handlers/syncTodos.ts`
- Test: `calendar-proxy/src/__tests__/oauthStart.test.ts`
- Test: `calendar-proxy/src/__tests__/events.test.ts`
- Test: `calendar-proxy/src/__tests__/syncTodos.test.ts`
- Test: `calendar-proxy/src/__tests__/disconnect.test.ts` (회귀 테스트만 추가, 핸들러 코드는 안 건드림)

**Interfaces:**
- Consumes: Task 1의 `verifyFirebaseIdToken(...)` → `{ uid: string; premium: boolean }`.

이 태스크는 4개의 독립된 테스트→구현→커밋 사이클로 구성된다 (oauthStart → events → syncTodos → disconnect 회귀 테스트 순).

### 2a. oauthStart

- [ ] **Step 1: 기존 mock을 premium:true로 갱신하고, 새 실패 테스트 작성**

`calendar-proxy/src/__tests__/oauthStart.test.ts` 상단의 mock을:

```ts
vi.mock("../auth", () => ({
  verifyFirebaseIdToken: vi.fn().mockResolvedValue({ uid: "user-123" }),
}));
```

이렇게 바꾼다:

```ts
vi.mock("../auth", () => ({
  verifyFirebaseIdToken: vi.fn().mockResolvedValue({ uid: "user-123", premium: true }),
}));
```

그 다음 `describe("handleOAuthStart", ...)` 블록 마지막에 테스트 추가:

```ts
  it("premium이 아니면 403 PREMIUM_REQUIRED를 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValueOnce({ uid: "user-123", premium: false });

    const request = new Request("https://proxy.example.com/oauth/start", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const response = await handleOAuthStart(request, makeEnv());

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("PREMIUM_REQUIRED");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd calendar-proxy && npx vitest run src/__tests__/oauthStart.test.ts`
Expected: 새 테스트가 FAIL (지금은 무조건 200을 반환하므로). 기존 3개는 mock을 갱신했으니 여전히 PASS.

- [ ] **Step 3: 구현**

`calendar-proxy/src/handlers/oauthStart.ts`에서:

```ts
  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
```

을 아래로 교체:

```ts
  let uid: string;
  let premium: boolean;
  try {
    ({ uid, premium } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!premium) {
    return new Response(JSON.stringify({ error: "PREMIUM_REQUIRED" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd calendar-proxy && npx vitest run src/__tests__/oauthStart.test.ts`
Expected: 4개 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add calendar-proxy/src/handlers/oauthStart.ts calendar-proxy/src/__tests__/oauthStart.test.ts
git commit -m "feat(calendar-proxy): oauthStart에 프리미엄 게이트 적용"
```

### 2b. events

- [ ] **Step 1: 기존 mock을 premium:true로 갱신하고, 새 실패 테스트 작성**

`calendar-proxy/src/__tests__/events.test.ts`에서 `.mockResolvedValue({ uid: "user-1" })`가 나오는 두 곳(각 `it` 블록 안)을 전부 `.mockResolvedValue({ uid: "user-1", premium: true })`로 바꾼다(replace_all).

`describe("handleGetEvents", ...)` 블록 마지막에 테스트 추가:

```ts
  it("premium이 아니면 403 PREMIUM_REQUIRED를 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1", premium: false });

    const response = await handleGetEvents(makeRequest(), makeEnv());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("PREMIUM_REQUIRED");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd calendar-proxy && npx vitest run src/__tests__/events.test.ts`
Expected: 새 테스트만 FAIL.

- [ ] **Step 3: 구현**

`calendar-proxy/src/handlers/events.ts`에서:

```ts
  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
```

을 아래로 교체:

```ts
  let uid: string;
  let premium: boolean;
  try {
    ({ uid, premium } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!premium) {
    return jsonResponse({ error: "PREMIUM_REQUIRED" }, 403);
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd calendar-proxy && npx vitest run src/__tests__/events.test.ts`
Expected: 3개 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add calendar-proxy/src/handlers/events.ts calendar-proxy/src/__tests__/events.test.ts
git commit -m "feat(calendar-proxy): events 조회에 프리미엄 게이트 적용"
```

### 2c. syncTodos

- [ ] **Step 1: 기존 mock을 premium:true로 갱신하고, 새 실패 테스트 작성**

`calendar-proxy/src/__tests__/syncTodos.test.ts`에서 `.mockResolvedValue({ uid: "user-1" })`가 나오는 모든 곳을 `.mockResolvedValue({ uid: "user-1", premium: true })`로 바꾼다(replace_all).

`describe("handleSyncTodos", ...)` 블록 마지막에 테스트 추가:

```ts
  it("premium이 아니면 403 PREMIUM_REQUIRED를 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1", premium: false });

    const response = await handleSyncTodos(makeRequest({ todos: [] }), makeEnv());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("PREMIUM_REQUIRED");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd calendar-proxy && npx vitest run src/__tests__/syncTodos.test.ts`
Expected: 새 테스트만 FAIL.

- [ ] **Step 3: 구현**

`calendar-proxy/src/handlers/syncTodos.ts`에서:

```ts
  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
```

을 아래로 교체:

```ts
  let uid: string;
  let premium: boolean;
  try {
    ({ uid, premium } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!premium) {
    return jsonResponse({ error: "PREMIUM_REQUIRED" }, 403);
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd calendar-proxy && npx vitest run src/__tests__/syncTodos.test.ts`
Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add calendar-proxy/src/handlers/syncTodos.ts calendar-proxy/src/__tests__/syncTodos.test.ts
git commit -m "feat(calendar-proxy): syncTodos에 프리미엄 게이트 적용"
```

### 2d. disconnect — 게이트 없음을 잠그는 회귀 테스트

`disconnect.ts`는 코드 변경 없음. 나중에 실수로 게이트가 붙는 걸 방지하는 회귀 테스트만 추가한다.

- [ ] **Step 1: 회귀 테스트 작성**

`calendar-proxy/src/__tests__/disconnect.test.ts`의 `describe("handleDisconnect", ...)` 블록 마지막에 추가:

```ts
  it("premium이 아니어도(엔타이틀먼트 무관) 연동 해제는 항상 허용된다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1", premium: false });
    vi.mocked(getTokenRecord).mockResolvedValue(null);

    const response = await handleDisconnect(makeRequest([]), makeEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
```

- [ ] **Step 2: 테스트 실행 (구현 변경 없이 바로 통과해야 함)**

Run: `cd calendar-proxy && npx vitest run src/__tests__/disconnect.test.ts`
Expected: 전부 PASS (신규 테스트 포함) — `disconnect.ts`를 건드리지 않았으므로 코드 변경은 필요 없다. FAIL이면 `disconnect.ts`에 실수로 프리미엄 체크가 들어간 적이 있다는 뜻이니 원인을 먼저 확인한다.

- [ ] **Step 3: 전체 calendar-proxy 테스트 + 타입체크**

Run: `cd calendar-proxy && npm run typecheck && npm test`
Expected: 전부 PASS, 타입 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add calendar-proxy/src/__tests__/disconnect.test.ts
git commit -m "test(calendar-proxy): disconnect가 프리미엄 여부와 무관하게 항상 허용됨을 고정하는 회귀 테스트 추가"
```

---

## Task 3: firestore.rules — calendarIntegrations에 프리미엄 게이트 적용

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- 이 태스크는 독립적이다 (calendar-proxy 태스크들과 무관).

- [ ] **Step 1: 규칙 수정**

`firestore.rules`에서:

```
    match /calendarIntegrations/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
```

을 아래로 교체:

```
    match /calendarIntegrations/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId
                          && request.auth.token.premium == true;
    }
```

- [ ] **Step 2: 수동 검증 (Firebase 콘솔 Rules Playground)**

1. Firebase 콘솔(`tododo-83576` 프로젝트) → Firestore Database → 규칙 탭 → 편집기에 로컬 `firestore.rules` 전체 내용을 붙여넣는다(아직 배포/저장은 하지 않는다 — Playground는 편집기에 열려 있는 내용 기준으로 시뮬레이션한다).
2. Rules Playground에서 다음 4가지를 시뮬레이션하고 결과를 확인한다:
   - `get` on `/calendarIntegrations/uid-A`, 인증됨(`uid: "uid-A"`), 커스텀 클레임 `{ "premium": true }` → **허용**되어야 함.
   - `get` on `/calendarIntegrations/uid-A`, 인증됨(`uid: "uid-A"`), 커스텀 클레임 없음(또는 `{ "premium": false }`) → **거부**되어야 함.
   - `get` on `/calendarIntegrations/uid-A`, 인증됨(`uid: "uid-B"`, 즉 남의 문서), 커스텀 클레임 `{ "premium": true }` → **거부**되어야 함(소유권 체크는 그대로 유지).
   - `create` on `/calendarIntegrations/uid-A`, 인증됨(`uid: "uid-A"`), 커스텀 클레임 `{ "premium": true }`, 아무 데이터나 → **허용**되어야 함.
3. 편집기 내용을 실제로 저장/배포할지는 이 태스크 범위 밖이다(메인 브랜치 승격·배포는 별도로 결정).

- [ ] **Step 3: 커밋**

```bash
git add firestore.rules
git commit -m "feat(rules): calendarIntegrations에 프리미엄 커스텀 클레임 검증 추가"
```

---

## Task 4: 부여/회수 스크립트 + 문서 업데이트

**Files:**
- Create: `scripts/grantEntitlement.ts`
- Modify: `package.json` (루트)
- Modify: `client/CLAUDE.md`

**Interfaces:**
- 이 태스크는 독립적이다.

- [ ] **Step 1: 스크립트 작성**

`scripts/grantEntitlement.ts` 새로 생성:

```ts
/**
 * PM이 특정 사용자에게 프리미엄 엔타이틀먼트를 부여하거나 회수한다.
 * entitlements/{uid} Firestore 문서(클라이언트 UI가 읽는 소스)와 Firebase Auth
 * 커스텀 클레임(firestore.rules·calendar-proxy가 읽는 서버 검증용)을 함께
 * 설정한다 — 둘 중 하나만 바꾸면 클라이언트가 보여주는 상태와 서버가 실제로
 * 허용하는 상태가 어긋난다.
 *
 * 실행 전 GOOGLE_APPLICATION_CREDENTIALS 환경변수에 서비스 계정 키 파일 경로를 설정해야 한다.
 * (Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성)
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run grant:entitlement -- --uid <uid> --plan premium
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run grant:entitlement -- --uid <uid> --plan free
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

interface ParsedArgs {
  uid: string;
  plan: "premium" | "free";
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const uidIndex = argv.indexOf("--uid");
  const planIndex = argv.indexOf("--plan");
  const uid = uidIndex !== -1 ? argv[uidIndex + 1] : undefined;
  const plan = planIndex !== -1 ? argv[planIndex + 1] : undefined;

  if (!uid) throw new Error("--uid <uid> 인자가 필요합니다");
  if (plan !== "premium" && plan !== "free") {
    throw new Error("--plan은 premium 또는 free여야 합니다");
  }
  return { uid, plan };
};

const run = async () => {
  const { uid, plan } = parseArgs(process.argv.slice(2));
  const isPremium = plan === "premium";

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const auth = getAuth();

  await db.doc(`entitlements/${uid}`).set(
    {
      plan,
      status: isPremium ? "active" : "none",
      source: "manual",
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  console.log(`entitlements/${uid} 문서 갱신 완료 (plan: ${plan})`);

  await auth.setCustomUserClaims(uid, { premium: isPremium });
  console.log(`${uid} 커스텀 클레임 갱신 완료 (premium: ${isPremium})`);
};

run().catch((error) => {
  console.error("엔타이틀먼트 부여/회수 실패:", error);
  process.exit(1);
});
```

- [ ] **Step 2: 루트 package.json에 npm script 등록**

`package.json`(루트)의 `"scripts"` 블록에서:

```json
    "backfill:archived": "tsx scripts/backfillArchivedField.ts"
```

다음 줄로 이어서 추가(콤마 필요):

```json
    "backfill:archived": "tsx scripts/backfillArchivedField.ts",
    "grant:entitlement": "tsx scripts/grantEntitlement.ts"
```

- [ ] **Step 3: client/CLAUDE.md 갱신**

`client/CLAUDE.md`의 데이터 모델 절에서:

```
지금은 운영자가 Firestore 콘솔에서 직접 값을 넣고, 결제 웹훅이 붙기 전까지는 이 상태로 유지된다.
```

를 아래로 교체:

```
지금은 운영자가 `scripts/grantEntitlement.ts`(`npm run grant:entitlement -- --uid <uid> --plan premium|free`)로 문서와 Firebase Auth 커스텀 클레임(`premium`)을 함께 설정하고, 결제 웹훅이 붙기 전까지는 이 상태로 유지된다. `firestore.rules`와 calendar-proxy는 이 문서가 아니라 커스텀 클레임을 읽어 서버 사이드로 프리미엄 여부를 강제한다.
```

- [ ] **Step 4: 타입체크 (루트 tsx 스크립트는 별도 tsconfig 프로젝트가 없으므로, 최소한 실행 가능한지 dry-run으로 확인)**

Run: `GOOGLE_APPLICATION_CREDENTIALS=/dev/null npx tsx scripts/grantEntitlement.ts --plan premium`
Expected: `--uid <uid> 인자가 필요합니다` 에러로 즉시 종료 (인자 검증 로직이 정상 동작함을 확인). `GOOGLE_APPLICATION_CREDENTIALS`가 유효하지 않아도 인자 파싱은 Firebase 초기화보다 먼저 실행되므로 이 시점에는 아직 도달하지 않는다.

- [ ] **Step 5: 실제 부여 동작 수동 검증 (선택, 실서비스 계정 키가 있을 때)**

테스트용 uid로 아래 실행 후 Firebase 콘솔에서 `entitlements/<uid>` 문서와 해당 사용자의 커스텀 클레임(Authentication → 사용자 → 세부정보)이 둘 다 기대대로 바뀌었는지 확인한다:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run grant:entitlement -- --uid <테스트-uid> --plan premium
```

- [ ] **Step 6: 커밋**

```bash
git add scripts/grantEntitlement.ts package.json client/CLAUDE.md
git commit -m "feat: 프리미엄 엔타이틀먼트 부여/회수 스크립트 추가 (Firestore 문서 + Auth 커스텀 클레임 동시 설정)"
```

---

## 최종 검증

모든 태스크 완료 후:

```bash
cd calendar-proxy && npm run typecheck && npm test
cd .. && npm test --workspace=client 2>/dev/null || (cd client && npm test)
```

Expected: 전부 PASS. (`firestore.rules`와 `grantEntitlement.ts` 자체는 Task 3/4의 수동 검증 절차로 이미 확인했으므로 여기서는 자동 테스트가 있는 calendar-proxy/client만 재확인한다.)
