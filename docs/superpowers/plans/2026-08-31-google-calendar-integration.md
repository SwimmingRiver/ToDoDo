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
- Produces: `interface CalendarTokenRecord { refreshToken: string }`, `getTokenRecord(kv, uid): Promise<CalendarTokenRecord | null>`, `setTokenRecord(kv, uid, record): Promise<void>`, `deleteTokenRecord(kv, uid): Promise<void>` — Task 5(콜백), 6(sync), 7(events), 8(disconnect)이 사용.

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

  async put(key: string, value: string): Promise<void> {
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
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

```bash
cd calendar-proxy && npx vitest run src/__tests__/tokenStore.test.ts
```

Expected: PASS (4 tests)

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
- Produces: `interface SyncTodoItem { id: string; title: string; dueAt: string; googleEventId: string | null; action: "upsert" | "delete" }`, `interface SyncResult { id: string; googleEventId: string | null }`, `syncTodosToGoogleCalendar(todos: SyncTodoItem[], accessToken: string, concurrency?: number): Promise<SyncResult[]>` — Task 6(sync-todos), 8(disconnect)이 사용.

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
      { id: "todo-1", title: "테스트", dueAt: "2026-09-01T00:00:00.000Z", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: "new-event-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(CALENDAR_API_BASE);
    expect(init.method).toBe("POST");
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
        dueAt: "2026-09-01T00:00:00.000Z",
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
      dueAt: "2026-09-01T00:00:00.000Z",
      googleEventId: null,
      action: "upsert" as const,
    }));

    await syncTodosToGoogleCalendar(todos, "access-token", 5);

    expect(maxInFlight).toBeLessThanOrEqual(5);
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
  dueAt: string;
  googleEventId: string | null;
  action: "upsert" | "delete";
}

export interface SyncResult {
  id: string;
  googleEventId: string | null;
}

const toGoogleEventBody = (todo: SyncTodoItem) => {
  const dateKey = todo.dueAt.slice(0, 10);
  const nextDay = new Date(`${dateKey}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return {
    summary: todo.title,
    start: { date: dateKey },
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

const syncOne = async (todo: SyncTodoItem, accessToken: string): Promise<SyncResult> => {
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

Expected: PASS (5 tests)

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
- Consumes: `verifyFirebaseIdToken` (Task 1), `getTokenRecord`/`setTokenRecord` (Task 2), `exchangeCodeForTokens` (Task 3), `Env` (Task 1)
- Produces: `handleOAuthStart(request: Request, env: Env): Promise<Response>`, `handleOAuthCallback(request: Request, env: Env): Promise<Response>` — `index.ts`가 라우팅.

- [ ] **Step 1: 실패하는 테스트 작성 (oauthStart)**

`calendar-proxy/src/__tests__/oauthStart.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { handleOAuthStart } from "../handlers/oauthStart";
import type { Env } from "../env";

vi.mock("../auth", () => ({
  verifyFirebaseIdToken: vi.fn().mockResolvedValue({ uid: "user-123" }),
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

  it("유효한 요청이면 state에 uid가 담긴 authUrl을 반환한다", async () => {
    const request = new Request("https://proxy.example.com/oauth/start", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const response = await handleOAuthStart(request, makeEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { authUrl: string };
    expect(body.authUrl).toContain("state=user-123");
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

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const buildAuthUrl = (uid: string, redirectUri: string, clientId: string): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.events",
    state: uid,
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

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/oauth/callback`;
  const authUrl = buildAuthUrl(uid, redirectUri, env.GOOGLE_CLIENT_ID);

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

  it("토큰 교환에 성공하면 저장하고 성공 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    const { setTokenRecord } = await import("../tokenStore");
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
    });

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=user-123",
    );
    const response = await handleOAuthCallback(request, makeEnv());

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
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: "at",
      expires_in: 3600,
    });

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=user-123",
    );
    const response = await handleOAuthCallback(request, makeEnv());
    expect(response.headers.get("Location")).toContain("calendarError=1");
  });

  it("토큰 교환이 실패하면 에러 페이지로 리다이렉트한다", async () => {
    const { exchangeCodeForTokens } = await import("../googleOAuth");
    vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error("토큰 교환 실패: 400"));

    const request = new Request(
      "https://proxy.example.com/oauth/callback?code=auth-code&state=user-123",
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
import { setTokenRecord } from "../tokenStore";

export const handleOAuthCallback = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const uid = url.searchParams.get("state");

  if (!code || !uid) {
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

Expected: PASS (4 tests)

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
      { id: "todo-1", title: "제목", dueAt: "2026-09-01T00:00:00.000Z", googleEventId: null, action: "upsert" as const },
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

  const { googleEventIds } = (await request.json()) as { googleEventIds: string[] };

  try {
    const refreshed = await refreshAccessToken(
      tokenRecord.refreshToken,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    const deleteItems: SyncTodoItem[] = googleEventIds.map((googleEventId) => ({
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

Expected: PASS (3 tests)

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
- Produces: `getOAuthStartUrl(): Promise<string>`, `interface SyncTodoPayload`, `interface SyncTodoResult`, `syncTodosToCalendar(todos: SyncTodoPayload[]): Promise<SyncTodoResult[]>`, `interface GoogleCalendarEvent`, `getGoogleCalendarEvents(): Promise<GoogleCalendarEvent[]>`, `disconnectCalendar(googleEventIds: string[]): Promise<void>` — Task 11, 13, 14가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/calendarIntegration/api/__tests__/calendarProxyApi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1", getIdToken: vi.fn().mockResolvedValue("id-token") } },
  googleProvider: {},
}));

vi.stubEnv("VITE_CALENDAR_PROXY_URL", "https://proxy.example.com");

import { syncTodosToCalendar, getGoogleCalendarEvents, disconnectCalendar } from "../calendarProxyApi";

describe("calendarProxyApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("syncTodosToCalendar는 Authorization 헤더를 붙여 /sync-todos를 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: "todo-1", googleEventId: "event-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos = [
      { id: "todo-1", title: "제목", dueAt: "2026-09-01T00:00:00.000Z", googleEventId: null, action: "upsert" as const },
    ];
    const result = await syncTodosToCalendar(todos);

    expect(result).toEqual([{ id: "todo-1", googleEventId: "event-1" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/sync-todos");
    expect(init.headers.Authorization).toBe("Bearer id-token");
  });

  it("getGoogleCalendarEvents는 /events를 호출해 이벤트 목록을 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [{ id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" }] }),
      }),
    );

    const events = await getGoogleCalendarEvents();
    expect(events).toEqual([{ id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" }]);
  });

  it("disconnectCalendar는 googleEventIds를 담아 /disconnect를 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await disconnectCalendar(["event-1", "event-2"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://proxy.example.com/disconnect");
    expect(JSON.parse(init.body)).toEqual({ googleEventIds: ["event-1", "event-2"] });
  });

  it("응답이 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(syncTodosToCalendar([])).rejects.toThrow("동기화 실패");
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
  dueAt: string;
  googleEventId: string | null;
  action: "upsert" | "delete";
}

export interface SyncTodoResult {
  id: string;
  googleEventId: string | null;
}

export const syncTodosToCalendar = async (
  todos: SyncTodoPayload[],
): Promise<SyncTodoResult[]> => {
  const res = await authorizedFetch("/sync-todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ todos }),
  });
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

Expected: PASS (4 tests)

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

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useCalendarIntegrationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("문서가 없으면 connected: false를 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);

    const { result } = renderHook(() => useCalendarIntegrationStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: false, status: "active" });
  });

  it("문서가 있으면 그 값을 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ connected: true, status: "active" }),
    } as never);

    const { result } = renderHook(() => useCalendarIntegrationStatus(), {
      wrapper: createWrapper(),
    });

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
  it("disconnect는 api를 호출하고 Firestore 상태를 갱신한다", async () => {
    const { disconnectCalendar } = await import("../../api");
    const { setDoc } = await import("firebase/firestore");
    vi.mocked(disconnectCalendar).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDisconnectCalendar(), { wrapper: createWrapper() });
    await result.current.disconnect(["event-1"]);

    expect(vi.mocked(disconnectCalendar)).toHaveBeenCalledWith(["event-1"]);
    expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
      expect.anything(),
      { connected: false, status: "active" },
      { merge: true },
    );
  });

  it("markConnected는 Firestore에 connected: true를 기록한다", async () => {
    const { setDoc } = await import("firebase/firestore");

    const { result } = renderHook(() => useMarkCalendarConnected(), { wrapper: createWrapper() });
    await result.current.markConnected();

    expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ connected: true, status: "active" }),
      { merge: true },
    );
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
  color: ${colors.danger.main};
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

Expected: PASS (4 tests)

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
- Test: `client/src/features/calendarIntegration/hooks/__tests__/useSyncTodosToCalendar.test.tsx`

**Interfaces:**
- Consumes: `useGetTodos` (기존), `useCalendarIntegrationStatus` (Task 11), `syncTodosToCalendar` (Task 10)
- Produces: `useSyncTodosToCalendar(): void` — `App.tsx`에 부작용으로만 마운트, 반환값 없음.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/calendarIntegration/hooks/__tests__/useSyncTodosToCalendar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Todo } from "@/features/todo";
import { useSyncTodosToCalendar } from "../useSyncTodosToCalendar";

vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  writeBatch: vi.fn(),
}));
vi.mock("@/features/todo", () => ({
  useGetTodos: vi.fn(),
}));
vi.mock("../useCalendarIntegration", () => ({
  useCalendarIntegrationStatus: vi.fn(),
}));
vi.mock("../../api", () => ({
  syncTodosToCalendar: vi.fn(),
}));

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

  it("dueAt이 있는 대상 Todo를 upsert로 동기화한다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useGetTodos).mockReturnValue({ data: [baseTodo({})] } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValue([
      { id: "todo-1", googleEventId: "event-1" },
    ]);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledWith([
        { id: "todo-1", title: "제목", dueAt: "2026-09-01T00:00:00.000Z", googleEventId: null, action: "upsert" },
      ]);
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
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { doc, writeBatch } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { useGetTodos } from "@/features/todo";
import type { Todo } from "@/features/todo";
import { syncTodosToCalendar, type SyncTodoPayload } from "../api";
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

  useEffect(() => {
    if (!integration?.connected || integration.status === "revoked") return;
    if (!todos) return;
    if (isRunningRef.current) return;

    const snapshot = snapshotRef.current;
    const eligible = todos.filter(isSyncEligible);
    const eligibleIds = new Set(eligible.map((t) => t.id));

    const upserts: SyncTodoPayload[] = eligible
      .filter((t) => snapshot.get(t.id)?.updatedAt !== t.updatedAt)
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueAt: t.dueAt as string,
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
    let cancelled = false;

    (async () => {
      try {
        const results = await syncTodosToCalendar(batch);
        if (cancelled) return;

        const firestoreBatch = writeBatch(db);
        let hasWrites = false;

        results.forEach(({ id, googleEventId }) => {
          const todo = eligible.find((t) => t.id === id);
          if (todo) {
            snapshot.set(id, { updatedAt: todo.updatedAt, googleEventId });
            if (todo.googleEventId !== googleEventId) {
              firestoreBatch.update(doc(db, "todos", id), { googleEventId });
              hasWrites = true;
            }
          } else {
            snapshot.delete(id);
          }
        });

        if (hasWrites) {
          await firestoreBatch.commit();
          queryClient.invalidateQueries({ queryKey: ["todos"] });
        }
      } catch (error) {
        console.error("캘린더 동기화 실패:", error);
      } finally {
        isRunningRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [todos, integration, queryClient]);
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

Expected: PASS (4 tests)

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
git add client/src/features/calendarIntegration/hooks/ client/src/App.tsx
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

    const googleOnlyEvents = (googleEvents ?? []).map((event) => ({
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

- [ ] **Step 6: 기존 calendar.test.tsx에 오버레이 mock 추가 + 회귀 확인**

`client/src/features/dashboard/components/__tests__/calendar.test.tsx` 상단(Task 12에서 추가한 mock 옆)에 추가:

```tsx
vi.mock("@/features/calendarIntegration/hooks", () => ({
  useMarkCalendarConnected: () => ({ markConnected: vi.fn() }),
  useGoogleCalendarEvents: () => ({ data: [] }),
}));
```

(Task 12에서 이미 `@/features/calendarIntegration/hooks`를 mock했다면, 그 mock 객체에 `useGoogleCalendarEvents` 항목만 추가한다 — 같은 경로를 두 번 `vi.mock`하지 않는다.)

```bash
cd client && npx vitest run src/features/dashboard/components/__tests__/calendar.test.tsx
```

Expected: PASS (4 tests, 기존과 동일)

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
