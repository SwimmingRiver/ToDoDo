# 구글 캘린더 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ToDoDo의 마감일 있는 Todo를 사용자의 구글 캘린더(기본 캘린더)에 자동 반영하고, 구글 캘린더의 기존 일정을 ToDoDo 캘린더 화면에 읽기 전용으로 함께 보여준다.

**Architecture:** OAuth 리프레시 토큰과 구글 API 호출은 새 독립 프로젝트 `calendar-proxy/`(Cloudflare Workers)가 전담한다. Firestore 트리거 없이, 클라이언트의 `useSyncTodosToCalendar` 훅 하나가 `useGetTodos()` 결과 변화를 관찰해 diff를 계산하고 `/sync-todos`를 호출한다. Worker의 각 엔드포인트는 Firebase ID Token을 구글 공개 JWKS로 직접 검증해 호출자를 확인한다(Blaze/Admin SDK 불필요).

**Tech Stack:** Cloudflare Workers + TypeScript + Vitest (calendar-proxy), React + TanStack Query + Firestore + Vitest (client 기존 스택).

**Spec:** `docs/superpowers/specs/2026-08-31-google-calendar-integration-design.md`

## Global Constraints

- 대상 플랫폼은 웹 클라이언트(`client/`)만. 모바일(`mobile/`)은 범위 밖.
- OAuth 스코프는 `https://www.googleapis.com/auth/calendar.events` 하나만 요청한다.
- 동기화 대상 캘린더는 사용자의 기본(primary) 캘린더로 고정한다.
- 동기화 대상 Todo 판정 기준은 `useGetTodos()`가 반환하는 목록(= `archived`가 아닌 것) 중 `dueAt`이 있는 것. 완료 여부는 무관하다.
- 반복 Todo는 인스턴스별로 개별 구글 이벤트에 매핑한다(RRULE 변환 안 함).
- 구글 API 호출은 동시 요청 수를 제한(기본 10개)하며 병렬 처리한다. multipart Batch API는 쓰지 않는다.
- `calendar-proxy/`는 `client/`, `server/`와 의존 관계가 없는 완전히 독립된 npm 프로젝트다.
- 리프레시 토큰은 Cloudflare Workers KV에만 저장한다. Firestore나 브라우저에는 절대 두지 않는다.
- 연동 상태(`calendarIntegrations/{userId}`)는 시크릿이 없는 문서라 클라이언트가 직접 읽고 쓴다.
- 프리미엄 게이팅은 지금 항상 `true`로 열어둔 스텁만 남긴다.

---

## Task 1: calendar-proxy 프로젝트 스캐폴드 + Firebase ID Token 검증

**Files:**
- Create: `calendar-proxy/package.json`
- Create: `calendar-proxy/tsconfig.json`
- Create: `calendar-proxy/wrangler.toml`
- Create: `calendar-proxy/src/env.ts`
- Create: `calendar-proxy/src/auth.ts`
- Test: `calendar-proxy/src/__tests__/auth.test.ts`

**Interfaces:**
- Produces: `verifyFirebaseIdToken(idToken: string, firebaseProjectId: string): Promise<{ uid: string }>` — 실패 시 reject. 이후 모든 핸들러가 이 함수로 호출자를 검증한다.
- Produces: `interface Env { CALENDAR_TOKENS: KVNamespace; FIREBASE_PROJECT_ID: string; GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; CLIENT_APP_URL: string }`

- [ ] **Step 1: 디렉토리와 설정 파일 생성**

`calendar-proxy/package.json`:

```json
{
  "name": "calendar-proxy",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.99.0"
  }
}
```

`calendar-proxy/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

`calendar-proxy/wrangler.toml`:

```toml
name = "tododo-calendar-proxy"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[vars]
FIREBASE_PROJECT_ID = "tododo-83576"
CLIENT_APP_URL = "https://tododo-83576.web.app"

# 아래 값은 Step 2에서 실제 네임스페이스 id로 교체한다.
kv_namespaces = [
  { binding = "CALENDAR_TOKENS", id = "PENDING" }
]
```

`calendar-proxy/src/env.ts`:

```ts
export interface Env {
  CALENDAR_TOKENS: KVNamespace;
  FIREBASE_PROJECT_ID: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CLIENT_APP_URL: string;
}
```

- [ ] **Step 2: KV 네임스페이스 생성 (수동, 1회)**

```bash
cd calendar-proxy
npx wrangler kv namespace create CALENDAR_TOKENS
```

출력되는 `id` 값을 `wrangler.toml`의 `kv_namespaces[0].id`(`"PENDING"` 자리)에 그대로 붙여넣는다.

- [ ] **Step 3: 의존성 설치**

```bash
cd calendar-proxy && npm install
```

- [ ] **Step 4: 실패하는 테스트 작성**

`calendar-proxy/src/__tests__/auth.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyFirebaseIdToken } from "../auth";

const FIREBASE_PROJECT_ID = "tododo-test";

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const encodeJson = (obj: unknown): string =>
  base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));

async function makeSignedToken(
  payloadOverrides: Record<string, unknown> = {},
): Promise<{ token: string; jwk: JsonWebKey }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey & {
    kid?: string;
  };
  jwk.kid = crypto.randomUUID();

  const header = { alg: "RS256", kid: jwk.kid };
  const payload = {
    aud: FIREBASE_PROJECT_ID,
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    sub: "user-123",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payloadOverrides,
  };

  const headerB64 = encodeJson(header);
  const payloadB64 = encodeJson(payload);
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    signingInput,
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return { token: `${headerB64}.${payloadB64}.${signatureB64}`, jwk };
}

const stubJwksFetch = (jwk: JsonWebKey) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [jwk] }),
    }),
  );
};

describe("verifyFirebaseIdToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("유효한 토큰이면 uid를 반환한다", async () => {
    const { token, jwk } = await makeSignedToken();
    stubJwksFetch(jwk);

    const result = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    expect(result.uid).toBe("user-123");
  });

  it("audience가 다르면 에러를 던진다", async () => {
    const { token, jwk } = await makeSignedToken({ aud: "other-project" });
    stubJwksFetch(jwk);

    await expect(verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Invalid audience",
    );
  });

  it("issuer가 다르면 에러를 던진다", async () => {
    const { token, jwk } = await makeSignedToken({
      iss: "https://securetoken.google.com/other-project",
    });
    stubJwksFetch(jwk);

    await expect(verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Invalid issuer",
    );
  });

  it("만료된 토큰이면 에러를 던진다", async () => {
    const { token, jwk } = await makeSignedToken({
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    stubJwksFetch(jwk);

    await expect(verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Token expired",
    );
  });

  it("서명이 위조되면 에러를 던진다", async () => {
    const { token, jwk } = await makeSignedToken();
    const [header, payload] = token.split(".");
    const tamperedToken = `${header}.${payload}.tamperedsignaturevalue0000`;
    stubJwksFetch(jwk);

    await expect(verifyFirebaseIdToken(tamperedToken, FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Invalid signature",
    );
  });

  it("형식이 잘못된 토큰이면 에러를 던진다", async () => {
    await expect(verifyFirebaseIdToken("not-a-jwt", FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Malformed ID token",
    );
  });
});
```

- [ ] **Step 5: 테스트 실행해서 실패 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/auth.test.ts
```

Expected: FAIL — `../auth` 모듈이 없음

- [ ] **Step 6: auth.ts 구현**

`calendar-proxy/src/auth.ts`:

```ts
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

interface VerifiedToken {
  uid: string;
}

interface JwksCache {
  keys: (JsonWebKey & { kid?: string })[];
  fetchedAt: number;
}

let cachedJwks: JwksCache | null = null;

const base64UrlDecode = (input: string): Uint8Array => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const decodeJwtPart = (part: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));

const fetchJwks = async (): Promise<(JsonWebKey & { kid?: string })[]> => {
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  cachedJwks = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
};

const findJwk = async (kid: string): Promise<JsonWebKey> => {
  const isFresh = !!cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS;
  let keys = isFresh ? cachedJwks!.keys : await fetchJwks();
  let match = keys.find((k) => k.kid === kid);

  if (!match) {
    // 캐시가 신선해도 못 찾았다면 키가 최근에 로테이션됐을 수 있으니 한 번 더 강제 갱신
    keys = await fetchJwks();
    match = keys.find((k) => k.kid === kid);
  }

  if (!match) throw new Error("No matching key found");
  return match;
};

export const verifyFirebaseIdToken = async (
  idToken: string,
  firebaseProjectId: string,
): Promise<VerifiedToken> => {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeJwtPart(headerB64) as { kid?: string; alg?: string };
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported token header");
  }

  const payload = decodeJwtPart(payloadB64) as {
    aud?: string;
    iss?: string;
    exp?: number;
    sub?: string;
  };

  if (payload.aud !== firebaseProjectId) throw new Error("Invalid audience");
  if (payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`) {
    throw new Error("Invalid issuer");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new Error("Token expired");
  }
  if (!payload.sub) throw new Error("Missing subject");

  const jwk = await findJwk(header.kid);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  let signature: Uint8Array;
  try {
    signature = base64UrlDecode(signatureB64);
  } catch {
    throw new Error("Invalid signature");
  }

  const isValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    signedData,
  );
  if (!isValid) throw new Error("Invalid signature");

  return { uid: payload.sub };
};
```

- [ ] **Step 7: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/auth.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 8: 커밋**

```bash
git add calendar-proxy/
git commit -m "feat(calendar-proxy): 프로젝트 스캐폴드 + Firebase ID Token 검증"
```

---

## Task 2: Workers KV 토큰 저장소

**Files:**
- Create: `calendar-proxy/src/tokenStore.ts`
- Test: `calendar-proxy/src/__tests__/tokenStore.test.ts`

**Interfaces:**
- Consumes: 없음 (독립 모듈)
- Produces: `interface CalendarTokenRecord { refreshToken: string }`, `getTokenRecord(kv, uid): Promise<CalendarTokenRecord | null>`, `setTokenRecord(kv, uid, record): Promise<void>`, `deleteTokenRecord(kv, uid): Promise<void>`, `createOAuthState(kv, uid): Promise<string>`, `consumeOAuthState(kv, state): Promise<string | null>` — Task 5(콜백), 6(sync), 7(events), 8(disconnect)이 사용. `createOAuthState`/`consumeOAuthState`는 Task 5의 OAuth `state` CSRF 방지용(아래 "왜 state에 uid를 직접 쓰면 안 되는가" 참고).

**왜 state에 uid를 직접 쓰면 안 되는가**: `/oauth/start`가 `state`에 요청자의 uid를 그대로 실어 보내면, `/oauth/callback`은 그 값을 검증 없이 신뢰한다. 그런데 `/oauth/callback`은 구글이 브라우저 리다이렉트로 호출하는 엔드포인트라 Authorization 헤더가 없다 — 즉 **아무나** 자기 구글 계정으로 `/oauth/start`→동의까지 진행해 진짜 `code`를 얻은 뒤, `/oauth/callback?code=<자기 code>&state=<피해자 uid>`를 직접 호출하면 피해자의 KV 토큰 레코드를 공격자의 리프레시 토큰으로 덮어쓸 수 있다. 이후 피해자의 Todo가 공격자의 구글 캘린더로 동기화되는 심각한 정보 유출로 이어진다 — 이 프로젝트가 이미 한 번 겪은 "클라이언트가 제시한 uid를 검증 없이 신뢰"하는 버그 클래스(`firestore-rules-userid-gap`, 커밋 9f659ea)의 재현이다. `createOAuthState`는 `/oauth/start`가 이미 검증한 실제 uid를 서버 쪽(KV)에 짧은 TTL로 보관하고 무작위 토큰을 발급해 그걸 `state`로 내보낸다. `consumeOAuthState`는 `/oauth/callback`에서 그 무작위 토큰으로 원래 uid를 조회하고 즉시 삭제한다(1회용) — 공격자는 애초에 유효한 `state` 토큰 자체를 알아낼 방법이 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

`calendar-proxy/src/__tests__/tokenStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getTokenRecord, setTokenRecord, deleteTokenRecord } from "../tokenStore";

class FakeKVNamespace {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  // 세 번째 인자(TTL 등 옵션)는 실제 Workers KV의 만료 동작을 흉내 내지 않고
  // 무시한다 — 이 스위트는 "TTL이 실제로 만료되는지"가 아니라 "TTL 옵션과 함께
  // put이 호출되는지, 1회용 소비가 되는지"만 검증한다(만료 자체는 Cloudflare KV의
  // 보장이라 유닛 테스트 대상이 아니다).
  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe("tokenStore", () => {
  let kv: FakeKVNamespace;

  beforeEach(() => {
    kv = new FakeKVNamespace();
  });

  it("저장한 적 없는 uid는 null을 반환한다", async () => {
    const result = await getTokenRecord(kv as never, "user-1");
    expect(result).toBeNull();
  });

  it("저장한 토큰을 그대로 읽어올 수 있다", async () => {
    await setTokenRecord(kv as never, "user-1", { refreshToken: "abc" });
    const result = await getTokenRecord(kv as never, "user-1");
    expect(result).toEqual({ refreshToken: "abc" });
  });

  it("삭제하면 다시 null을 반환한다", async () => {
    await setTokenRecord(kv as never, "user-1", { refreshToken: "abc" });
    await deleteTokenRecord(kv as never, "user-1");
    const result = await getTokenRecord(kv as never, "user-1");
    expect(result).toBeNull();
  });

  it("서로 다른 uid는 독립적으로 저장된다", async () => {
    await setTokenRecord(kv as never, "user-1", { refreshToken: "abc" });
    await setTokenRecord(kv as never, "user-2", { refreshToken: "xyz" });
    expect(await getTokenRecord(kv as never, "user-1")).toEqual({ refreshToken: "abc" });
    expect(await getTokenRecord(kv as never, "user-2")).toEqual({ refreshToken: "xyz" });
  });
});

describe("createOAuthState / consumeOAuthState", () => {
  let kv: FakeKVNamespace;

  beforeEach(() => {
    kv = new FakeKVNamespace();
  });

  it("발급한 state로 원래 uid를 조회할 수 있다", async () => {
    const state = await createOAuthState(kv as never, "user-1");
    const uid = await consumeOAuthState(kv as never, state);
    expect(uid).toBe("user-1");
  });

  it("한 번 소비한 state는 다시 쓸 수 없다(1회용)", async () => {
    const state = await createOAuthState(kv as never, "user-1");
    await consumeOAuthState(kv as never, state);
    const second = await consumeOAuthState(kv as never, state);
    expect(second).toBeNull();
  });

  it("존재하지 않는 state는 null을 반환한다", async () => {
    const uid = await consumeOAuthState(kv as never, "forged-state-token");
    expect(uid).toBeNull();
  });

  it("호출마다 서로 다른 state를 발급한다", async () => {
    const state1 = await createOAuthState(kv as never, "user-1");
    const state2 = await createOAuthState(kv as never, "user-1");
    expect(state1).not.toBe(state2);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/tokenStore.test.ts
```

Expected: FAIL — `../tokenStore` 모듈이 없음

- [ ] **Step 3: tokenStore.ts 구현**

`calendar-proxy/src/tokenStore.ts`:

```ts
export interface CalendarTokenRecord {
  refreshToken: string;
}

const tokenKey = (uid: string): string => `token:${uid}`;
const oauthStateKey = (state: string): string => `oauthState:${state}`;

// OAuth state 토큰의 유효 기간. 사용자가 구글 동의 화면에서 시간을 끌어도
// 충분하도록 10분으로 둔다 — 짧을수록 안전하지만, 너무 짧으면 정상 사용자도
// 실패한다.
const OAUTH_STATE_TTL_SECONDS = 600;

export const getTokenRecord = async (
  kv: KVNamespace,
  uid: string,
): Promise<CalendarTokenRecord | null> => {
  const raw = await kv.get(tokenKey(uid));
  return raw ? (JSON.parse(raw) as CalendarTokenRecord) : null;
};

export const setTokenRecord = async (
  kv: KVNamespace,
  uid: string,
  record: CalendarTokenRecord,
): Promise<void> => {
  await kv.put(tokenKey(uid), JSON.stringify(record));
};

export const deleteTokenRecord = async (kv: KVNamespace, uid: string): Promise<void> => {
  await kv.delete(tokenKey(uid));
};

/**
 * OAuth 플로우 시작 시점에 실제로 인증된 uid를 서버 쪽에 짧게 보관하고, 그 uid를
 * 가리키는 무작위 1회용 토큰을 발급한다. 이 토큰이 `/oauth/start` 응답의 `state`
 * 파라미터로 나간다 — `/oauth/callback`은 Authorization 헤더가 없는 리다이렉트
 * 엔드포인트라 uid를 직접 검증할 방법이 없으므로, uid 그 자체가 아니라 이 무작위
 * 토큰만 왕복시켜야 위조를 막을 수 있다.
 */
export const createOAuthState = async (kv: KVNamespace, uid: string): Promise<string> => {
  const state = crypto.randomUUID();
  await kv.put(oauthStateKey(state), uid, { expirationTtl: OAUTH_STATE_TTL_SECONDS });
  return state;
};

/** state 토큰으로 원래 uid를 조회하고 즉시 삭제한다(재사용 방지). 없거나 이미
 *  소비됐거나 만료됐으면 null. */
export const consumeOAuthState = async (
  kv: KVNamespace,
  state: string,
): Promise<string | null> => {
  const uid = await kv.get(oauthStateKey(state));
  if (uid) await kv.delete(oauthStateKey(state));
  return uid;
};
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/tokenStore.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add calendar-proxy/src/tokenStore.ts calendar-proxy/src/__tests__/tokenStore.test.ts
git commit -m "feat(calendar-proxy): Workers KV 토큰 저장소"
```

---

## Task 3: 구글 OAuth 토큰 교환/갱신

**Files:**
- Create: `calendar-proxy/src/googleOAuth.ts`
- Test: `calendar-proxy/src/__tests__/googleOAuth.test.ts`

**Interfaces:**
- Produces: `interface GoogleTokenResponse { access_token: string; refresh_token?: string; expires_in: number }`, `exchangeCodeForTokens(code, redirectUri, clientId, clientSecret): Promise<GoogleTokenResponse>`, `refreshAccessToken(refreshToken, clientId, clientSecret): Promise<GoogleTokenResponse>` (invalid_grant 시 `Error("invalid_grant")` throw) — Task 5, 6, 7, 8이 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`calendar-proxy/src/__tests__/googleOAuth.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { exchangeCodeForTokens, refreshAccessToken } from "../googleOAuth";

describe("exchangeCodeForTokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("올바른 파라미터로 토큰 엔드포인트를 호출하고 응답을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeCodeForTokens(
      "auth-code",
      "https://proxy.example.com/oauth/callback",
      "client-id",
      "client-secret",
    );

    expect(result).toEqual({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "" }));

    await expect(
      exchangeCodeForTokens("bad-code", "https://x", "id", "secret"),
    ).rejects.toThrow("토큰 교환 실패");
  });
});

describe("refreshAccessToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("정상 갱신되면 access_token을 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "new-at", expires_in: 3600 }),
      }),
    );

    const result = await refreshAccessToken("refresh-token", "id", "secret");
    expect(result.access_token).toBe("new-at");
  });

  it("invalid_grant면 'invalid_grant' 메시지로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: "invalid_grant" }),
      }),
    );

    await expect(refreshAccessToken("revoked-token", "id", "secret")).rejects.toThrow(
      "invalid_grant",
    );
  });

  it("그 외 실패는 일반 에러로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "" }),
    );

    await expect(refreshAccessToken("token", "id", "secret")).rejects.toThrow("토큰 갱신 실패");
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/googleOAuth.test.ts
```

Expected: FAIL — `../googleOAuth` 모듈이 없음

- [ ] **Step 3: googleOAuth.ts 구현**

`calendar-proxy/src/googleOAuth.ts`:

```ts
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export const exchangeCodeForTokens = async (
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenResponse> => {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`토큰 교환 실패: ${res.status}`);
  return (await res.json()) as GoogleTokenResponse;
};

export const refreshAccessToken = async (
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenResponse> => {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    if (res.status === 400 && errBody.includes("invalid_grant")) {
      throw new Error("invalid_grant");
    }
    throw new Error(`토큰 갱신 실패: ${res.status}`);
  }
  return (await res.json()) as GoogleTokenResponse;
};
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/googleOAuth.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add calendar-proxy/src/googleOAuth.ts calendar-proxy/src/__tests__/googleOAuth.test.ts
git commit -m "feat(calendar-proxy): 구글 OAuth 토큰 교환/갱신"
```

---

## Task 4: Todo→이벤트 매핑 + 동시 요청 수 제한 실행기

**Files:**
- Create: `calendar-proxy/src/googleCalendar.ts`
- Test: `calendar-proxy/src/__tests__/googleCalendar.test.ts`

**Interfaces:**
- Consumes: 없음 (accessToken은 호출부가 Task 3으로 미리 발급)
- Produces: `interface SyncTodoItem { id: string; title: string; dueAt: string; googleEventId: string | null; action: "upsert" | "delete" }` — **`dueAt`은 ISO 타임스탬프가 아니라 클라이언트가 이미 로컬 타임존 기준으로 계산해 보낸 `"YYYY-MM-DD"` 날짜 키다** (아래 "왜 dueAt이 날짜 키인가" 참고), `interface SyncResult { id: string; googleEventId: string | null; error?: string }` (실패한 항목만 `error`를 채운다), `syncTodosToGoogleCalendar(todos: SyncTodoItem[], accessToken: string, concurrency?: number): Promise<SyncResult[]>` — **개별 항목이 실패해도 절대 reject하지 않고 그 항목만 `error`를 채워 반환한다** (아래 "왜 부분 실패를 흡수하는가" 참고). Task 6(sync-todos), 8(disconnect)이 사용.

**왜 dueAt이 날짜 키인가**: Cloudflare Workers는 항상 UTC로 동작해 "사용자의 로컬 타임존"이라는 개념이 없다. `Todo.dueAt`(Firestore 필드)은 UTC ISO 문자열로 저장되므로, Worker가 여기서 직접 `.slice(0, 10)`으로 날짜를 잘라내면 KST 자정~오전 8시59분 사이의 `dueAt`은 하루 전 날짜로 계산된다 — 이 프로젝트가 이미 한 번 겪고 고친 버그 클래스(`dueAt/startAt은 UTC Z 문자열 저장: 날짜 추출 시 split("T")[0] 금지, 로컬 변환 필수`)를 서버 쪽에서 재현하는 것이다. 유일하게 올바른 위치에서 변환하는 방법은 **사용자의 로컬 타임존을 실제로 아는 브라우저(클라이언트)가 미리 로컬 날짜 키로 변환해서 보내는 것**이다 — 클라이언트에는 이미 이 변환을 정확히 하는 `toDateKeyFromISO`(`client/src/shared/utils/date.ts`)가 있다(Task 13에서 사용). Worker는 이미 올바른 날짜 키를 받았다고 신뢰하고 그대로 쓴다.

**왜 부분 실패를 흡수하는가**: 25건을 동기화하다 14번째가 일시적 500 에러로 실패했을 때 전체를 reject하면, 이미 성공한 13건의 `googleEventId`를 호출부가 영영 못 받는다 — 구글 쪽엔 이벤트가 이미 생겼는데 ToDoDo는 그 사실을 몰라서, 다음 동기화 때 그 13건을 또 새로 만들어 중복 이벤트가 생긴다(이 프로젝트가 이미 겪은 `recurring-calendar-duplicate` 버그와 같은 실패 양상). 각 항목을 독립적으로 성공/실패 처리해서, 실패한 항목만 다음 실행에서 자연히 재시도되게 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`calendar-proxy/src/__tests__/googleCalendar.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { syncTodosToGoogleCalendar, type SyncTodoItem } from "../googleCalendar";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

describe("syncTodosToGoogleCalendar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("googleEventId가 없으면 POST로 새 이벤트를 생성한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-event-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-1", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: "new-event-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(CALENDAR_API_BASE);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      summary: "테스트",
      start: { date: "2026-09-01" },
      end: { date: "2026-09-02" },
    });
  });

  it("googleEventId가 있으면 PATCH로 기존 이벤트를 수정한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "existing-event-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      {
        id: "todo-1",
        title: "제목 변경",
        dueAt: "2026-09-01",
        googleEventId: "existing-event-id",
        action: "upsert",
      },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: "existing-event-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${CALENDAR_API_BASE}/existing-event-id`);
    expect(init.method).toBe("PATCH");
  });

  it("action이 delete면 DELETE 요청을 보내고 googleEventId null을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-1", title: "", dueAt: "", googleEventId: "event-to-delete", action: "delete" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: null }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${CALENDAR_API_BASE}/event-to-delete`);
    expect(init.method).toBe("DELETE");
  });

  it("삭제 대상 이벤트가 구글에 이미 없어도(404) 실패로 취급하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const todos: SyncTodoItem[] = [
      { id: "todo-1", title: "", dueAt: "", googleEventId: "already-gone", action: "delete" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");
    expect(results).toEqual([{ id: "todo-1", googleEventId: null }]);
  });

  it("동시 요청 수를 제한한다", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { ok: true, json: async () => ({ id: "event-id" }) };
      }),
    );

    const todos: SyncTodoItem[] = Array.from({ length: 25 }, (_, i) => ({
      id: `todo-${i}`,
      title: `할 일 ${i}`,
      dueAt: "2026-09-01",
      googleEventId: null,
      action: "upsert" as const,
    }));

    await syncTodosToGoogleCalendar(todos, "access-token", 5);

    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it("일부 항목이 실패해도 나머지 결과는 그대로 반환한다(전체 reject 안 함)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "event-success" }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-ok", title: "성공", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
      { id: "todo-fail", title: "실패", dueAt: "2026-09-02", googleEventId: null, action: "upsert" },
    ];

    // concurrency 1로 고정해 mockResolvedValueOnce 순서와 실행 순서를 일치시킨다.
    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([
      { id: "todo-ok", googleEventId: "event-success" },
      { id: "todo-fail", googleEventId: null, error: expect.stringContaining("500") },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/googleCalendar.test.ts
```

Expected: FAIL — `../googleCalendar` 모듈이 없음

- [ ] **Step 3: googleCalendar.ts 구현**

`calendar-proxy/src/googleCalendar.ts`:

```ts
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface SyncTodoItem {
  id: string;
  title: string;
  /** "YYYY-MM-DD" 로컬 캘린더 날짜 키. ISO 타임스탬프가 아니다 — 클라이언트가
   *  toDateKeyFromISO로 미리 변환해서 보낸 값을 그대로 신뢰한다. Worker는 UTC로만
   *  동작해 사용자의 로컬 타임존을 알 방법이 없으므로, 여기서 직접 ISO를 슬라이싱하면
   *  안 된다(자정 근처 시각에서 하루가 밀리는 버그). action이 "delete"면 빈 문자열이어도
   *  무방하다(사용되지 않음). */
  dueAt: string;
  googleEventId: string | null;
  action: "upsert" | "delete";
}

export interface SyncResult {
  id: string;
  googleEventId: string | null;
  /** 이 항목 처리가 실패했을 때만 채워진다. 있으면 googleEventId는 호출 전 값을
   *  그대로 반영한 것이라 신뢰할 수 없다 — 호출부는 이 항목을 다음 실행에서 다시
   *  시도해야 한다(스냅샷을 갱신하지 않는 방식으로). */
  error?: string;
}

const toGoogleEventBody = (todo: SyncTodoItem) => {
  const nextDay = new Date(`${todo.dueAt}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return {
    summary: todo.title,
    start: { date: todo.dueAt },
    end: { date: nextDay.toISOString().slice(0, 10) },
  };
};

export const runWithConcurrencyLimit = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const currentIndex = nextIndex;
    nextIndex += 1;
    if (currentIndex >= items.length) return;
    results[currentIndex] = await worker(items[currentIndex]);
    await runNext();
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, runNext));
  return results;
};

const syncOneOrThrow = async (todo: SyncTodoItem, accessToken: string): Promise<SyncResult> => {
  if (todo.action === "delete") {
    if (!todo.googleEventId) return { id: todo.id, googleEventId: null };
    const res = await fetch(`${CALENDAR_API_BASE}/${todo.googleEventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`이벤트 삭제 실패 (todo ${todo.id}): ${res.status}`);
    }
    return { id: todo.id, googleEventId: null };
  }

  const body = JSON.stringify(toGoogleEventBody(todo));
  const url = todo.googleEventId ? `${CALENDAR_API_BASE}/${todo.googleEventId}` : CALENDAR_API_BASE;
  const method = todo.googleEventId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`이벤트 ${method} 실패 (todo ${todo.id}): ${res.status}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: todo.id, googleEventId: data.id };
};

// syncOneOrThrow가 던지는 에러를 여기서 흡수한다 — 한 항목의 실패가 나머지 항목의
// 결과까지 지워버리면(Promise.all 전체 reject) 이미 구글에 반영된 항목의
// googleEventId를 호출부가 영영 못 받아 다음 실행에서 중복 이벤트를 만든다.
const syncOne = async (todo: SyncTodoItem, accessToken: string): Promise<SyncResult> => {
  try {
    return await syncOneOrThrow(todo, accessToken);
  } catch (error) {
    return {
      id: todo.id,
      googleEventId: todo.googleEventId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const syncTodosToGoogleCalendar = async (
  todos: SyncTodoItem[],
  accessToken: string,
  concurrency = 10,
): Promise<SyncResult[]> =>
  runWithConcurrencyLimit(todos, concurrency, (todo) => syncOne(todo, accessToken));
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/googleCalendar.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add calendar-proxy/src/googleCalendar.ts calendar-proxy/src/__tests__/googleCalendar.test.ts
git commit -m "feat(calendar-proxy): Todo-구글 이벤트 매핑 + 동시 요청 수 제한 실행기"
```

---

## Task 5: OAuth 시작/콜백 핸들러 + 라우터

**Files:**
- Create: `calendar-proxy/src/handlers/oauthStart.ts`
- Create: `calendar-proxy/src/handlers/oauthCallback.ts`
- Create: `calendar-proxy/src/index.ts`
- Test: `calendar-proxy/src/__tests__/oauthStart.test.ts`
- Test: `calendar-proxy/src/__tests__/oauthCallback.test.ts`

**Interfaces:**
- Consumes: `verifyFirebaseIdToken` (Task 1), `getTokenRecord`/`setTokenRecord`/`createOAuthState`/`consumeOAuthState` (Task 2), `exchangeCodeForTokens` (Task 3), `Env` (Task 1)
- Produces: `handleOAuthStart(request: Request, env: Env): Promise<Response>`, `handleOAuthCallback(request: Request, env: Env): Promise<Response>` — `index.ts`가 라우팅.

**보안**: `state`에는 uid를 직접 담지 않는다. `/oauth/callback`은 구글이 리다이렉트로 호출하는 엔드포인트라 Authorization 헤더가 없어 uid를 검증할 방법이 없다 — uid를 그대로 신뢰하면 누구든 자기 `code`와 피해자의 uid를 조합해 피해자의 토큰 레코드를 덮어쓸 수 있다(Task 2의 "왜 state에 uid를 직접 쓰면 안 되는가" 참고). 대신 `createOAuthState`/`consumeOAuthState`(Task 2)로 발급한 1회용 무작위 토큰을 주고받는다.

- [ ] **Step 1: 실패하는 테스트 작성 (oauthStart)**

`calendar-proxy/src/__tests__/oauthStart.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { handleOAuthStart } from "../handlers/oauthStart";
import type { Env } from "../env";

vi.mock("../auth", () => ({
  verifyFirebaseIdToken: vi.fn().mockResolvedValue({ uid: "user-123" }),
}));
vi.mock("../tokenStore", () => ({
  createOAuthState: vi.fn().mockResolvedValue("random-state-token"),
}));

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

describe("handleOAuthStart", () => {
  it("ID Token이 없으면 401을 반환한다", async () => {
    const request = new Request("https://proxy.example.com/oauth/start");
    const response = await handleOAuthStart(request, makeEnv());
    expect(response.status).toBe(401);
  });

  it("유효한 요청이면 발급받은 state 토큰이 담긴 authUrl을 반환한다 (uid를 직접 담지 않는다)", async () => {
    const { createOAuthState } = await import("../tokenStore");
    const request = new Request("https://proxy.example.com/oauth/start", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const response = await handleOAuthStart(request, makeEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { authUrl: string };
    expect(vi.mocked(createOAuthState)).toHaveBeenCalledWith(expect.anything(), "user-123");
    expect(body.authUrl).toContain("state=random-state-token");
    expect(body.authUrl).not.toContain("state=user-123");
    expect(body.authUrl).toContain("scope=");
    expect(body.authUrl).toContain(encodeURIComponent("calendar.events"));
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/oauthStart.test.ts
```

Expected: FAIL — `../handlers/oauthStart` 모듈이 없음

- [ ] **Step 3: oauthStart.ts 구현**

`calendar-proxy/src/handlers/oauthStart.ts`:

```ts
import type { Env } from "../env";
import { verifyFirebaseIdToken } from "../auth";
import { createOAuthState } from "../tokenStore";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const buildAuthUrl = (state: string, redirectUri: string, clientId: string): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.events",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

export const handleOAuthStart = async (request: Request, env: Env): Promise<Response> => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const state = await createOAuthState(env.CALENDAR_TOKENS, uid);
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/oauth/callback`;
  const authUrl = buildAuthUrl(state, redirectUri, env.GOOGLE_CLIENT_ID);

  return new Response(JSON.stringify({ authUrl }), {
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/oauthStart.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: 실패하는 테스트 작성 (oauthCallback)**

`calendar-proxy/src/__tests__/oauthCallback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleOAuthCallback } from "../handlers/oauthCallback";
import type { Env } from "../env";

vi.mock("../googleOAuth", () => ({
  exchangeCodeForTokens: vi.fn(),
}));
vi.mock("../tokenStore", () => ({
  setTokenRecord: vi.fn(),
  consumeOAuthState: vi.fn(),
}));

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

describe("handleOAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("code나 state가 없으면 에러 페이지로 리다이렉트한다", async () => {
    const request = new Request("https://proxy.example.com/oauth/callback");
    const response = await handleOAuthCallback(request, makeEnv());
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("calendarError=1");
  });

  it("state가 유효하지 않으면(위조·만료·재사용) 에러 페이지로 리다이렉트하고 토큰 교환을 시도하지 않는다", async () => {
    const { consumeOAuthState } = await import("../tokenStore");
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    vi.mocked(consumeOAuthState).mockResolvedValue(null);

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=forged-or-expired",
    );
    const response = await handleOAuthCallback(request, makeEnv());

    expect(response.headers.get("Location")).toContain("calendarError=1");
    expect(vi.mocked(exchangeCodeForTokens)).not.toHaveBeenCalled();
  });

  it("토큰 교환에 성공하면 state가 가리키던 uid로 저장하고 성공 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    const { setTokenRecord, consumeOAuthState } = await import("../tokenStore");
    vi.mocked(consumeOAuthState).mockResolvedValue("user-123");
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
    });

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=random-state-token",
    );
    const response = await handleOAuthCallback(request, makeEnv());

    expect(vi.mocked(consumeOAuthState)).toHaveBeenCalledWith(expect.anything(), "random-state-token");
    expect(vi.mocked(setTokenRecord)).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
      { refreshToken: "rt" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("calendarConnected=1");
  });

  it("refresh_token이 없으면 에러 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    const { consumeOAuthState } = await import("../tokenStore");
    vi.mocked(consumeOAuthState).mockResolvedValue("user-123");
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: "at",
      expires_in: 3600,
    });

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=random-state-token",
    );
    const response = await handleOAuthCallback(request, makeEnv());
    expect(response.headers.get("Location")).toContain("calendarError=1");
  });

  it("토큰 교환이 실패하면 에러 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    const { consumeOAuthState } = await import("../tokenStore");
    vi.mocked(consumeOAuthState).mockResolvedValue("user-123");
    vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error("토큰 교환 실패: 400"));

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=random-state-token",
    );
    const response = await handleOAuthCallback(request, makeEnv());
    expect(response.headers.get("Location")).toContain("calendarError=1");
  });
});
```

- [ ] **Step 6: 테스트 실행해서 실패 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/oauthCallback.test.ts
```

Expected: FAIL — `../handlers/oauthCallback` 모듈이 없음

- [ ] **Step 7: oauthCallback.ts 구현**

`calendar-proxy/src/handlers/oauthCallback.ts`:

```ts
import type { Env } from "../env";
import { exchangeCodeForTokens } from "../googleOAuth";
import { setTokenRecord, consumeOAuthState } from "../tokenStore";

export const handleOAuthCallback = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return Response.redirect(`${env.CLIENT_APP_URL}/dashboard/calendar?calendarError=1`, 302);
  }

  // state는 /oauth/start가 발급한 1회용 토큰이다 — 여기서 실제 uid로 교환하고
  // 즉시 소비한다. uid 자체를 state로 왕복시키면 Authorization 헤더가 없는 이
  // 엔드포인트에서 누구든 다른 사용자의 uid를 흉내 낼 수 있다.
  const uid = await consumeOAuthState(env.CALENDAR_TOKENS, state);
  if (!uid) {
    return Response.redirect(`${env.CLIENT_APP_URL}/dashboard/calendar?calendarError=1`, 302);
  }

  try {
    const redirectUri = `${url.origin}/oauth/callback`;
    const tokens = await exchangeCodeForTokens(
      code,
      redirectUri,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    if (!tokens.refresh_token) {
      throw new Error("refresh_token 없음");
    }
    await setTokenRecord(env.CALENDAR_TOKENS, uid, { refreshToken: tokens.refresh_token });
    return Response.redirect(`${env.CLIENT_APP_URL}/dashboard/calendar?calendarConnected=1`, 302);
  } catch (error) {
    console.error("OAuth 콜백 실패:", error);
    return Response.redirect(`${env.CLIENT_APP_URL}/dashboard/calendar?calendarError=1`, 302);
  }
};
```

- [ ] **Step 8: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/oauthCallback.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 9: 라우터(index.ts) 작성 — 지금까지 만든 두 핸들러만 연결**

`calendar-proxy/src/index.ts`:

```ts
import type { Env } from "./env";
import { handleOAuthStart } from "./handlers/oauthStart";
import { handleOAuthCallback } from "./handlers/oauthCallback";

const ALLOWED_ORIGIN = "https://tododo-83576.web.app";

const withCors = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/oauth/start" && request.method === "GET") {
      return withCors(await handleOAuthStart(request, env));
    }
    if (url.pathname === "/oauth/callback" && request.method === "GET") {
      // 구글 리다이렉트가 직접 호출하는 풀 페이지 네비게이션이라 CORS 불필요
      return handleOAuthCallback(request, env);
    }

    return withCors(new Response("Not Found", { status: 404 }));
  },
};
```

- [ ] **Step 10: 커밋**

```bash
git add calendar-proxy/src/handlers/oauthStart.ts calendar-proxy/src/handlers/oauthCallback.ts \
  calendar-proxy/src/index.ts calendar-proxy/src/__tests__/oauthStart.test.ts \
  calendar-proxy/src/__tests__/oauthCallback.test.ts
git commit -m "feat(calendar-proxy): OAuth 시작/콜백 핸들러 + 라우터"
```

---

## Task 6: /sync-todos 핸들러

**Files:**
- Create: `calendar-proxy/src/handlers/syncTodos.ts`
- Modify: `calendar-proxy/src/index.ts`
- Test: `calendar-proxy/src/__tests__/syncTodos.test.ts`

**Interfaces:**
- Consumes: `verifyFirebaseIdToken` (Task 1), `getTokenRecord`/`deleteTokenRecord` (Task 2), `refreshAccessToken` (Task 3), `syncTodosToGoogleCalendar` (Task 4)
- Produces: `handleSyncTodos(request: Request, env: Env): Promise<Response>`

- [ ] **Step 1: 실패하는 테스트 작성**

`calendar-proxy/src/__tests__/syncTodos.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSyncTodos } from "../handlers/syncTodos";
import type { Env } from "../env";

vi.mock("../auth", () => ({
  verifyFirebaseIdToken: vi.fn(),
}));
vi.mock("../tokenStore", () => ({
  getTokenRecord: vi.fn(),
  deleteTokenRecord: vi.fn(),
}));
vi.mock("../googleOAuth", () => ({
  refreshAccessToken: vi.fn(),
}));
vi.mock("../googleCalendar", () => ({
  syncTodosToGoogleCalendar: vi.fn(),
}));

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

const makeRequest = (body: unknown, authorized = true) =>
  new Request("https://proxy.example.com/sync-todos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorized ? { Authorization: "Bearer valid-token" } : {}),
    },
    body: JSON.stringify(body),
  });

describe("handleSyncTodos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await handleSyncTodos(makeRequest({ todos: [] }, false), makeEnv());
    expect(response.status).toBe(401);
  });

  it("연동되지 않은 사용자면 409를 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue(null);

    const response = await handleSyncTodos(makeRequest({ todos: [] }), makeEnv());
    expect(response.status).toBe(409);
  });

  it("정상 흐름이면 결과 배열을 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");
    const { syncTodosToGoogleCalendar } = await import("../googleCalendar");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockResolvedValue({ access_token: "at", expires_in: 3600 });
    vi.mocked(syncTodosToGoogleCalendar).mockResolvedValue([
      { id: "todo-1", googleEventId: "event-1" },
    ]);

    const todos = [
      { id: "todo-1", title: "제목", dueAt: "2026-09-01", googleEventId: null, action: "upsert" as const },
    ];
    const response = await handleSyncTodos(makeRequest({ todos }), makeEnv());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: unknown[] };
    expect(body.results).toEqual([{ id: "todo-1", googleEventId: "event-1" }]);
  });

  it("리프레시 토큰이 철회됐으면(invalid_grant) 토큰을 지우고 401을 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord, deleteTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error("invalid_grant"));

    const response = await handleSyncTodos(makeRequest({ todos: [] }), makeEnv());

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("revoked");
    expect(vi.mocked(deleteTokenRecord)).toHaveBeenCalledWith(expect.anything(), "user-1");
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/syncTodos.test.ts
```

Expected: FAIL — `../handlers/syncTodos` 모듈이 없음

- [ ] **Step 3: syncTodos.ts 구현**

`calendar-proxy/src/handlers/syncTodos.ts`:

```ts
import type { Env } from "../env";
import { verifyFirebaseIdToken } from "../auth";
import { getTokenRecord, deleteTokenRecord } from "../tokenStore";
import { refreshAccessToken } from "../googleOAuth";
import { syncTodosToGoogleCalendar, type SyncTodoItem } from "../googleCalendar";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handleSyncTodos = async (request: Request, env: Env): Promise<Response> => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!idToken) return new Response("Unauthorized", { status: 401 });

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const tokenRecord = await getTokenRecord(env.CALENDAR_TOKENS, uid);
  if (!tokenRecord) {
    return jsonResponse({ error: "not_connected" }, 409);
  }

  const { todos } = (await request.json()) as { todos: SyncTodoItem[] };

  let accessToken: string;
  try {
    const refreshed = await refreshAccessToken(
      tokenRecord.refreshToken,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    accessToken = refreshed.access_token;
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_grant") {
      await deleteTokenRecord(env.CALENDAR_TOKENS, uid);
      return jsonResponse({ error: "revoked" }, 401);
    }
    return jsonResponse({ error: "google_api_error" }, 502);
  }

  const results = await syncTodosToGoogleCalendar(todos, accessToken);
  return jsonResponse({ results });
};
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/syncTodos.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: index.ts에 라우트 추가**

`calendar-proxy/src/index.ts`의 import와 라우팅 블록을 아래처럼 수정:

```ts
import { handleSyncTodos } from "./handlers/syncTodos";
```

`/oauth/callback` 분기 바로 아래에 추가:

```ts
    if (url.pathname === "/sync-todos" && request.method === "POST") {
      return withCors(await handleSyncTodos(request, env));
    }
```

- [ ] **Step 6: 커밋**

```bash
git add calendar-proxy/src/handlers/syncTodos.ts calendar-proxy/src/index.ts \
  calendar-proxy/src/__tests__/syncTodos.test.ts
git commit -m "feat(calendar-proxy): /sync-todos 핸들러"
```

---

## Task 7: /events 핸들러

**Files:**
- Create: `calendar-proxy/src/handlers/events.ts`
- Modify: `calendar-proxy/src/index.ts`
- Test: `calendar-proxy/src/__tests__/events.test.ts`

**Interfaces:**
- Consumes: `verifyFirebaseIdToken` (Task 1), `getTokenRecord`/`deleteTokenRecord` (Task 2), `refreshAccessToken` (Task 3)
- Produces: `handleGetEvents(request: Request, env: Env): Promise<Response>`, 응답 바디 `{ events: Array<{ id: string; title: string; start: string; end: string }> }`

- [ ] **Step 1: 실패하는 테스트 작성**

`calendar-proxy/src/__tests__/events.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleGetEvents } from "../handlers/events";
import type { Env } from "../env";

vi.mock("../auth", () => ({
  verifyFirebaseIdToken: vi.fn(),
}));
vi.mock("../tokenStore", () => ({
  getTokenRecord: vi.fn(),
  deleteTokenRecord: vi.fn(),
}));
vi.mock("../googleOAuth", () => ({
  refreshAccessToken: vi.fn(),
}));

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

const makeRequest = () =>
  new Request("https://proxy.example.com/events", {
    headers: { Authorization: "Bearer valid-token" },
  });

describe("handleGetEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("연동되지 않은 사용자면 빈 이벤트 배열을 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue(null);

    const response = await handleGetEvents(makeRequest(), makeEnv());
    const body = (await response.json()) as { events: unknown[] };
    expect(body.events).toEqual([]);
  });

  it("구글 이벤트를 title/start/end 형태로 매핑해 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockResolvedValue({ access_token: "at", expires_in: 3600 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "g-event-1",
              summary: "팀 회의",
              start: { date: "2026-09-05" },
              end: { date: "2026-09-06" },
            },
          ],
        }),
      }),
    );

    const response = await handleGetEvents(makeRequest(), makeEnv());
    const body = (await response.json()) as { events: unknown[] };
    expect(body.events).toEqual([
      { id: "g-event-1", title: "팀 회의", start: "2026-09-05", end: "2026-09-06" },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/events.test.ts
```

Expected: FAIL — `../handlers/events` 모듈이 없음

- [ ] **Step 3: events.ts 구현**

`calendar-proxy/src/handlers/events.ts`:

```ts
import type { Env } from "../env";
import { verifyFirebaseIdToken } from "../auth";
import { getTokenRecord, deleteTokenRecord } from "../tokenStore";
import { refreshAccessToken } from "../googleOAuth";

interface GoogleEventItem {
  id: string;
  summary?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handleGetEvents = async (request: Request, env: Env): Promise<Response> => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const tokenRecord = await getTokenRecord(env.CALENDAR_TOKENS, uid);
  if (!tokenRecord) {
    return jsonResponse({ events: [] });
  }

  let accessToken: string;
  try {
    const refreshed = await refreshAccessToken(
      tokenRecord.refreshToken,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    accessToken = refreshed.access_token;
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_grant") {
      await deleteTokenRecord(env.CALENDAR_TOKENS, uid);
      return jsonResponse({ error: "revoked" }, 401);
    }
    return jsonResponse({ error: "google_api_error" }, 502);
  }

  const requestUrl = new URL(request.url);
  const timeMin = requestUrl.searchParams.get("timeMin") ?? new Date().toISOString();
  const timeMax =
    requestUrl.searchParams.get("timeMax") ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const eventsUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  eventsUrl.searchParams.set("timeMin", timeMin);
  eventsUrl.searchParams.set("timeMax", timeMax);
  eventsUrl.searchParams.set("singleEvents", "true");

  const res = await fetch(eventsUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return jsonResponse({ error: "google_api_error" }, 502);
  }
  const data = (await res.json()) as { items: GoogleEventItem[] };

  const events = data.items.map((item) => ({
    id: item.id,
    title: item.summary ?? "(제목 없음)",
    start: item.start.date ?? item.start.dateTime ?? "",
    end: item.end.date ?? item.end.dateTime ?? "",
  }));

  return jsonResponse({ events });
};
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/events.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: index.ts에 라우트 추가**

`calendar-proxy/src/index.ts`에 import 추가:

```ts
import { handleGetEvents } from "./handlers/events";
```

`/sync-todos` 분기 아래에 추가:

```ts
    if (url.pathname === "/events" && request.method === "GET") {
      return withCors(await handleGetEvents(request, env));
    }
```

- [ ] **Step 6: 커밋**

```bash
git add calendar-proxy/src/handlers/events.ts calendar-proxy/src/index.ts \
  calendar-proxy/src/__tests__/events.test.ts
git commit -m "feat(calendar-proxy): /events 핸들러"
```

---

## Task 8: /disconnect 핸들러

**Files:**
- Create: `calendar-proxy/src/handlers/disconnect.ts`
- Modify: `calendar-proxy/src/index.ts`
- Test: `calendar-proxy/src/__tests__/disconnect.test.ts`

**Interfaces:**
- Consumes: `verifyFirebaseIdToken` (Task 1), `getTokenRecord`/`deleteTokenRecord` (Task 2), `refreshAccessToken` (Task 3), `syncTodosToGoogleCalendar` (Task 4)
- Produces: `handleDisconnect(request: Request, env: Env): Promise<Response>`

- [ ] **Step 1: 실패하는 테스트 작성**

`calendar-proxy/src/__tests__/disconnect.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDisconnect } from "../handlers/disconnect";
import type { Env } from "../env";

vi.mock("../auth", () => ({
  verifyFirebaseIdToken: vi.fn(),
}));
vi.mock("../tokenStore", () => ({
  getTokenRecord: vi.fn(),
  deleteTokenRecord: vi.fn(),
}));
vi.mock("../googleOAuth", () => ({
  refreshAccessToken: vi.fn(),
}));
vi.mock("../googleCalendar", () => ({
  syncTodosToGoogleCalendar: vi.fn(),
}));

const makeEnv = (): Env => ({
  CALENDAR_TOKENS: {} as never,
  FIREBASE_PROJECT_ID: "tododo-test",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  CLIENT_APP_URL: "https://app.example.com",
});

const makeRequest = (googleEventIds: string[]) =>
  new Request("https://proxy.example.com/disconnect", {
    method: "POST",
    headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
    body: JSON.stringify({ googleEventIds }),
  });

describe("handleDisconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("매핑된 이벤트를 모두 삭제 요청한 뒤 토큰을 지운다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord, deleteTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");
    const { syncTodosToGoogleCalendar } = await import("../googleCalendar");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockResolvedValue({ access_token: "at", expires_in: 3600 });
    vi.mocked(syncTodosToGoogleCalendar).mockResolvedValue([]);

    const response = await handleDisconnect(makeRequest(["event-1", "event-2"]), makeEnv());

    expect(vi.mocked(syncTodosToGoogleCalendar)).toHaveBeenCalledWith(
      [
        { id: "event-1", title: "", dueAt: "", googleEventId: "event-1", action: "delete" },
        { id: "event-2", title: "", dueAt: "", googleEventId: "event-2", action: "delete" },
      ],
      "at",
    );
    expect(vi.mocked(deleteTokenRecord)).toHaveBeenCalledWith(expect.anything(), "user-1");
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("이벤트 삭제 중 에러가 나도 토큰은 반드시 지운다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord, deleteTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error("google down"));

    const response = await handleDisconnect(makeRequest(["event-1"]), makeEnv());

    expect(vi.mocked(deleteTokenRecord)).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(response.status).toBe(200);
  });

  it("요청 바디가 비어 있거나 잘못된 JSON이어도 토큰은 반드시 지운다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord, deleteTokenRecord } = await import("../tokenStore");
    const { refreshAccessToken } = await import("../googleOAuth");
    const { syncTodosToGoogleCalendar } = await import("../googleCalendar");

    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue({ refreshToken: "rt" });
    vi.mocked(refreshAccessToken).mockResolvedValue({ access_token: "at", expires_in: 3600 });
    vi.mocked(syncTodosToGoogleCalendar).mockResolvedValue([]);

    const emptyBodyRequest = new Request("https://proxy.example.com/disconnect", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });
    const response = await handleDisconnect(emptyBodyRequest, makeEnv());

    expect(vi.mocked(deleteTokenRecord)).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(vi.mocked(syncTodosToGoogleCalendar)).toHaveBeenCalledWith([], "at");
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("Authorization 헤더가 없으면 401을 반환하고 아무 것도 호출하지 않는다", async () => {
    const { getTokenRecord } = await import("../tokenStore");

    const request = new Request("https://proxy.example.com/disconnect", { method: "POST" });
    const response = await handleDisconnect(request, makeEnv());

    expect(response.status).toBe(401);
    expect(vi.mocked(getTokenRecord)).not.toHaveBeenCalled();
  });

  it("이미 연동 안 된 사용자면 바로 성공을 반환한다", async () => {
    const { verifyFirebaseIdToken } = await import("../auth");
    const { getTokenRecord } = await import("../tokenStore");
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "user-1" });
    vi.mocked(getTokenRecord).mockResolvedValue(null);

    const response = await handleDisconnect(makeRequest([]), makeEnv());
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/disconnect.test.ts
```

Expected: FAIL — `../handlers/disconnect` 모듈이 없음

- [ ] **Step 3: disconnect.ts 구현**

`calendar-proxy/src/handlers/disconnect.ts`:

```ts
import type { Env } from "../env";
import { verifyFirebaseIdToken } from "../auth";
import { getTokenRecord, deleteTokenRecord } from "../tokenStore";
import { refreshAccessToken } from "../googleOAuth";
import { syncTodosToGoogleCalendar, type SyncTodoItem } from "../googleCalendar";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handleDisconnect = async (request: Request, env: Env): Promise<Response> => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const tokenRecord = await getTokenRecord(env.CALENDAR_TOKENS, uid);
  if (!tokenRecord) {
    return jsonResponse({ ok: true });
  }

  // 요청 바디 파싱(빈 바디, 잘못된 JSON, googleEventIds 누락)까지 이 try 안에
  // 넣는다 — "연동 해제는 반드시 끝까지 진행된다"는 불변식이 구글 API 실패뿐
  // 아니라 바디 파싱 실패에도 깨지면 안 되기 때문이다. 파싱에 실패하면 삭제할
  // 이벤트가 없다고 보고 빈 배열로 진행한다.
  try {
    const { googleEventIds } = (await request.json().catch(() => ({}))) as {
      googleEventIds?: string[];
    };
    const refreshed = await refreshAccessToken(
      tokenRecord.refreshToken,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    const deleteItems: SyncTodoItem[] = (googleEventIds ?? []).map((googleEventId) => ({
      id: googleEventId,
      title: "",
      dueAt: "",
      googleEventId,
      action: "delete" as const,
    }));
    await syncTodosToGoogleCalendar(deleteItems, refreshed.access_token);
  } catch (error) {
    // 토큰이 이미 철회됐거나 구글 API가 실패해도 ToDoDo 쪽 연동 해제는 반드시
    // 끝까지 진행한다 — 사용자 입장에서 "연동 끊기"가 안 되면 안 되고,
    // 구글 쪽 이벤트 정리는 최선 노력(best-effort)일 뿐이다.
    console.error("연동 해제 중 이벤트 삭제 실패:", error);
  }

  await deleteTokenRecord(env.CALENDAR_TOKENS, uid);
  return jsonResponse({ ok: true });
};
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/disconnect.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: index.ts에 라우트 추가하고 전체 Worker 테스트 실행**

`calendar-proxy/src/index.ts`에 import 추가:

```ts
import { handleDisconnect } from "./handlers/disconnect";
```

`/events` 분기 아래에 추가:

```ts
    if (url.pathname === "/disconnect" && request.method === "POST") {
      return withCors(await handleDisconnect(request, env));
    }
```

전체 테스트와 타입체크 실행:

```bash
cd calendar-proxy && npm test && npm run typecheck
```

Expected: 모든 테스트 PASS, 타입 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add calendar-proxy/src/handlers/disconnect.ts calendar-proxy/src/index.ts \
  calendar-proxy/src/__tests__/disconnect.test.ts
git commit -m "feat(calendar-proxy): /disconnect 핸들러 — Worker 엔드포인트 완성"
```

---

## Task 9: Todo 타입 확장 + firestore.rules

**Files:**
- Modify: `client/src/features/todo/types/todo.type.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Produces: `Todo.googleEventId?: string | null` — Task 12, 13이 사용. `calendarIntegrations/{userId}` Firestore 규칙 — Task 11이 그 문서를 읽고 쓴다.

- [ ] **Step 1: Todo 타입에 필드 추가**

`client/src/features/todo/types/todo.type.ts`의 `Todo` 인터페이스 마지막(`overdueArchived?` 다음)에 추가:

```ts
  /** 구글 캘린더에 매핑된 이벤트 ID. 연동 안 됐거나 아직 동기화 전이면 없음(optional).
   *  useSyncTodosToCalendar가 /sync-todos 응답을 받아 기록한다. */
  googleEventId?: string | null;
```

- [ ] **Step 2: firestore.rules에 calendarIntegrations 블록 추가**

`firestore.rules`의 `feedback` 블록 뒤(닫는 `}` 앞)에 추가:

```
    match /calendarIntegrations/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
```

- [ ] **Step 3: 클라이언트 타입체크 + 테스트 실행**

```bash
cd client && npx tsc -b --noEmit && npm run test
```

Expected: 타입 에러 없음, 기존 테스트 전부 PASS (이 변경은 optional 필드 추가 + 새 규칙 추가라 기존 동작에 영향 없음)

- [ ] **Step 4: 커밋**

```bash
git add client/src/features/todo/types/todo.type.ts firestore.rules
git commit -m "feat(client): Todo에 googleEventId 필드, calendarIntegrations 보안 규칙 추가"
```

---

## Task 10: calendarProxyApi.ts

**Files:**
- Create: `client/src/features/calendarIntegration/api/calendarProxyApi.ts`
- Create: `client/src/features/calendarIntegration/api/index.ts`
- Test: `client/src/features/calendarIntegration/api/__tests__/calendarProxyApi.test.ts`
- Modify: `client/.env.example` (있다면) 또는 `client/CLAUDE.md`의 환경변수 안내

**Interfaces:**
- Consumes: `auth` (from `@/shared/lib/firebase`)
- Produces: `getOAuthStartUrl(): Promise<string>`, `interface SyncTodoPayload`, `interface SyncTodoResult`, `syncTodosToCalendar(todos: SyncTodoPayload[]): Promise<SyncTodoResult[]>`, `interface GoogleCalendarEvent`, `getGoogleCalendarEvents(): Promise<GoogleCalendarEvent[]>`, `disconnectCalendar(googleEventIds: string[]): Promise<void>` — Task 11, 13, 14가 사용. `SyncTodoPayload.dueAt`은 Task 4의 `SyncTodoItem.dueAt`과 동일하게 **`"YYYY-MM-DD"` 로컬 날짜 키**다(ISO 타임스탬프 아님) — Task 13이 `toDateKeyFromISO`로 변환해서 채운다. `SyncTodoResult.error?: string`도 Task 4의 `SyncResult`와 동일하게 실패한 항목에만 채워진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/calendarIntegration/api/__tests__/calendarProxyApi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1", getIdToken: vi.fn().mockResolvedValue("id-token") } },
  googleProvider: {},
}));

vi.stubEnv("VITE_CALENDAR_PROXY_URL", "https://proxy.example.com");

import {
  getOAuthStartUrl,
  syncTodosToCalendar,
  getGoogleCalendarEvents,
  disconnectCalendar,
  CalendarRevokedError,
} from "../calendarProxyApi";

describe("calendarProxyApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getOAuthStartUrl은 Authorization 헤더를 붙여 /oauth/start를 호출하고 authUrl을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authUrl: "https://accounts.google.com/consent" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const authUrl = await getOAuthStartUrl();

    expect(authUrl).toBe("https://accounts.google.com/consent");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/oauth/start");
    expect(init.headers.Authorization).toBe("Bearer id-token");
  });

  it("getOAuthStartUrl은 응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(getOAuthStartUrl()).rejects.toThrow("OAuth 시작 실패");
  });

  it("syncTodosToCalendar는 Authorization 헤더를 붙여 /sync-todos를 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: "todo-1", googleEventId: "event-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos = [
      { id: "todo-1", title: "제목", dueAt: "2026-09-01", googleEventId: null, action: "upsert" as const },
    ];
    const result = await syncTodosToCalendar(todos);

    expect(result).toEqual([{ id: "todo-1", googleEventId: "event-1" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/sync-todos");
    expect(init.headers.Authorization).toBe("Bearer id-token");
  });

  it("응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(syncTodosToCalendar([])).rejects.toThrow("동기화 실패");
  });

  it("401 응답이 {error: revoked}이면 CalendarRevokedError를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "revoked" }),
      }),
    );
    await expect(syncTodosToCalendar([])).rejects.toThrow(CalendarRevokedError);
  });

  it("401 응답이어도 revoked가 아니면 일반 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    );
    await expect(syncTodosToCalendar([])).rejects.toThrow("동기화 실패");
  });

  it("getGoogleCalendarEvents는 Authorization 헤더를 붙여 /events를 호출해 이벤트 목록을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const events = await getGoogleCalendarEvents();

    expect(events).toEqual([{ id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/events");
    expect(init.headers.Authorization).toBe("Bearer id-token");
  });

  it("getGoogleCalendarEvents는 응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await expect(getGoogleCalendarEvents()).rejects.toThrow("이벤트 조회 실패");
  });

  it("disconnectCalendar는 Authorization 헤더를 붙이고 googleEventIds를 담아 /disconnect를 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await disconnectCalendar(["event-1", "event-2"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/disconnect");
    expect(init.headers.Authorization).toBe("Bearer id-token");
    expect(JSON.parse(init.body)).toEqual({ googleEventIds: ["event-1", "event-2"] });
  });

  it("disconnectCalendar는 응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(disconnectCalendar([])).rejects.toThrow("연동 해제 실패");
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/api/__tests__/calendarProxyApi.test.ts
```

Expected: FAIL — `../calendarProxyApi` 모듈이 없음

- [ ] **Step 3: calendarProxyApi.ts 구현**

`client/src/features/calendarIntegration/api/calendarProxyApi.ts`:

```ts
import { auth } from "@/shared/lib/firebase";

const CALENDAR_PROXY_URL = import.meta.env.VITE_CALENDAR_PROXY_URL as string;

const authorizedFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();
  return fetch(`${CALENDAR_PROXY_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${idToken}`,
    },
  });
};

export const getOAuthStartUrl = async (): Promise<string> => {
  const res = await authorizedFetch("/oauth/start");
  if (!res.ok) throw new Error("OAuth 시작 실패");
  const data = (await res.json()) as { authUrl: string };
  return data.authUrl;
};

export interface SyncTodoPayload {
  id: string;
  title: string;
  /** "YYYY-MM-DD" 로컬 캘린더 날짜 키. ISO 타임스탬프가 아니다 — 호출부(useSyncTodosToCalendar)가
   *  toDateKeyFromISO로 변환해서 채운다. */
  dueAt: string;
  googleEventId: string | null;
  action: "upsert" | "delete";
}

export interface SyncTodoResult {
  id: string;
  googleEventId: string | null;
  /** 이 항목이 실패했을 때만 채워진다. 있으면 googleEventId는 신뢰하지 말고,
   *  이 항목은 다음 동기화 실행에서 다시 시도되도록 둔다(스냅샷 갱신 안 함). */
  error?: string;
}

/** Worker가 리프레시 토큰 철회(invalid_grant)를 감지하면 401 `{error:"revoked"}`를
 *  반환한다(Task 6). 일반 401(잘못된 ID Token)과 구분해야 호출부가 "다시
 *  연결해주세요" 상태로 전환할지 판단할 수 있으므로, 이 경우만 별도 에러
 *  타입으로 구분해서 던진다. */
export class CalendarRevokedError extends Error {
  constructor() {
    super("구글 캘린더 연동이 해제되었습니다");
    this.name = "CalendarRevokedError";
  }
}

export const syncTodosToCalendar = async (
  todos: SyncTodoPayload[],
): Promise<SyncTodoResult[]> => {
  const res = await authorizedFetch("/sync-todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ todos }),
  });
  if (res.status === 401) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "revoked") throw new CalendarRevokedError();
    throw new Error(`동기화 실패: ${res.status}`);
  }
  if (!res.ok) throw new Error(`동기화 실패: ${res.status}`);
  const data = (await res.json()) as { results: SyncTodoResult[] };
  return data.results;
};

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

export const getGoogleCalendarEvents = async (): Promise<GoogleCalendarEvent[]> => {
  const res = await authorizedFetch("/events");
  if (!res.ok) throw new Error("이벤트 조회 실패");
  const data = (await res.json()) as { events: GoogleCalendarEvent[] };
  return data.events;
};

export const disconnectCalendar = async (googleEventIds: string[]): Promise<void> => {
  const res = await authorizedFetch("/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ googleEventIds }),
  });
  if (!res.ok) throw new Error("연동 해제 실패");
};
```

`client/src/features/calendarIntegration/api/index.ts`:

```ts
export * from "./calendarProxyApi";
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/api/__tests__/calendarProxyApi.test.ts
```

Expected: PASS (10 tests)

- [ ] **Step 5: 환경변수 문서화**

`client/CLAUDE.md`의 데이터 모델 섹션 뒤에 한 줄 추가:

```markdown
## 환경변수 (추가)

구글 캘린더 연동은 `VITE_CALENDAR_PROXY_URL`(Cloudflare Worker 배포 URL)이 추가로 필요하다.
```

`client/.env`(로컬, git 미추적)에 실제 배포된 Worker URL을 `VITE_CALENDAR_PROXY_URL=https://tododo-calendar-proxy.<subdomain>.workers.dev` 형태로 채운다. 이 값은 Task 1에서 `calendar-proxy`를 최초 배포(`npx wrangler deploy`)한 뒤에만 알 수 있으므로, 로컬 개발 중에는 `npx wrangler dev`로 뜬 로컬 URL(보통 `http://localhost:8787`)을 임시로 넣어도 된다.

- [ ] **Step 6: 커밋**

```bash
git add client/src/features/calendarIntegration/api/ client/CLAUDE.md
git commit -m "feat(client): 캘린더 프록시 Worker fetch wrapper (calendarProxyApi)"
```

---

## Task 11: useCalendarIntegration 훅

**Files:**
- Create: `client/src/features/calendarIntegration/hooks/useCalendarIntegration.ts`
- Create: `client/src/features/calendarIntegration/hooks/index.ts`
- Test: `client/src/features/calendarIntegration/hooks/__tests__/useCalendarIntegration.test.tsx`

**Interfaces:**
- Consumes: `getOAuthStartUrl`, `disconnectCalendar` (Task 10), `auth`/`db` (shared lib)
- Produces: `useCalendarIntegrationStatus(): UseQueryResult<{ connected: boolean; status: "active" | "revoked" }>`, `useConnectCalendar(): { connect: () => Promise<void> }`, `useDisconnectCalendar(): { disconnect: (googleEventIds: string[]) => Promise<void> }`, `useMarkCalendarConnected(): { markConnected: () => Promise<void> }` — Task 12(버튼), 13(diff 훅)이 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/calendarIntegration/hooks/__tests__/useCalendarIntegration.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCalendarIntegrationStatus,
  useConnectCalendar,
  useDisconnectCalendar,
  useMarkCalendarConnected,
} from "../useCalendarIntegration";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));
vi.mock("../../api", () => ({
  getOAuthStartUrl: vi.fn(),
  disconnectCalendar: vi.fn(),
}));

// queryClient를 함께 반환한다 — 테스트가 invalidateQueries 호출 여부를
// spyOn으로 검증하려면 훅이 실제로 쓰는 인스턴스를 손에 쥐고 있어야 한다.
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
};

describe("useCalendarIntegrationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("문서가 없으면 connected: false를 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCalendarIntegrationStatus(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: false, status: "active" });
  });

  it("문서가 있으면 그 값을 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ connected: true, status: "active" }),
    } as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCalendarIntegrationStatus(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: true, status: "active" });
  });
});

describe("useConnectCalendar", () => {
  it("connect는 authUrl로 페이지를 이동시킨다", async () => {
    const { getOAuthStartUrl } = await import("../../api");
    vi.mocked(getOAuthStartUrl).mockResolvedValue("https://accounts.google.com/consent");

    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: "" },
      writable: true,
    });

    const { result } = renderHook(() => useConnectCalendar());
    await result.current.connect();

    expect(window.location.href).toBe("https://accounts.google.com/consent");
    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });
});

describe("useDisconnectCalendar / useMarkCalendarConnected", () => {
  it("disconnect는 api를 호출하고 Firestore 상태를 갱신한 뒤 연동 상태 쿼리를 무효화한다", async () => {
    const { disconnectCalendar } = await import("../../api");
    const { setDoc } = await import("firebase/firestore");
    vi.mocked(disconnectCalendar).mockResolvedValue(undefined);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDisconnectCalendar(), { wrapper: Wrapper });
    await result.current.disconnect(["event-1"]);

    expect(vi.mocked(disconnectCalendar)).toHaveBeenCalledWith(["event-1"]);
    expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
      expect.anything(),
      { connected: false, status: "active" },
      { merge: true },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["calendarIntegration", "user-1"] });
  });

  it("markConnected는 Firestore에 connected: true와 connectedAt을 기록하고 연동 상태 쿼리를 무효화한다", async () => {
    const { setDoc } = await import("firebase/firestore");

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useMarkCalendarConnected(), { wrapper: Wrapper });
    await result.current.markConnected();

    expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
      expect.anything(),
      {
        connected: true,
        connectedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        status: "active",
      },
      { merge: true },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["calendarIntegration", "user-1"] });
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/hooks/__tests__/useCalendarIntegration.test.tsx
```

Expected: FAIL — `../useCalendarIntegration` 모듈이 없음

- [ ] **Step 3: useCalendarIntegration.ts 구현**

`client/src/features/calendarIntegration/hooks/useCalendarIntegration.ts`:

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";
import { getOAuthStartUrl, disconnectCalendar } from "../api";

// 지금은 전원 무료 제공. 유료 전환을 결정하면 실제 구독 상태 체크로 교체한다.
const isCalendarIntegrationUnlocked = true;

interface CalendarIntegrationStatus {
  connected: boolean;
  status: "active" | "revoked";
}

const getIntegrationDocRef = (uid: string) => doc(db, "calendarIntegrations", uid);

export const useCalendarIntegrationStatus = () => {
  const uid = auth.currentUser?.uid;
  return useQuery({
    queryKey: ["calendarIntegration", uid],
    queryFn: async (): Promise<CalendarIntegrationStatus> => {
      if (!uid) throw new Error("Not authenticated");
      const snap = await getDoc(getIntegrationDocRef(uid));
      if (!snap.exists()) return { connected: false, status: "active" };
      const data = snap.data() as Partial<CalendarIntegrationStatus>;
      return { connected: !!data.connected, status: data.status ?? "active" };
    },
    enabled: !!uid && isCalendarIntegrationUnlocked,
  });
};

export const useConnectCalendar = () => ({
  connect: async () => {
    const authUrl = await getOAuthStartUrl();
    window.location.href = authUrl;
  },
});

export const useDisconnectCalendar = () => {
  const queryClient = useQueryClient();
  return {
    disconnect: async (googleEventIds: string[]) => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not authenticated");
      await disconnectCalendar(googleEventIds);
      await setDoc(
        getIntegrationDocRef(uid),
        { connected: false, status: "active" },
        { merge: true },
      );
      queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
    },
  };
};

export const useMarkCalendarConnected = () => {
  const queryClient = useQueryClient();
  return {
    markConnected: async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not authenticated");
      await setDoc(
        getIntegrationDocRef(uid),
        { connected: true, connectedAt: new Date().toISOString(), status: "active" },
        { merge: true },
      );
      queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
    },
  };
};
```

`client/src/features/calendarIntegration/hooks/index.ts`:

```ts
export {
  useCalendarIntegrationStatus,
  useConnectCalendar,
  useDisconnectCalendar,
  useMarkCalendarConnected,
} from "./useCalendarIntegration";
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/hooks/__tests__/useCalendarIntegration.test.tsx
```

Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/calendarIntegration/hooks/
git commit -m "feat(client): useCalendarIntegration 훅 (연결 상태/연결/해제)"
```

---

## Task 12: calendarConnectionButton 컴포넌트 + calendar.tsx 배치

**Files:**
- Create: `client/src/features/calendarIntegration/components/calendarConnectionButton.tsx`
- Create: `client/src/features/calendarIntegration/components/calendarConnectionButton.styles.tsx`
- Modify: `client/src/features/dashboard/components/calendar.tsx`
- Test: `client/src/features/calendarIntegration/components/__tests__/calendarConnectionButton.test.tsx`

**Interfaces:**
- Consumes: `useCalendarIntegrationStatus`, `useConnectCalendar`, `useDisconnectCalendar`, `useMarkCalendarConnected` (Task 11), `useGetTodos` (기존 todo 훅)
- Produces: `<CalendarConnectionButton />` — `calendar.tsx`의 `ViewToggleRow` 안에 배치.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/calendarIntegration/components/__tests__/calendarConnectionButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import CalendarConnectionButton from "../calendarConnectionButton";

vi.mock("../../hooks", () => ({
  useCalendarIntegrationStatus: vi.fn(),
  useConnectCalendar: vi.fn(),
  useDisconnectCalendar: vi.fn(),
}));
vi.mock("@/features/todo", () => ({
  useGetTodos: vi.fn(() => ({ data: [] })),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("CalendarConnectionButton", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useConnectCalendar, useDisconnectCalendar } = await import("../../hooks");
    vi.mocked(useConnectCalendar).mockReturnValue({ connect: vi.fn() });
    vi.mocked(useDisconnectCalendar).mockReturnValue({ disconnect: vi.fn() });
  });

  it("연동 안 됐으면 '구글 캘린더 연동' 버튼을 보여준다", async () => {
    const { useCalendarIntegrationStatus } = await import("../../hooks");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByText("구글 캘린더 연동")).toBeInTheDocument();
  });

  it("연동 버튼을 클릭하면 connect가 호출된다", async () => {
    const { useCalendarIntegrationStatus, useConnectCalendar } = await import("../../hooks");
    const connect = vi.fn();
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);
    vi.mocked(useConnectCalendar).mockReturnValue({ connect });

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("구글 캘린더 연동"));

    await waitFor(() => expect(connect).toHaveBeenCalled());
  });

  it("연동됐으면 '연동 해제' 버튼을 보여준다", async () => {
    const { useCalendarIntegrationStatus } = await import("../../hooks");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByText("연동 해제")).toBeInTheDocument();
  });

  it("status가 revoked면 재연결 안내를 보여준다", async () => {
    const { useCalendarIntegrationStatus } = await import("../../hooks");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "revoked" },
    } as never);

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByText(/다시 연결해주세요/)).toBeInTheDocument();
  });

  it("연동 해제 버튼을 클릭하면 googleEventId가 있는 Todo만 골라 disconnect가 호출된다", async () => {
    const { useCalendarIntegrationStatus, useDisconnectCalendar } = await import("../../hooks");
    const { useGetTodos } = await import("@/features/todo");
    const disconnect = vi.fn();
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(useDisconnectCalendar).mockReturnValue({ disconnect });
    vi.mocked(useGetTodos).mockReturnValue({
      data: [
        { id: "todo-1", googleEventId: "event-1" },
        { id: "todo-2", googleEventId: null },
        { id: "todo-3", googleEventId: "event-3" },
      ],
    } as never);

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("연동 해제"));

    await waitFor(() => {
      expect(disconnect).toHaveBeenCalledWith(["event-1", "event-3"]);
    });
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/components/__tests__/calendarConnectionButton.test.tsx
```

Expected: FAIL — `../calendarConnectionButton` 모듈이 없음

- [ ] **Step 3: 스타일 파일 작성**

`client/src/features/calendarIntegration/components/calendarConnectionButton.styles.tsx`:

```tsx
import styled from "styled-components";
import { colors } from "@/styles/colors";

export const Wrapper = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const ConnectButton = styled.button`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid ${colors.brand.strong};
  border-radius: 6px;
  background-color: transparent;
  color: ${colors.brand.strong};
  cursor: pointer;
  min-height: 36px;

  &:hover {
    background-color: ${colors.brand.tint};
  }
`;

export const DisconnectButton = styled.button`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid ${colors.border.secondary};
  border-radius: 6px;
  background-color: transparent;
  color: ${colors.text.secondary};
  cursor: pointer;
  min-height: 36px;

  &:hover {
    background-color: ${colors.background.secondary};
  }
`;

export const RevokedNotice = styled.span`
  font-size: 12px;
  /* danger.main(#E24B4A)은 흰 배경 대비 3.93:1로 WCAG AA 텍스트 기준(4.5:1)에
     미달한다. 이 코드베이스는 텍스트에 danger.text(#C53A39, 5.2:1)를 쓰고
     danger.main은 장식(테두리·아이콘·배경)에만 쓰는 관례가 이미 있다
     (statusColors AA 정비, PR #85와 동일 원칙). */
  color: ${colors.danger.text};
`;
```

- [ ] **Step 4: calendarConnectionButton.tsx 구현**

`client/src/features/calendarIntegration/components/calendarConnectionButton.tsx`:

```tsx
import { useGetTodos } from "@/features/todo";
import type { Todo } from "@/features/todo";
import {
  useCalendarIntegrationStatus,
  useConnectCalendar,
  useDisconnectCalendar,
} from "../hooks";
import { Wrapper, ConnectButton, DisconnectButton, RevokedNotice } from "./calendarConnectionButton.styles";

const CalendarConnectionButton = () => {
  const { data: integration } = useCalendarIntegrationStatus();
  const { connect } = useConnectCalendar();
  const { disconnect } = useDisconnectCalendar();
  const { data: todos } = useGetTodos();

  const handleDisconnect = () => {
    const googleEventIds = (todos ?? [])
      .map((t: Todo) => t.googleEventId)
      .filter((id): id is string => !!id);
    disconnect(googleEventIds);
  };

  if (!integration?.connected) {
    return (
      <Wrapper>
        <ConnectButton onClick={() => connect()}>구글 캘린더 연동</ConnectButton>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {integration.status === "revoked" && (
        <RevokedNotice>연동이 끊겼습니다. 다시 연결해주세요</RevokedNotice>
      )}
      <DisconnectButton onClick={handleDisconnect}>연동 해제</DisconnectButton>
    </Wrapper>
  );
};

export default CalendarConnectionButton;
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/components/__tests__/calendarConnectionButton.test.tsx
```

Expected: PASS (5 tests)

- [ ] **Step 6: calendar.tsx에 배치 + OAuth 콜백 쿼리 파라미터 처리**

`client/src/features/dashboard/components/calendar.tsx`의 기존 `import { useNavigate } from "react-router-dom";` 줄을 아래로 교체(중복 import 방지를 위해 별도 줄로 추가하지 않고 병합):

```tsx
import { useNavigate, useSearchParams } from "react-router-dom";
```

상단 import 블록에 추가:

```tsx
import CalendarConnectionButton from "@/features/calendarIntegration/components/calendarConnectionButton";
import { useMarkCalendarConnected } from "@/features/calendarIntegration/hooks";
```

(`useToast`는 이미 `@/shared`에서 import되어 있으므로 손대지 않는다.)

`Calendar` 컴포넌트 함수 본문 상단, `const toast = useToast();` 아래에 추가:

```tsx
  const [searchParams, setSearchParams] = useSearchParams();
  const { markConnected } = useMarkCalendarConnected();

  useEffect(() => {
    if (searchParams.get("calendarConnected") === "1") {
      markConnected();
      toast.success("연동 완료", "구글 캘린더 연동이 완료됐습니다");
      setSearchParams((prev) => {
        prev.delete("calendarConnected");
        return prev;
      });
    }
    if (searchParams.get("calendarError") === "1") {
      toast.error("연동 실패", "구글 캘린더 연동 중 오류가 발생했습니다");
      setSearchParams((prev) => {
        prev.delete("calendarError");
        return prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

`ViewToggleRow` 닫는 태그 바로 앞에 버튼 추가:

```tsx
          <ViewButton
            $active={calendarView === "dayGridWeek"}
            onClick={() => setCalendarView("dayGridWeek")}
            aria-pressed={calendarView === "dayGridWeek"}
          >
            주간
          </ViewButton>
          <CalendarConnectionButton />
        </ViewToggleRow>
```

- [ ] **Step 7: 캘린더 컴포넌트 회귀 테스트 확인**

`CalendarConnectionButton`을 실제 훅에 연결한 채로 기존 `calendar.test.tsx`를 돌리면 Firestore/네트워크 호출이 필요해 실패할 수 있으므로, 기존 테스트 파일 상단에 mock을 추가한다.

`client/src/features/dashboard/components/__tests__/calendar.test.tsx` 상단에 추가:

```tsx
vi.mock("@/features/calendarIntegration/components/calendarConnectionButton", () => ({
  default: () => null,
}));
vi.mock("@/features/calendarIntegration/hooks", () => ({
  useMarkCalendarConnected: () => ({ markConnected: vi.fn() }),
}));
```

```bash
cd client && npx vitest run src/features/dashboard/components/__tests__/calendar.test.tsx
```

Expected: PASS (4 tests, 기존과 동일)

- [ ] **Step 8: 전체 클라이언트 테스트 + 타입체크**

```bash
cd client && npx tsc -b --noEmit && npm run test
```

Expected: 전부 PASS

- [ ] **Step 9: 커밋**

```bash
git add client/src/features/calendarIntegration/components/ \
  client/src/features/dashboard/components/calendar.tsx \
  client/src/features/dashboard/components/__tests__/calendar.test.tsx
git commit -m "feat(client): 캘린더 연동 버튼 UI + calendar.tsx 배치"
```

---

## Task 13: useSyncTodosToCalendar 훅 (diff 동기화) + App.tsx 마운트

**Files:**
- Create: `client/src/features/calendarIntegration/hooks/useSyncTodosToCalendar.ts`
- Modify: `client/src/features/calendarIntegration/hooks/index.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/features/calendarIntegration/api/calendarProxyApi.ts` (Task 10, 이미 완료됨) — `CalendarRevokedError` 클래스 추가, `syncTodosToCalendar`가 401 `{error:"revoked"}` 응답을 구분해서 던지도록 확장. 이 훅이 그 에러를 받아 연동 상태를 revoked로 기록하는 유일한 소비처라 여기서 함께 다룬다.
- Modify: `client/src/features/calendarIntegration/api/__tests__/calendarProxyApi.test.ts` (Task 10) — revoked/일반 401 구분 테스트 2건 추가
- Test: `client/src/features/calendarIntegration/hooks/__tests__/useSyncTodosToCalendar.test.tsx`

**Interfaces:**
- Consumes: `useGetTodos` (기존), `useCalendarIntegrationStatus` (Task 11), `syncTodosToCalendar`/`CalendarRevokedError` (Task 10), `toDateKeyFromISO` (`@/shared/utils/date`, 기존), `auth` (`@/shared/lib/firebase`, 기존)
- Produces: `useSyncTodosToCalendar(): void` — `App.tsx`에 부작용으로만 마운트, 반환값 없음.

**왜 `toDateKeyFromISO`를 반드시 거쳐야 하는가**: `Todo.dueAt`은 UTC ISO 타임스탬프(예: `"2026-08-31T16:00:00.000Z"`)로 저장되는데, 이는 KST 기준 `2026-09-01 01:00`이다. Cloudflare Workers(Task 4)는 UTC로만 동작해 이 타임스탬프에서 "로컬 캘린더 날짜"를 알아낼 방법이 없다. 사용자의 로컬 타임존을 실제로 아는 건 브라우저뿐이므로, **여기서(클라이언트) 반드시 `toDateKeyFromISO`로 변환한 `"YYYY-MM-DD"` 날짜 키를 보내야 한다** — 그렇지 않으면 Worker가 `dueAt`을 그대로 슬라이싱해 KST 자정~오전 8시59분 사이의 Todo가 하루 전 날짜로 구글 캘린더에 반영되는 버그가 생긴다.

**세 가지 설계 결정 — 왜 이렇게 하는가**:

1. **`await` 이후 `cancelled` 체크로 결과를 버리면 안 된다.** 구글에 이벤트가 이미 만들어진 뒤(POST/PATCH 응답을 받은 뒤) 이펙트가 재실행/언마운트됐다고 그 결과를 버리면, 스냅샷도 Firestore도 새 `googleEventId`를 모르게 된다. 다음 실행은 `googleEventId: null`로 다시 보내 구글에 **중복 이벤트**를 만든다 — 이 프로젝트가 이미 겪은 `recurring-calendar-duplicate`와 같은 실패 양상이다. React 18 `<StrictMode>`(운영 앱은 `main.tsx`에서 이미 감싸고 있음)는 개발 모드에서 이펙트를 마운트→클린업→재마운트하므로, "await 직후 취소 체크"가 있으면 **개발 환경의 첫 동기화마다 항상** 이 경로를 타 실제 중복 이벤트를 만든다. 그래서 이 훅은 취소 플래그를 아예 두지 않는다 — 스냅샷/Firestore 갱신은 항상 수행하고, 재요청(`invalidateQueries`)만 해도 안전하므로 굳이 막을 필요가 없다.
2. **동기화 도중 들어온 변경은 유실하지 않고 완료 후 다시 돈다.** `isRunningRef`로 겹쳐 실행만 막으면, 그 사이에 들어온 `todos` 변경은 다음 "관련 없는" 변경이 생길 때까지 무기한 보류된다. 진행 중 변경을 감지하면 `pendingRerunRef`에 표시해두고, 현재 실행이 끝나는 즉시(`finally`) `runToken`을 올려 이펙트를 최신 `todos`로 다시 돌린다.
3. **대상에서 빠졌지만 문서가 살아있으면 `googleEventId`도 지운다.** 삭제(action: "delete")가 성공하면 스냅샷에서는 지우지만, 그 Todo 문서 자체가 아직 존재한다면(예: 마감일만 지워서 대상에서 빠진 경우) `googleEventId` 필드를 남겨두면 안 된다 — 나중에 다시 대상이 됐을 때 이미 구글에서 삭제된 이벤트 id로 PATCH를 시도해 404로 실패하고, 실패한 항목은 스냅샷이 안 갱신되니 **영원히 같은 오류가 반복**된다.

**연동 철회(revoked) 감지**: `syncTodosToCalendar`가 `CalendarRevokedError`를 던지면(Worker가 리프레시 토큰 철회를 감지한 경우), 여기서 `calendarIntegrations/{uid}` 문서에 `status: "revoked"`를 기록한다. 이게 없으면 Task 12의 "다시 연결해주세요" UI 분기가 영원히 도달 불가능한 죽은 코드로 남는다 — 아무도 그 상태를 기록하지 않기 때문이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/calendarIntegration/hooks/__tests__/useSyncTodosToCalendar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Todo } from "@/features/todo";
import { useSyncTodosToCalendar } from "../useSyncTodosToCalendar";
import { CalendarRevokedError } from "../../api";

vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  writeBatch: vi.fn(),
}));
vi.mock("@/features/todo", () => ({
  useGetTodos: vi.fn(),
}));
vi.mock("../useCalendarIntegration", () => ({
  useCalendarIntegrationStatus: vi.fn(),
}));
vi.mock("../../api", async () => {
  const actual = await vi.importActual("../../api");
  return { ...actual, syncTodosToCalendar: vi.fn() };
});

// toDateKeyFromISO와 동일한 로컬 게터 방식으로 기대값을 계산한다 — 테스트 실행
// 환경의 TZ(로컬 개발 환경은 Asia/Seoul 고정 — client/src/test/setup.ts, CI는
// 추가로 America/New_York에서도 한 번 더 돈다)와 무관하게 항상 올바른 기대값과
// 비교하기 위함이다. "2026-09-01" 같은 하드코딩된 문자열은 음수 오프셋
// 타임존(America/New_York)에서 값이 달라져 CI의 두 번째 실행에서 실패한다.
const toLocalDateKey = (iso: string): string => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const baseTodo = (overrides: Partial<Todo>): Todo => ({
  id: "todo-1",
  userId: "user-1",
  title: "제목",
  status: "todo",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  startAt: null,
  dueAt: "2026-09-01T00:00:00.000Z",
  doneAt: null,
  priority: "medium",
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  archived: false,
  ...overrides,
});

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useSyncTodosToCalendar", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { writeBatch } = await import("firebase/firestore");
    vi.mocked(writeBatch).mockReturnValue({
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it("연동 안 됐으면 아무것도 호출하지 않는다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useGetTodos).mockReturnValue({ data: [baseTodo({})] } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(syncTodosToCalendar)).not.toHaveBeenCalled();
  });

  it("dueAt이 있는 대상 Todo를 upsert로 동기화한다 (로컬 날짜 키로 변환해서 보낸다)", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    // UTC 16:00 = KST(+9) 기준 다음날 01:00. dueAt을 그대로 슬라이싱하면(버그)
    // 항상 "2026-08-31"이 나오지만, 로컬 변환을 거치면 실행 환경의 로컬
    // 타임존에 맞는 날짜가 나와야 한다 — toLocalDateKey가 그 기대값을 실행
    // 환경 기준으로 직접 계산한다.
    const inputIso = "2026-08-31T16:00:00.000Z";
    vi.mocked(useGetTodos).mockReturnValue({
      data: [baseTodo({ dueAt: inputIso })],
    } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValue([
      { id: "todo-1", googleEventId: "event-1" },
    ]);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledWith([
        {
          id: "todo-1",
          title: "제목",
          dueAt: toLocalDateKey(inputIso),
          googleEventId: null,
          action: "upsert",
        },
      ]);
    });
  });

  it("동기화 결과 중 실패한 항목은 스냅샷을 갱신하지 않아 다음 실행에서 재시도된다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    const todo = baseTodo({});
    vi.mocked(useGetTodos).mockReturnValue({ data: [todo] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([
      { id: "todo-1", googleEventId: null, error: "이벤트 POST 실패 (todo todo-1): 500" },
    ]);

    const { rerender } = renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));

    // 실패한 항목이라 Firestore에 googleEventId를 쓰지 않는다.
    const { writeBatch } = await import("firebase/firestore");
    const firstBatch = vi.mocked(writeBatch).mock.results[0]?.value as {
      update: ReturnType<typeof vi.fn>;
    };
    expect(firstBatch.update).not.toHaveBeenCalled();

    // 스냅샷이 갱신되지 않았으므로, updatedAt이 그대로인 같은 Todo로 다시
    // 렌더링해도(참조만 바뀜) 동일하게 재전송 대상이 되어야 한다 — 이게 이
    // 훅이 제공하는 재시도 계약이다.
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([
      { id: "todo-1", googleEventId: "event-1" },
    ]);
    vi.mocked(useGetTodos).mockReturnValue({ data: [{ ...todo }] } as never);
    rerender();

    await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(syncTodosToCalendar)).toHaveBeenLastCalledWith([
      {
        id: "todo-1",
        title: "제목",
        dueAt: toLocalDateKey(todo.dueAt as string),
        googleEventId: null,
        action: "upsert",
      },
    ]);
  });

  it("변경 없는 Todo는 다시 렌더링돼도 재전송하지 않는다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    const todo = baseTodo({});
    vi.mocked(useGetTodos).mockReturnValue({ data: [todo] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValue([{ id: "todo-1", googleEventId: "event-1" }]);

    const { rerender } = renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });
    await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));

    // updatedAt이 동일한 내용으로 참조만 바꿔 다시 렌더링 — 재전송되면 안 된다.
    vi.mocked(useGetTodos).mockReturnValue({ data: [{ ...todo }] } as never);
    rerender();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1);
  });

  it("대상에서 빠진 Todo는 매핑된 이벤트를 삭제 요청하고, 문서가 남아있으면 googleEventId도 지운다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");
    const { writeBatch } = await import("firebase/firestore");

    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    const todo = baseTodo({ googleEventId: "event-1" });
    vi.mocked(useGetTodos).mockReturnValue({ data: [todo] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([
      { id: "todo-1", googleEventId: "event-1" },
    ]);

    const updateSpy = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({
      update: updateSpy,
      commit: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { rerender } = renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });
    await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));

    // dueAt을 지워 대상에서만 빠지게 한다(문서 자체는 그대로 남아있음).
    const stillExistingTodo = { ...todo, dueAt: null, updatedAt: "2026-08-02T00:00:00.000Z" };
    vi.mocked(useGetTodos).mockReturnValue({ data: [stillExistingTodo] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([{ id: "todo-1", googleEventId: null }]);
    rerender();

    await waitFor(() => {
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenLastCalledWith([
        { id: "todo-1", title: "", dueAt: "", googleEventId: "event-1", action: "delete" },
      ]);
    });
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.anything(), { googleEventId: null });
    });
  });

  it("archived된 Todo는 동기화 대상에서 제외한다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useGetTodos).mockReturnValue({
      data: [baseTodo({ archived: true })],
    } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(syncTodosToCalendar)).not.toHaveBeenCalled();
  });

  it("dueAt이 없는 Todo는 동기화 대상에서 제외한다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useGetTodos).mockReturnValue({
      data: [baseTodo({ dueAt: null })],
    } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(syncTodosToCalendar)).not.toHaveBeenCalled();
  });

  it("동기화 도중 CalendarRevokedError가 나면 연동 상태를 revoked로 기록한다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");
    const { setDoc } = await import("firebase/firestore");

    vi.mocked(useGetTodos).mockReturnValue({ data: [baseTodo({})] } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(syncTodosToCalendar).mockRejectedValue(new CalendarRevokedError());

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
        expect.anything(),
        { status: "revoked" },
        { merge: true },
      );
    });
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/hooks/__tests__/useSyncTodosToCalendar.test.tsx
```

Expected: FAIL — `../useSyncTodosToCalendar` 모듈이 없음

- [ ] **Step 3: useSyncTodosToCalendar.ts 구현**

`client/src/features/calendarIntegration/hooks/useSyncTodosToCalendar.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";
import { useGetTodos } from "@/features/todo";
import type { Todo } from "@/features/todo";
import { toDateKeyFromISO } from "@/shared/utils/date";
import { syncTodosToCalendar, CalendarRevokedError, type SyncTodoPayload } from "../api";
import { useCalendarIntegrationStatus } from "./useCalendarIntegration";

interface SyncedSnapshotEntry {
  updatedAt: string;
  googleEventId: string | null;
}

const isSyncEligible = (todo: Todo): boolean => !!todo.dueAt && !todo.archived;

export const useSyncTodosToCalendar = (): void => {
  const { data: todos } = useGetTodos();
  const { data: integration } = useCalendarIntegrationStatus();
  const queryClient = useQueryClient();
  const snapshotRef = useRef<Map<string, SyncedSnapshotEntry>>(new Map());
  const isRunningRef = useRef(false);
  const pendingRerunRef = useRef(false);
  // 진행 중인 동기화가 끝난 뒤 최신 todos로 다시 돌기 위한 트리거.
  // deps에 이 값을 넣어 이펙트를 강제로 재실행시킨다(값 자체는 쓰지 않는다).
  const [runToken, setRunToken] = useState(0);

  useEffect(() => {
    if (!integration?.connected || integration.status === "revoked") return;
    if (!todos) return;
    if (isRunningRef.current) {
      pendingRerunRef.current = true;
      return;
    }

    const snapshot = snapshotRef.current;
    const eligible = todos.filter(isSyncEligible);
    const eligibleById = new Map(eligible.map((t) => [t.id, t]));
    const eligibleIds = new Set(eligible.map((t) => t.id));

    const upserts: SyncTodoPayload[] = eligible
      .filter((t) => snapshot.get(t.id)?.updatedAt !== t.updatedAt)
      .map((t) => ({
        id: t.id,
        title: t.title,
        // Worker는 UTC로만 동작해 로컬 캘린더 날짜를 모른다 — 여기서 반드시
        // 로컬 타임존 기준으로 변환해서 보낸다 (dueAt을 그대로 슬라이싱 금지).
        dueAt: toDateKeyFromISO(t.dueAt as string),
        googleEventId: t.googleEventId ?? snapshot.get(t.id)?.googleEventId ?? null,
        action: "upsert" as const,
      }));

    const deletes: SyncTodoPayload[] = Array.from(snapshot.entries())
      .filter(([id, entry]) => !eligibleIds.has(id) && !!entry.googleEventId)
      .map(([id, entry]) => ({
        id,
        title: "",
        dueAt: "",
        googleEventId: entry.googleEventId,
        action: "delete" as const,
      }));

    const batch = [...upserts, ...deletes];
    if (batch.length === 0) return;

    isRunningRef.current = true;

    (async () => {
      try {
        const results = await syncTodosToCalendar(batch);

        // 여기서부터는 이펙트가 재실행/언마운트됐어도 절대 건너뛰지 않는다 —
        // 구글에는 이미 이벤트가 만들어졌으므로, 그 결과를 스냅샷/Firestore에
        // 반영하지 않으면 다음 실행이 googleEventId를 몰라 중복 이벤트를
        // 만든다(위 "왜 이렇게 하는가" 1번 참고).
        const firestoreBatch = writeBatch(db);
        let hasWrites = false;

        results.forEach(({ id, googleEventId, error }) => {
          if (error) {
            // 스냅샷을 갱신하지 않는다 — 다음 실행(todos 변경 또는 다음 앱 진입)에서
            // updatedAt이 그대로 다르게 남아 이 항목이 다시 동기화 대상에 잡힌다.
            console.error(`캘린더 동기화 실패 (todo ${id}):`, error);
            return;
          }
          const todo = eligibleById.get(id);
          if (todo) {
            snapshot.set(id, { updatedAt: todo.updatedAt, googleEventId });
            if (todo.googleEventId !== googleEventId) {
              firestoreBatch.update(doc(db, "todos", id), { googleEventId });
              hasWrites = true;
            }
          } else {
            // 삭제 성공. 스냅샷에서는 지우되, Todo 문서 자체가 아직 존재한다면
            // (archived·dueAt 제거로 대상에서만 빠진 경우) googleEventId도
            // 같이 지운다 — 안 지우면 나중에 다시 대상이 됐을 때 이미 삭제된
            // 이벤트 id로 PATCH를 시도해 404로 계속 실패하고, 실패한 항목은
            // 스냅샷이 갱신되지 않으니 영원히 같은 오류가 반복된다.
            snapshot.delete(id);
            if (todos.some((t) => t.id === id)) {
              firestoreBatch.update(doc(db, "todos", id), { googleEventId: null });
              hasWrites = true;
            }
          }
        });

        if (hasWrites) {
          await firestoreBatch.commit();
          queryClient.invalidateQueries({ queryKey: ["todos"] });
        }
      } catch (error) {
        if (error instanceof CalendarRevokedError) {
          const uid = auth.currentUser?.uid;
          if (uid) {
            await setDoc(doc(db, "calendarIntegrations", uid), { status: "revoked" }, { merge: true });
            queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
          }
        } else {
          console.error("캘린더 동기화 실패:", error);
          Sentry.captureException(error);
        }
      } finally {
        isRunningRef.current = false;
        if (pendingRerunRef.current) {
          pendingRerunRef.current = false;
          setRunToken((n) => n + 1);
        }
      }
    })();
  }, [todos, integration, queryClient, runToken]);
};
```

`client/src/features/calendarIntegration/hooks/index.ts`에 추가:

```ts
export { useSyncTodosToCalendar } from "./useSyncTodosToCalendar";
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/hooks/__tests__/useSyncTodosToCalendar.test.tsx
```

Expected: PASS (8 tests)

- [ ] **Step 5: App.tsx에 마운트**

`client/src/App.tsx` import 블록에 추가:

```tsx
import { useSyncTodosToCalendar } from "@/features/calendarIntegration/hooks";
```

`App` 컴포넌트 본문, `const runStartupMaintenance = useRunStartupMaintenance();` 바로 아래에 추가:

```tsx
  useSyncTodosToCalendar();
```

- [ ] **Step 6: App.tsx 관련 기존 테스트가 있다면 mock 추가 후 실행**

```bash
grep -rl "App.tsx\|from \"@/App\"" client/src --include="*.test.tsx"
```

관련 테스트 파일이 있으면 그 파일 상단에 아래 mock을 추가한다 (Firestore 실호출 방지):

```tsx
vi.mock("@/features/calendarIntegration/hooks", () => ({
  useSyncTodosToCalendar: vi.fn(),
}));
```

- [ ] **Step 7: 전체 클라이언트 테스트 + 타입체크**

```bash
cd client && npx tsc -b --noEmit && npm run test
```

Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add client/src/features/calendarIntegration/hooks/ client/src/App.tsx \
  client/src/features/calendarIntegration/api/calendarProxyApi.ts \
  client/src/features/calendarIntegration/api/__tests__/calendarProxyApi.test.ts
git commit -m "feat(client): useSyncTodosToCalendar diff 동기화 훅 + App.tsx 마운트"
```

---

## Task 14: useGoogleCalendarEvents 훅 + calendar.tsx 읽기 전용 오버레이

**Files:**
- Create: `client/src/features/calendarIntegration/hooks/useGoogleCalendarEvents.ts`
- Modify: `client/src/features/calendarIntegration/hooks/index.ts`
- Modify: `client/src/features/dashboard/components/calendar.tsx`
- Test: `client/src/features/calendarIntegration/hooks/__tests__/useGoogleCalendarEvents.test.tsx`
- Test: `client/src/features/dashboard/components/__tests__/calendar.test.tsx` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `getGoogleCalendarEvents` (Task 10), `useCalendarIntegrationStatus` (Task 11)
- Produces: `useGoogleCalendarEvents(): UseQueryResult<GoogleCalendarEvent[]>` — `calendar.tsx`가 FullCalendar `events` 배열에 병합.

- [ ] **Step 1: 실패하는 테스트 작성 (훅)**

`client/src/features/calendarIntegration/hooks/__tests__/useGoogleCalendarEvents.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useGoogleCalendarEvents } from "../useGoogleCalendarEvents";

vi.mock("../../api", () => ({
  getGoogleCalendarEvents: vi.fn(),
}));
vi.mock("../useCalendarIntegration", () => ({
  useCalendarIntegrationStatus: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useGoogleCalendarEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("연동 안 됐으면 조회하지 않는다(disabled)", async () => {
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { getGoogleCalendarEvents } = await import("../../api");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);

    const { result } = renderHook(() => useGoogleCalendarEvents(), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(vi.mocked(getGoogleCalendarEvents)).not.toHaveBeenCalled();
  });

  it("연동됐으면 이벤트 목록을 조회한다", async () => {
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { getGoogleCalendarEvents } = await import("../../api");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(getGoogleCalendarEvents).mockResolvedValue([
      { id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" },
    ]);

    const { result } = renderHook(() => useGoogleCalendarEvents(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/hooks/__tests__/useGoogleCalendarEvents.test.tsx
```

Expected: FAIL — `../useGoogleCalendarEvents` 모듈이 없음

- [ ] **Step 3: useGoogleCalendarEvents.ts 구현**

`client/src/features/calendarIntegration/hooks/useGoogleCalendarEvents.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { getGoogleCalendarEvents } from "../api";
import { useCalendarIntegrationStatus } from "./useCalendarIntegration";

export const useGoogleCalendarEvents = () => {
  const { data: integration } = useCalendarIntegrationStatus();

  return useQuery({
    queryKey: ["googleCalendarEvents"],
    queryFn: getGoogleCalendarEvents,
    enabled: !!integration?.connected && integration.status !== "revoked",
  });
};
```

`client/src/features/calendarIntegration/hooks/index.ts`에 추가:

```ts
export { useGoogleCalendarEvents } from "./useGoogleCalendarEvents";
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd client && npx vitest run src/features/calendarIntegration/hooks/__tests__/useGoogleCalendarEvents.test.tsx
```

Expected: PASS (2 tests)

- [ ] **Step 5: calendar.tsx에 오버레이 병합**

`client/src/features/dashboard/components/calendar.tsx` import 블록에 추가:

```tsx
import { useGoogleCalendarEvents } from "@/features/calendarIntegration/hooks";
```

`const { data: todos, isLoading, isError } = useGetTodos();` 아래에 추가:

```tsx
  const { data: googleEvents } = useGoogleCalendarEvents();
```

`events` `useMemo`를 구글 이벤트까지 병합하도록 수정 (기존 Todo 이벤트 계산 로직은 그대로 두고, 반환 직전에 병합):

**왜 `syncedGoogleEventIds`로 걸러야 하는가**: Task 13의 `useSyncTodosToCalendar`가 마감일 있는 Todo를 이미 이 사용자의 기본 캘린더에 이벤트로 밀어 넣고 있다(`Todo.googleEventId`에 그 이벤트 id를 저장). 이 온디맨드 조회(`/events`)는 **같은 기본 캘린더**를 그대로 훑어오므로, 아무 필터 없이 합치면 ToDoDo가 방금 자기가 만든 이벤트를 "외부 일정"인 것처럼 다시 보여줘 — 마감일 있는 Todo마다 캘린더에 **두 번**(색깔 있는 원래 Todo 이벤트 + 회색 "google-" 읽기 전용 사본) 나타난다. 연동을 켠 사용자에게는 예외가 아니라 기본 동작이 되므로 반드시 걸러야 한다. `todos[].googleEventId`는 이미 클라이언트가 들고 있으므로, Worker나 스펙을 손대지 않고 여기서 클라이언트 쪽 필터링만으로 해결한다.

```tsx
  const events = useMemo(() => {
    const todoEvents = todos
      ?.filter((todo: Todo) => !!todo.startAt || !!todo.dueAt)
      .map((todo: Todo) => {
        const overdue = isOverdue(todo);
        const startSrc = todo.startAt || todo.dueAt || null;
        const startDate = startSrc ? toDateKeyFromISO(startSrc) : null;
        let endDate: string | null = null;
        if (todo.startAt && todo.dueAt) {
          const [y, mo, d] = toDateKeyFromISO(todo.dueAt).split("-").map(Number);
          endDate = toDateKey(new Date(y, mo - 1, d + 1));
        }

        return {
          id: todo.id,
          title: todo.title,
          start: startDate,
          end: endDate,
          color: overdue
            ? colors.danger.main
            : (statusColors[todo.status as Status]?.main ?? statusColors.todo.main),
          editable: todo.recurrenceId == null,
          extendedProps: {
            status: todo.status,
            overdue,
            isRecurring: todo.recurrenceId != null,
            source: "todo" as const,
          },
        };
      }) ?? [];

    // ToDoDo가 이미 이 이벤트들을 만든 장본인이다 — 온디맨드 조회 결과에서
    // 제외해 같은 Todo가 두 번 표시되는 걸 막는다.
    const syncedGoogleEventIds = new Set(
      (todos ?? [])
        .map((t) => t.googleEventId)
        .filter((id): id is string => !!id),
    );

    const googleOnlyEvents = (googleEvents ?? [])
      .filter((event) => !syncedGoogleEventIds.has(event.id))
      .map((event) => ({
        id: `google-${event.id}`,
        title: event.title,
        start: event.start,
        end: event.end,
        color: colors.text.secondary,
        editable: false,
        extendedProps: {
          status: "todo" as const,
          overdue: false,
          isRecurring: false,
          source: "google" as const,
        },
      }));

    return [...todoEvents, ...googleOnlyEvents];
  }, [todos, googleEvents]);
```

`renderEventContent`를 구글 이벤트 구분 아이콘을 보여주도록 수정:

```tsx
  const renderEventContent = useCallback((arg: EventContentArg) => (
    <EventContentWrapper>
      {arg.event.extendedProps.source === "google" ? (
        <CalendarDays size={10} color="#ffffff" aria-hidden="true" />
      ) : (
        arg.event.extendedProps.isRecurring && (
          <Repeat size={10} color="#ffffff" aria-hidden="true" />
        )
      )}
      <span>{arg.event.title}</span>
    </EventContentWrapper>
  ), []);
```

기존 `import { AlertCircle, Plus, Repeat } from "lucide-react";` 줄을 아래로 교체:

```tsx
import { AlertCircle, Plus, Repeat, CalendarDays } from "lucide-react";
```

`handleEventClick`이 구글 이벤트를 무시하도록 방어(수정 불가 원칙 — 상세 페이지가 없는 이벤트로 이동 시도하지 않음):

```tsx
  const handleEventClick = useCallback((info: EventClickArg) => {
    if (info.event.extendedProps.source === "google") return;
    navigate(`/todo/${info.event.id}`);
  }, [navigate]);
```

기존 `handleEventDrop` 전체를 아래로 교체 (구글 이벤트는 `editable: false`라 FC가 애초에 드래그를 막지만, 기존 코드가 반복 인스턴스에 대해 하듯 한 번 더 방어하는 가드만 맨 앞에 추가하고 나머지는 그대로다):

```tsx
  const handleEventDrop = useCallback((info: EventDropArg) => {
    if (info.event.extendedProps.source === "google") {
      info.revert();
      return;
    }

    const todo = todos?.find((t: Todo) => t.id === info.event.id);
    if (!todo) {
      info.revert();
      return;
    }

    // 이벤트 자체에 editable: false를 부여해 두었지만, 방어적으로 한 번 더 막는다.
    // 반복 인스턴스는 단일 문서 드래그로 dueAt을 바꾸면 시리즈 수정 정책(확인 모달,
    // 날짜 중복 방지)을 우회하게 된다.
    if (todo.recurrenceId) {
      info.revert();
      toast.error(
        "변경 불가",
        "반복 할 일의 날짜는 드래그로 바꿀 수 없습니다. 수정 화면에서 변경해주세요",
      );
      return;
    }

    const { newDueAt, newStartAt } = getDropDates(
      info.event.start,
      info.event.end,
      todo.startAt,
    );

    updateTodoDueAt.mutate(
      { id: todo.id, dueAt: newDueAt, startAt: newStartAt },
      {
        onError: () => {
          info.revert();
          toast.error("저장 실패", "할 일 날짜 변경 중 오류가 발생했습니다");
        },
      }
    );
  }, [todos, updateTodoDueAt, toast]);
```

- [ ] **Step 6: 기존 calendar.test.tsx에 오버레이 mock 추가 + 읽기 전용 검증 테스트 + 회귀 확인**

`client/src/features/dashboard/components/__tests__/calendar.test.tsx` 상단(Task 12에서 추가한 mock 옆)의 기존 mock을 아래로 교체 — `useGoogleCalendarEvents`를 `vi.fn()`으로 감싸 테스트별로 반환값을 바꿀 수 있게 한다:

```tsx
vi.mock("@/features/calendarIntegration/hooks", () => ({
  useMarkCalendarConnected: () => ({ markConnected: vi.fn() }),
  useGoogleCalendarEvents: vi.fn(() => ({ data: [] })),
}));
```

(Task 12에서 이미 `@/features/calendarIntegration/hooks`를 mock했다면, 그 mock 객체를 이 내용으로 교체한다 — 같은 경로를 두 번 `vi.mock`하지 않는다.)

파일 상단, 다른 `vi.mock` 호출들 옆에 `useNavigate`를 스파이로 바꾸는 mock을 추가한다 — 구글 이벤트를 클릭했을 때 실제로 페이지 이동을 시도하지 않는지 검증하려면 `navigate` 호출 자체를 가로채야 한다:

```tsx
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
```

파일 맨 아래, 기존 `describe` 블록들 뒤에 새 블록을 추가한다:

```tsx
describe('Calendar 구글 이벤트 읽기 전용', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('구글 이벤트를 클릭해도 상세 페이지로 이동하지 않는다', async () => {
    const { useGoogleCalendarEvents } = await import('@/features/calendarIntegration/hooks')
    const d = new Date()
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
    vi.mocked(useGoogleCalendarEvents).mockReturnValue({
      data: [{ id: 'g-1', title: '외부 회의', start: todayStr, end: todayStr }],
    } as never)

    renderCalendar()
    const googleEventTitle = await screen.findByText('외부 회의')
    fireEvent.click(googleEventTitle)

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
```

`vi.hoisted`로 끌어올린 `beforeEach` import는 파일 상단에 이미 있는 `describe`/`it`/`expect`/`vi`/`beforeAll`/`afterAll` import에 `beforeEach`만 추가하면 된다 (다른 `describe` 블록들은 `beforeEach`를 안 쓰므로 영향 없음).

```bash
cd client && npx vitest run src/features/dashboard/components/__tests__/calendar.test.tsx
```

Expected: PASS (5 tests, 기존 4개 + 신규 1개)

- [ ] **Step 7: 전체 클라이언트 테스트 + 타입체크**

```bash
cd client && npx tsc -b --noEmit && npm run test
```

Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add client/src/features/calendarIntegration/hooks/ client/src/features/dashboard/components/calendar.tsx \
  client/src/features/dashboard/components/__tests__/calendar.test.tsx
git commit -m "feat(client): 구글 캘린더 읽기 전용 오버레이 표시"
```

---

## 완료 후 확인 사항 (범위 밖, 이 플랜에는 없음)

- `calendar-proxy`를 실제 Cloudflare 계정에 배포(`npx wrangler deploy`)하고 `wrangler secret put GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`으로 시크릿 등록 — Google Cloud Console에서 OAuth 클라이언트를 먼저 만들어야 한다.
- Google Cloud Console에서 OAuth 동의 화면 구성 및 (일반 공개 시) 검증 제출.
- `client/.env`와 배포 환경(Firebase Hosting)에 `VITE_CALENDAR_PROXY_URL` 실제 값 반영.
- `firestore.rules` 배포(`firebase deploy --only firestore:rules`) — 안 하면 `calendarIntegrations` 쓰기가 실서비스에서 permission-denied.
