# 회원 탈퇴(계정 삭제) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹(프로필 메뉴)과 앱(계정 화면)에서 사용자가 직접 탈퇴하면 Paddle 구독 즉시 해지 + 모든 사용자 데이터 삭제(피드백은 익명화) + Firebase Auth 계정 삭제가 이루어지게 한다.

**Architecture:** 클라이언트가 calendar-proxy `/disconnect`(기존) → reminder-proxy `DELETE /account`(신규) → billing-proxy `POST /account/delete`(신규)를 순서대로 호출한다. billing-proxy가 서비스 계정으로 Paddle 해지 → Firestore 삭제 → Auth 삭제를 이 순서로 한다. 모든 단계가 멱등이라 실패 시 처음부터 재시도한다.

**Tech Stack:** Cloudflare Workers(TypeScript, vitest), Firestore/Identity Toolkit REST, Paddle Billing API, React 19 + styled-components + TanStack Query(vitest + Testing Library), Expo React Native(jest-expo).

**Spec:** `docs/superpowers/specs/2026-10-09-account-deletion-design.md`

## Global Constraints

- 브랜치: `feat/account-deletion` (develop 기반). 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **git hooks 우회 금지** — `--no-verify` 등 사용하지 말 것. 훅이 실패하면 원인을 고친다.
- Worker에서 `fetchFn` 기본값은 반드시 `(input, init) => fetch(input, init)` 화살표로 감싼다(전역 fetch를 그대로 담으면 Workers가 "Illegal invocation").
- 문구(그대로 사용):
  - 기본 안내: `할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.`
  - 구독 안내: `구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.`
  - 실패 안내: `일부만 처리되었습니다. 다시 시도해 주세요.`
  - 성공 토스트(웹): `탈퇴가 완료되었습니다`
- Paddle 해지 실패 시 billing-proxy는 **아무것도 지우지 않고** `502 { "error": "PADDLE_CANCEL_FAILED" }`.
- `/account/delete`는 `BILLING_ALLOWED_UIDS` 허용 목록을 검사하지 않는다.
- 피드백은 삭제하지 않고 `userId`·`email` 필드만 제거한다.
- client 테스트는 `VITE_FIREBASE_API_KEY= npx vitest run`으로 CI 등가 검증한다(로컬 .env 실제 키로 우연히 통과하는 함정).
- client 코드에서 `@tododo/core` 루트 import 금지 — `@tododo/core/dist/<sub>/index.js` 서브패스만.

## Review Focus

1. **부분 완료 후 재시도** — 이전 시도에서 Paddle 해지만 되고 끝났다면 다음 시도의 cancel 호출은 Paddle 오류를 받는다. 이때 구독이 `canceled`면 성공으로 보고 진행해야 한다(Task 1 테스트). Auth 계정이 이미 없으면 성공(Task 3 테스트).
2. **할 일 500건 초과** — Firestore 커밋 상한 500 때문에 한 번에 못 지운다. 조회가 빌 때까지 반복해야 한다(Task 2 테스트).
3. **구독 없는/체험·수동 부여 사용자** — `source !== "paddle"`이거나 이미 `canceled`면 Paddle을 부르지 않는다(Task 3 테스트).
4. **탈퇴 버튼 연타** — 진행 중에는 확인 버튼이 비활성이고 두 번째 호출이 일어나지 않아야 한다(Task 6·8 테스트).
5. **결제 서버 주소 미설정 빌드** — 웹에서 `VITE_BILLING_PROXY_URL`이 비어 있으면 조용히 "성공"하면 안 되고 실패로 보여야 한다(Task 5 테스트).

---

## File Structure

| 파일 | 책임 |
| --- | --- |
| `billing-proxy/src/paddle.ts` (수정) | `cancelSubscriptionImmediately` 추가 |
| `billing-proxy/src/accountDataStore.ts` (신규) | Firestore 사용자 데이터 삭제·피드백 익명화 |
| `billing-proxy/src/claims.ts` (수정) | `deleteUser` 추가(Identity Toolkit) |
| `billing-proxy/src/handlers/deleteAccount.ts` (신규) | 탈퇴 오케스트레이션(서버 측) |
| `billing-proxy/src/router.ts`, `index.ts` (수정) | 라우트·의존성 연결 |
| `reminder-proxy/src/store.ts`, `scheduler.ts`, `router.ts` (수정) | `clearAll`·`deleteAccount`·`DELETE /account` |
| `client/src/features/billing/api/billingApi.ts` (수정) | `deleteAccountOnServer` |
| `client/src/features/reminders/api/reminderProxyApi.ts` (수정) | `deleteReminderAccount` |
| `client/src/features/account/` (신규) | `deleteAccount` 오케스트레이션 + `AccountDeletionDialog` |
| `client/src/layouts/profileMenu/profileMenu.tsx` (수정) | "회원 탈퇴" 진입점 |
| `mobile/src/account/deleteAccount.ts` (신규) | 앱 오케스트레이션 |
| `mobile/src/shared/ui/button/Button.tsx` (수정) | `dangerText` variant |
| `mobile/src/screens/AccountScreen.tsx` (수정) | "회원 탈퇴" 버튼·확인 흐름 |

---

### Task 1: PaddleClient.cancelSubscriptionImmediately

**Files:**
- Modify: `billing-proxy/src/paddle.ts`
- Test: `billing-proxy/src/__tests__/paddle.test.ts`

**Interfaces:**
- Produces: `PaddleClient.cancelSubscriptionImmediately(subscriptionId: string): Promise<void>` — 성공 또는 "이미 canceled"면 resolve, 그 외 throw.

- [ ] **Step 1: 실패하는 테스트 작성** — `paddle.test.ts`의 `describe("PaddleClient")` 안 끝에 추가:

```ts
  describe("cancelSubscriptionImmediately", () => {
    const client = (fetchFn: ReturnType<typeof vi.fn>) =>
      new PaddleClient("https://x", "key", "pri_1", "uid-secret", fetchFn);

    it("구독을 즉시 해지한다", async () => {
      const fetchFn = vi.fn().mockResolvedValue(jsonRes({ data: { status: "canceled" } }));
      await client(fetchFn).cancelSubscriptionImmediately("sub_1");
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe("https://x/subscriptions/sub_1/cancel");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer key");
      expect(JSON.parse(init.body)).toEqual({ effective_from: "immediately" });
    });

    it("해지 요청이 실패해도 구독이 이미 canceled면 성공으로 본다(재시도 멱등)", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(jsonRes({ error: { code: "subscription_locked_canceled", detail: "x" } }, 400))
        .mockResolvedValueOnce(jsonRes({ data: { status: "canceled" } }));
      await expect(client(fetchFn).cancelSubscriptionImmediately("sub_1")).resolves.toBeUndefined();
      expect(fetchFn.mock.calls[1][0]).toBe("https://x/subscriptions/sub_1");
      expect(fetchFn.mock.calls[1][1].method).toBe("GET");
    });

    it("해지 요청이 실패하고 구독이 살아 있으면 던진다", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(jsonRes({ error: { code: "internal_error", detail: "x" } }, 500))
        .mockResolvedValueOnce(jsonRes({ data: { status: "active" } }));
      await expect(client(fetchFn).cancelSubscriptionImmediately("sub_1")).rejects.toThrow(
        "Paddle 구독 해지 실패 (500): internal_error — x",
      );
    });

    it("상태 조회까지 실패하면 던진다", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(jsonRes({ error: {} }, 500))
        .mockResolvedValueOnce(jsonRes({ error: {} }, 503));
      await expect(client(fetchFn).cancelSubscriptionImmediately("sub_1")).rejects.toThrow("503");
    });
  });
```

- [ ] **Step 2: 실패 확인** — `cd billing-proxy && npx vitest run src/__tests__/paddle.test.ts` → FAIL(`cancelSubscriptionImmediately is not a function`).

- [ ] **Step 3: 구현** — `paddle.ts`의 `post` 위에 헤더 헬퍼를 두고 `post`가 이를 쓰게 바꾼 뒤, 클래스 끝에 두 메서드 추가:

```ts
  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.apiBase}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Paddle ${path} 실패 (${res.status})${await describePaddleError(res)}`);
    return (await res.json()) as T;
  }
```

```ts
  /**
   * 탈퇴용 즉시 해지. 이전 탈퇴 시도에서 이미 해지됐다면 Paddle이 오류를 돌려주므로,
   * 실패하면 상태를 조회해 canceled일 때만 성공으로 본다 — 탈퇴 재시도가 여기서 막히지 않게.
   */
  async cancelSubscriptionImmediately(subscriptionId: string): Promise<void> {
    const id = encodeURIComponent(subscriptionId);
    const res = await this.fetchFn(`${this.apiBase}/subscriptions/${id}/cancel`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ effective_from: "immediately" }),
    });
    if (res.ok) return;
    const detail = await describePaddleError(res);
    if ((await this.getSubscriptionStatus(id)) === "canceled") return;
    throw new Error(`Paddle 구독 해지 실패 (${res.status})${detail}`);
  }

  private async getSubscriptionStatus(encodedId: string): Promise<string> {
    const res = await this.fetchFn(`${this.apiBase}/subscriptions/${encodedId}`, { method: "GET", headers: this.headers() });
    if (!res.ok) throw new Error(`Paddle 구독 조회 실패 (${res.status})${await describePaddleError(res)}`);
    const { data } = (await res.json()) as { data: { status: string } };
    return data.status;
  }
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/__tests__/paddle.test.ts` → PASS. `npm run typecheck` → 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add billing-proxy/src/paddle.ts billing-proxy/src/__tests__/paddle.test.ts
git commit -m "feat(billing-proxy): Paddle 구독 즉시 해지 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: AccountDataStore (Firestore 사용자 데이터 삭제)

**Files:**
- Create: `billing-proxy/src/accountDataStore.ts`
- Test: `billing-proxy/src/__tests__/accountDataStore.test.ts`

**Interfaces:**
- Produces: `class AccountDataStore { constructor(projectId: string, getToken: () => Promise<string>, fetchFn?: typeof fetch); deleteUserData(uid: string): Promise<void> }`

- [ ] **Step 1: 실패하는 테스트 작성** — `accountDataStore.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { AccountDataStore } from "../accountDataStore";

const ROOT = "projects/p1/databases/(default)/documents";
const API = `https://firestore.googleapis.com/v1/${ROOT}`;

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const rows = (collection: string, ids: string[]) =>
  ids.length === 0 ? [{ readTime: "t" }] : ids.map((id) => ({ document: { name: `${ROOT}/${collection}/${id}` }, readTime: "t" }));

/**
 * runQuery는 컬렉션별로 준비한 응답 묶음을 차례로 돌려주고, commit은 받은 writes를 기록한다.
 */
const fakeFirestore = (queryPages: Record<string, unknown[][]>) => {
  const commits: unknown[][] = [];
  const queries: { collectionId: string; limit: number }[] = [];
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    if (url === `${API}:runQuery`) {
      const { from, where, limit } = body.structuredQuery;
      expect(where).toEqual({ fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: "u1" } } });
      queries.push({ collectionId: from[0].collectionId, limit });
      return jsonRes(queryPages[from[0].collectionId].shift() ?? rows(from[0].collectionId, []));
    }
    if (url === `${API}:commit`) {
      commits.push(body.writes);
      return jsonRes({ writeResults: [] });
    }
    throw new Error(`예상 밖 URL ${url}`);
  });
  return { fetchFn, commits, queries };
};

const store = (fetchFn: typeof fetch) => new AccountDataStore("p1", async () => "tok", fetchFn);

describe("AccountDataStore.deleteUserData", () => {
  it("할 일 삭제 → 피드백 익명화 → 단일 문서 삭제 순서로 커밋한다", async () => {
    const { fetchFn, commits } = fakeFirestore({
      todos: [rows("todos", ["t1", "t2"])],
      feedback: [rows("feedback", ["f1"])],
    });
    await store(fetchFn as unknown as typeof fetch).deleteUserData("u1");

    expect(commits).toEqual([
      [{ delete: `${ROOT}/todos/t1` }, { delete: `${ROOT}/todos/t2` }],
      [{ update: { name: `${ROOT}/feedback/f1`, fields: {} }, updateMask: { fieldPaths: ["userId", "email"] } }],
      [
        { delete: `${ROOT}/userSettings/u1` },
        { delete: `${ROOT}/calendarIntegrations/u1` },
        { delete: `${ROOT}/entitlements/u1` },
      ],
    ]);
  });

  it("할 일이 500건을 넘으면 조회가 빌 때까지 500건씩 나눠 지운다", async () => {
    const first = Array.from({ length: 500 }, (_, i) => `a${i}`);
    const second = ["b1", "b2"];
    const { fetchFn, commits, queries } = fakeFirestore({
      todos: [rows("todos", first), rows("todos", second)],
      feedback: [],
    });
    await store(fetchFn as unknown as typeof fetch).deleteUserData("u1");

    expect(queries.filter((q) => q.collectionId === "todos")).toHaveLength(3);
    expect(queries.every((q) => q.limit === 500)).toBe(true);
    expect(commits[0]).toHaveLength(500);
    expect(commits[1]).toEqual([{ delete: `${ROOT}/todos/b1` }, { delete: `${ROOT}/todos/b2` }]);
  });

  it("지울 것이 없어도 단일 문서 삭제 커밋은 보낸다(없는 문서 삭제는 성공)", async () => {
    const { fetchFn, commits } = fakeFirestore({ todos: [], feedback: [] });
    await store(fetchFn as unknown as typeof fetch).deleteUserData("u1");
    expect(commits).toHaveLength(1);
  });

  it("조회 실패는 던진다", async () => {
    const fetchFn = vi.fn(async () => jsonRes({ error: {} }, 500));
    await expect(store(fetchFn as unknown as typeof fetch).deleteUserData("u1")).rejects.toThrow("Firestore todos 조회 실패 (500)");
  });

  it("커밋 실패는 던진다", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith(":runQuery") ? jsonRes(rows("todos", ["t1"])) : jsonRes({ error: {} }, 503),
    );
    await expect(store(fetchFn as unknown as typeof fetch).deleteUserData("u1")).rejects.toThrow("Firestore 커밋 실패 (503)");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/__tests__/accountDataStore.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `accountDataStore.ts`:

```ts
/** Firestore 커밋 한 번에 담을 수 있는 쓰기 상한. 조회도 같은 크기로 끊는다. */
const BATCH_LIMIT = 500;
/** 조회가 비지 않는 이상 상황에서 무한 반복하지 않게 둔 상한(500 × 200 = 10만 건). */
const MAX_ROUNDS = 200;
const SINGLE_DOC_COLLECTIONS = ["userSettings", "calendarIntegrations", "entitlements"] as const;

type QueryRow = { document?: { name: string } };

/**
 * 탈퇴 시 서비스 계정으로 사용자 데이터를 지운다(보안 규칙 우회 — entitlements·feedback은 클라이언트가 못 지운다).
 * 모든 단계가 멱등이라 중간에 실패해도 다시 부르면 이어서 끝난다.
 */
export class AccountDataStore {
  private readonly root: string;
  private readonly api: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 기본값으로 담으면 Workers가 "Illegal invocation"을 던진다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.root = `projects/${projectId}/databases/(default)/documents`;
    this.api = `https://firestore.googleapis.com/v1/${this.root}`;
  }

  private async post(suffix: string, body: unknown): Promise<Response> {
    const token = await this.getToken();
    return this.fetchFn(`${this.api}${suffix}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  private async findOwnedDocNames(collectionId: string, uid: string): Promise<string[]> {
    const res = await this.post(":runQuery", {
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: uid } } },
        select: { fields: [{ fieldPath: "__name__" }] },
        limit: BATCH_LIMIT,
      },
    });
    if (!res.ok) throw new Error(`Firestore ${collectionId} 조회 실패 (${res.status})`);
    const rows = (await res.json()) as QueryRow[];
    return rows.flatMap((row) => (row.document ? [row.document.name] : []));
  }

  private async commit(writes: unknown[]): Promise<void> {
    const res = await this.post(":commit", { writes });
    if (!res.ok) throw new Error(`Firestore 커밋 실패 (${res.status})`);
  }

  /** userId가 uid인 문서를 조회가 빌 때까지 BATCH_LIMIT씩 처리한다. 처리된 문서는 더 이상 조회되지 않아야 한다. */
  private async drain(collectionId: string, uid: string, toWrite: (name: string) => unknown): Promise<void> {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const names = await this.findOwnedDocNames(collectionId, uid);
      if (names.length === 0) return;
      await this.commit(names.map(toWrite));
    }
    throw new Error(`Firestore ${collectionId} 정리가 ${MAX_ROUNDS}회 안에 끝나지 않음`);
  }

  async deleteUserData(uid: string): Promise<void> {
    await this.drain("todos", uid, (name) => ({ delete: name }));
    // 피드백은 내용을 남기고 작성자 식별 정보만 지운다. updateMask에 있고 fields에 없는 필드는 삭제된다.
    await this.drain("feedback", uid, (name) => ({
      update: { name, fields: {} },
      updateMask: { fieldPaths: ["userId", "email"] },
    }));
    await this.commit(SINGLE_DOC_COLLECTIONS.map((collection) => ({ delete: `${this.root}/${collection}/${uid}` })));
  }
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/__tests__/accountDataStore.test.ts` → PASS. `npm run typecheck` → 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add billing-proxy/src/accountDataStore.ts billing-proxy/src/__tests__/accountDataStore.test.ts
git commit -m "feat(billing-proxy): 탈퇴용 Firestore 사용자 데이터 삭제 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Auth 계정 삭제 + `POST /account/delete` 라우트

**Files:**
- Modify: `billing-proxy/src/claims.ts`, `billing-proxy/src/router.ts`, `billing-proxy/src/index.ts`
- Create: `billing-proxy/src/handlers/deleteAccount.ts`
- Test: `billing-proxy/src/__tests__/claims.test.ts`, `billing-proxy/src/__tests__/deleteAccount.test.ts`, `billing-proxy/src/__tests__/router.test.ts`, `billing-proxy/src/__tests__/webhook.test.ts`

**Interfaces:**
- Consumes: `PaddleClient.cancelSubscriptionImmediately` (Task 1), `AccountDataStore.deleteUserData` (Task 2), `EntitlementStore.get(uid): Promise<{ doc: EntitlementDoc; updateTime }>` (기존)
- Produces: `ClaimsClient.deleteUser(uid: string): Promise<void>`; `handleDeleteAccount(uid: string, deps: AccountDeletionDeps): Promise<Response>`; HTTP `POST /account/delete` → `204` | `401 {error:"UNAUTHORIZED"}` | `502 {error:"PADDLE_CANCEL_FAILED"}` | `500`.

- [ ] **Step 1: ClaimsClient 실패 테스트** — `claims.test.ts`의 최상위 describe 안 끝에 추가(파일 상단의 `BASE`, `jsonRes` 등 기존 헬퍼를 그대로 쓴다. 헬퍼 이름이 다르면 그 파일의 이름에 맞춘다):

```ts
  describe("deleteUser", () => {
    it("accounts:delete로 사용자를 지운다", async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      await new ClaimsClient("tododo-83576", async () => "tok", fetchFn).deleteUser("u1");
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe(`${BASE}/accounts:delete`);
      expect(JSON.parse(init.body)).toEqual({ localId: "u1" });
    });

    it("이미 없는 사용자면 성공으로 본다(재시도 멱등)", async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "USER_NOT_FOUND" } }), { status: 400 }),
      );
      await expect(new ClaimsClient("tododo-83576", async () => "tok", fetchFn).deleteUser("u1")).resolves.toBeUndefined();
    });

    it("그 밖의 실패는 던진다", async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "INTERNAL" } }), { status: 500 }));
      await expect(new ClaimsClient("tododo-83576", async () => "tok", fetchFn).deleteUser("u1")).rejects.toThrow("Auth 사용자 삭제 실패 (500)");
    });
  });
```

`BASE`가 claims.test.ts에 다른 projectId로 정의돼 있으면 생성자 projectId를 그 값에 맞춘다.

- [ ] **Step 2: 실패 확인** — `npx vitest run src/__tests__/claims.test.ts` → FAIL.

- [ ] **Step 3: ClaimsClient 구현** — `claims.ts`의 `ClaimsClient` 끝에 추가:

```ts
  /** 탈퇴의 마지막 단계. 이전 시도에서 이미 지워졌으면(USER_NOT_FOUND) 성공으로 본다. */
  async deleteUser(uid: string): Promise<void> {
    const res = await this.post("/accounts:delete", { localId: uid });
    if (res.ok) return;
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (body?.error?.message?.startsWith("USER_NOT_FOUND")) return;
    throw new Error(`Auth 사용자 삭제 실패 (${res.status})`);
  }
```

- [ ] **Step 4: 핸들러 실패 테스트** — `deleteAccount.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDeleteAccount } from "../handlers/deleteAccount";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";

const PADDLE_ACTIVE: EntitlementDoc = {
  ...EMPTY_ENTITLEMENT,
  plan: "premium",
  status: "active",
  source: "paddle",
  customerId: "ctm_1",
  subscriptionId: "sub_1",
  premiumUntil: "2026-11-10T00:00:00.000Z",
};

const makeDeps = (doc: EntitlementDoc) => {
  const calls: string[] = [];
  return {
    calls,
    store: { get: vi.fn(async () => ({ doc, updateTime: "t" })) },
    paddle: { cancelSubscriptionImmediately: vi.fn(async () => void calls.push("cancel")) },
    accountData: { deleteUserData: vi.fn(async () => void calls.push("data")) },
    claims: { deleteUser: vi.fn(async () => void calls.push("auth")) },
  };
};

describe("handleDeleteAccount", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("살아 있는 Paddle 구독이면 해지 → 데이터 삭제 → Auth 삭제 순서로 하고 204", async () => {
    const deps = makeDeps(PADDLE_ACTIVE);
    const res = await handleDeleteAccount("u1", deps);
    expect(res.status).toBe(204);
    expect(deps.paddle.cancelSubscriptionImmediately).toHaveBeenCalledWith("sub_1");
    expect(deps.accountData.deleteUserData).toHaveBeenCalledWith("u1");
    expect(deps.claims.deleteUser).toHaveBeenCalledWith("u1");
    expect(deps.calls).toEqual(["cancel", "data", "auth"]);
  });

  it("해지 예약(cancelAt) 상태여도 아직 active면 즉시 해지한다", async () => {
    const deps = makeDeps({ ...PADDLE_ACTIVE, cancelAt: "2026-11-10T00:00:00.000Z" });
    await handleDeleteAccount("u1", deps);
    expect(deps.paddle.cancelSubscriptionImmediately).toHaveBeenCalledWith("sub_1");
  });

  it.each([
    ["구독 기록 없음", EMPTY_ENTITLEMENT],
    ["체험", { ...EMPTY_ENTITLEMENT, plan: "premium", status: "trialing", source: "trial" } as EntitlementDoc],
    ["운영자 부여", { ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "manual" } as EntitlementDoc],
    ["이미 해지된 Paddle 구독", { ...PADDLE_ACTIVE, status: "canceled" } as EntitlementDoc],
  ])("%s이면 Paddle을 부르지 않고 삭제한다", async (_label, doc) => {
    const deps = makeDeps(doc);
    const res = await handleDeleteAccount("u1", deps);
    expect(res.status).toBe(204);
    expect(deps.paddle.cancelSubscriptionImmediately).not.toHaveBeenCalled();
    expect(deps.calls).toEqual(["data", "auth"]);
  });

  it("Paddle 해지가 실패하면 아무것도 지우지 않고 502 PADDLE_CANCEL_FAILED", async () => {
    const deps = makeDeps(PADDLE_ACTIVE);
    deps.paddle.cancelSubscriptionImmediately.mockRejectedValueOnce(new Error("paddle down"));
    const res = await handleDeleteAccount("u1", deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "PADDLE_CANCEL_FAILED" });
    expect(deps.accountData.deleteUserData).not.toHaveBeenCalled();
    expect(deps.claims.deleteUser).not.toHaveBeenCalled();
  });

  it("데이터 삭제가 실패하면 Auth는 지우지 않고 던진다(재시도할 토큰을 남긴다)", async () => {
    const deps = makeDeps(EMPTY_ENTITLEMENT);
    deps.accountData.deleteUserData.mockRejectedValueOnce(new Error("firestore down"));
    await expect(handleDeleteAccount("u1", deps)).rejects.toThrow("firestore down");
    expect(deps.claims.deleteUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: 실패 확인** — `npx vitest run src/__tests__/deleteAccount.test.ts` → FAIL(모듈 없음).

- [ ] **Step 6: 핸들러 구현** — `handlers/deleteAccount.ts`:

```ts
import type { AccountDataStore } from "../accountDataStore";
import type { ClaimsClient } from "../claims";
import type { EntitlementStore } from "../entitlementStore";
import type { PaddleClient } from "../paddle";

export interface AccountDeletionDeps {
  store: Pick<EntitlementStore, "get">;
  paddle: Pick<PaddleClient, "cancelSubscriptionImmediately">;
  accountData: Pick<AccountDataStore, "deleteUserData">;
  claims: Pick<ClaimsClient, "deleteUser">;
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * 탈퇴. 순서가 곧 안전장치다:
 * 1) 구독 해지 — 실패하면 아무것도 지우지 않는다. 구독이 살아 있는 채 계정만 사라지면 청구가 계속된다.
 * 2) Firestore 데이터 — 실패하면 던져 500. Auth가 남아 있어 클라이언트가 같은 토큰으로 재시도할 수 있다.
 * 3) Auth 계정 — 마지막. 이후 도착하는 Paddle 해지 웹훅은 UserNotFoundError로 200 처리되어 문서를 되살리지 않는다.
 */
export const handleDeleteAccount = async (uid: string, deps: AccountDeletionDeps): Promise<Response> => {
  const { doc } = await deps.store.get(uid);
  if (doc.source === "paddle" && doc.subscriptionId && doc.status !== "canceled") {
    try {
      await deps.paddle.cancelSubscriptionImmediately(doc.subscriptionId);
    } catch (error) {
      console.error("탈퇴 중 Paddle 구독 해지 실패:", uid, doc.subscriptionId, error);
      return json({ error: "PADDLE_CANCEL_FAILED" }, 502);
    }
  }
  await deps.accountData.deleteUserData(uid);
  await deps.claims.deleteUser(uid);
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 7: 핸들러 통과 확인** — `npx vitest run src/__tests__/deleteAccount.test.ts src/__tests__/claims.test.ts` → PASS.

- [ ] **Step 8: 라우터 실패 테스트** — `router.test.ts`의 `makeDeps`를 아래로 교체하고, describe 안 끝에 테스트 추가:

```ts
const makeDeps = (existing: EntitlementDoc = EMPTY_ENTITLEMENT) => ({
  store: { get: vi.fn(async () => ({ doc: existing, updateTime: null })), write: vi.fn(async () => "ok" as const) },
  claims: { setPremiumUntil: vi.fn(async () => undefined), deleteUser: vi.fn(async () => undefined) },
  paddle: {
    createCheckoutTransaction: vi.fn(async () => "txn_1"),
    createPortalUrl: vi.fn(async () => "https://portal/ov"),
    cancelSubscriptionImmediately: vi.fn(async () => undefined),
  },
  accountData: { deleteUserData: vi.fn(async () => undefined) },
});
```

```ts
  describe("/account/delete", () => {
    it("허용 목록 밖 사용자도 탈퇴할 수 있다(204 + CORS)", async () => {
      vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "stranger", premium: false, premiumUntil: null });
      const deps = makeDeps();
      const res = await call(post("/account/delete"), deps);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
      expect(deps.accountData.deleteUserData).toHaveBeenCalledWith("stranger");
      expect(deps.claims.deleteUser).toHaveBeenCalledWith("stranger");
    });

    it("토큰이 틀리면 401이고 아무것도 지우지 않는다", async () => {
      vi.mocked(verifyFirebaseIdToken).mockRejectedValue(new Error("bad"));
      const deps = makeDeps();
      expect((await call(post("/account/delete"), deps)).status).toBe(401);
      expect(deps.accountData.deleteUserData).not.toHaveBeenCalled();
    });

    it("GET은 404", async () => {
      const res = await call(new Request("https://billing.example/account/delete", { method: "GET" }), makeDeps());
      expect(res.status).toBe(404);
    });

    it("삭제 중 예외는 CORS가 붙은 500", async () => {
      const deps = makeDeps();
      deps.accountData.deleteUserData.mockRejectedValueOnce(new Error("boom"));
      const res = await call(post("/account/delete"), deps);
      expect(res.status).toBe(500);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://tododo-83576.web.app");
    });
  });
```

- [ ] **Step 9: 실패 확인** — `npx vitest run src/__tests__/router.test.ts` → 새 테스트 FAIL(404).

- [ ] **Step 10: 라우터·의존성 연결** — `router.ts`:

```ts
import { isAllowedOrigin, verifyFirebaseIdToken } from "@tododo/worker-auth";
import type { AccountDataStore } from "./accountDataStore";
import { isBillingAllowed } from "./allowlist";
import type { ClaimsClient } from "./claims";
import type { CommitDeps } from "./commit";
import type { Env } from "./env";
import { handleCheckout, handlePortal, handleTrial } from "./handlers/account";
import { handleDeleteAccount } from "./handlers/deleteAccount";
import { handleWebhook } from "./handlers/webhook";
import type { PaddleClient } from "./paddle";

export interface BillingDeps extends CommitDeps {
  claims: Pick<ClaimsClient, "setPremiumUntil" | "deleteUser">;
  paddle: Pick<PaddleClient, "createCheckoutTransaction" | "createPortalUrl" | "cancelSubscriptionImmediately">;
  accountData: Pick<AccountDataStore, "deleteUserData">;
}
```

`handleRequest`의 OPTIONS 처리 바로 다음에 추가:

```ts
    // 탈퇴는 결제 허용 목록과 무관하게 누구나 할 수 있어야 한다 — ACCOUNT_ROUTES(허용 목록 적용)와 분리한다.
    if (url.pathname === "/account/delete" && request.method === "POST") {
      const uid = await authenticate(request, env);
      if (!uid) return withCors(json({ error: "UNAUTHORIZED" }, 401), origin, env);
      return withCors(await handleDeleteAccount(uid, getDeps()), origin, env);
    }
```

`index.ts`의 `getDeps`:

```ts
import { AccountDataStore } from "./accountDataStore";
// ...
  const deps: BillingDeps = {
    store: new EntitlementStore(env.FIREBASE_PROJECT_ID, getToken),
    claims: new ClaimsClient(env.FIREBASE_PROJECT_ID, getToken),
    paddle: new PaddleClient(env.PADDLE_API_BASE, env.PADDLE_API_KEY, env.PADDLE_PRICE_ID, env.BILLING_UID_SECRET),
    accountData: new AccountDataStore(env.FIREBASE_PROJECT_ID, getToken),
  };
```

- [ ] **Step 11: 웹훅 회귀 테스트(삭제된 사용자의 해지 웹훅이 문서를 되살리지 않음)** — `webhook.test.ts`의 기존 테스트 `"Auth 사용자가 삭제됐으면 200(무한 재전송 방지)"`(98행 부근)를 열어, 그 테스트 끝에 문서 쓰기가 없었음을 단언하는 줄을 추가한다. 그 테스트의 deps 변수 이름(`d`)을 그대로 쓴다:

```ts
    // 탈퇴 후 도착한 해지 웹훅이 entitlements 문서를 되살리지 않는다(클레임을 문서보다 먼저 쓰기 때문).
    expect(d.store.write).not.toHaveBeenCalled();
```

- [ ] **Step 12: 전체 통과 확인** — `cd billing-proxy && npx vitest run && npm run typecheck` → 전부 PASS, 타입 오류 없음.

- [ ] **Step 13: 커밋**

```bash
git add billing-proxy/src
git commit -m "feat(billing-proxy): 탈퇴 엔드포인트 POST /account/delete 추가

구독 즉시 해지 → Firestore 데이터 삭제(피드백 익명화) → Auth 계정 삭제 순.
결제 허용 목록과 무관하게 누구나 호출할 수 있다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: reminder-proxy `DELETE /account`

**Files:**
- Modify: `reminder-proxy/src/store.ts`, `reminder-proxy/src/scheduler.ts`, `reminder-proxy/src/router.ts`, `reminder-proxy/src/__tests__/memoryStore.ts`
- Test: `reminder-proxy/src/__tests__/router.test.ts`

**Interfaces:**
- Produces: `ReminderStore.clearAll(): void`; `ReminderScheduler.deleteAccount(): Promise<void>`; HTTP `DELETE /account` → `204` | `401`.

- [ ] **Step 1: 실패 테스트** — `router.test.ts`의 `stub`에 `deleteAccount: vi.fn(async () => {}),`를 추가하고 describe 안에 추가:

```ts
  it("DELETE /account → uid의 DO 저장소를 비우고 204 + CORS", async () => {
    const res = await handleRequest(req("DELETE", "/account"), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(env.REMINDER_SCHEDULER.idFromName).toHaveBeenCalledWith("u1");
    expect(stub.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it("DELETE /account도 토큰이 무효면 401이고 DO를 건드리지 않는다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    const res = await handleRequest(req("DELETE", "/account"), env);
    expect(res.status).toBe(401);
    expect(stub.deleteAccount).not.toHaveBeenCalled();
  });

  it("POST /account는 404", async () => {
    const res = await handleRequest(req("POST", "/account"), env);
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 2: 실패 확인** — `cd reminder-proxy && npx vitest run src/__tests__/router.test.ts` → 새 테스트 FAIL(404).

- [ ] **Step 3: 저장소 `clearAll`** — `store.ts`의 `ReminderStore` 인터페이스 끝에:

```ts
  /** 탈퇴: 모든 행을 지운다. 테이블은 남겨 같은 DO 인스턴스가 이후 요청을 받아도 SQL 오류가 나지 않게 한다. */
  clearAll(): void;
```

`SqliteReminderStore`에:

```ts
  clearAll(): void {
    for (const table of ["tokens", "schedule", "sent", "meta", "history"]) this.sql.exec(`DELETE FROM ${table}`);
  }
```

`__tests__/memoryStore.ts`의 `MemoryReminderStore`에:

```ts
  clearAll() {
    this.tokens.clear();
    this.schedule.clear();
    this.sent.clear();
    this.meta.clear();
    this.history.clear();
  }
```

- [ ] **Step 4: DO 메서드** — `scheduler.ts`의 `markHistorySeen` 다음에:

```ts
  /** 탈퇴. 알람을 먼저 끄고 비운다 — meta의 uid가 사라지므로 혹시 남은 알람이 돌아도 alarm()이 바로 끝난다. */
  async deleteAccount(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    this.store.clearAll();
  }
```

- [ ] **Step 5: 라우트** — `router.ts`의 `route` 함수:

```ts
  const isAccount = path === "/account" && request.method === "DELETE";
  if (!isTokens && !isRefresh && !isHistory && !isSeen && !isAccount) return new Response("Not Found", { status: 404 });
```

`const scheduler = ...` 다음 줄에:

```ts
  if (isAccount) {
    await scheduler.deleteAccount();
    return new Response(null, { status: 204 });
  }
```

- [ ] **Step 6: 통과 확인** — `npx vitest run && npm run typecheck` → PASS, 타입 오류 없음(`MemoryReminderStore`가 인터페이스를 구현하므로 `clearAll` 누락 시 타입 오류로 잡힌다).

- [ ] **Step 7: 커밋** (스펙 문서의 clearAll 수정도 함께)

```bash
git add reminder-proxy/src docs/superpowers/specs/2026-10-09-account-deletion-design.md
git commit -m "feat(reminder-proxy): 탈퇴용 DELETE /account 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 웹 탈퇴 오케스트레이션(API 함수 + `deleteAccount`)

**Files:**
- Modify: `client/src/features/billing/api/billingApi.ts`, `client/src/features/reminders/api/reminderProxyApi.ts`
- Create: `client/src/features/account/api/deleteAccount.ts`, `client/src/features/account/index.ts`
- Test: `client/src/features/billing/api/__tests__/billingApi.test.ts`(기존 파일에 추가), `client/src/features/account/api/__tests__/deleteAccount.test.ts`

**Interfaces:**
- Consumes: `disconnectCalendar(googleEventIds: string[]): Promise<{ deletedGoogleEventIds: string[] }>` (`@/features/calendarIntegration/api`), `loadSnapshot(uid)`, `findOrphanGoogleEventIds(snapshot, tracked)` (`@/features/calendarIntegration/hooks/syncSnapshot`)
- Produces: `deleteAccountOnServer(): Promise<void>`, `deleteReminderAccount(): Promise<void>`, `deleteAccount(): Promise<void>` (`@/features/account`)

- [ ] **Step 1: billingApi 실패 테스트** — 기존 `billingApi.test.ts`를 열어 모킹 방식(`authorizedFetch` 모킹, `BILLING_PROXY_URL` 설정 방식)을 확인하고 같은 방식으로 추가:

```ts
  describe("deleteAccountOnServer", () => {
    it("POST /account/delete를 부르고 204면 resolve", async () => {
      vi.mocked(authorizedFetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
      await expect(deleteAccountOnServer()).resolves.toBeUndefined();
      expect(authorizedFetch).toHaveBeenCalledWith(expect.any(String), "/account/delete", { method: "POST" });
    });

    it("실패하면 서버 오류 코드를 담은 BillingApiError", async () => {
      vi.mocked(authorizedFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "PADDLE_CANCEL_FAILED" }), { status: 502 }),
      );
      await expect(deleteAccountOnServer()).rejects.toMatchObject({ status: 502, code: "PADDLE_CANCEL_FAILED" });
    });
  });
```

결제 서버 주소가 비어 있을 때의 테스트(Review Focus 5)는 이 파일이 `../config`를 모킹하는 방식에 맞춰 추가한다. 이미 `NOT_CONFIGURED` 테스트가 있으면 같은 방식으로 `deleteAccountOnServer`에 대해 하나 더 쓴다:

```ts
    it("주소가 비어 있으면 NOT_CONFIGURED로 실패한다(조용히 성공하지 않는다)", async () => {
      // 이 파일의 기존 NOT_CONFIGURED 테스트와 같은 방법으로 BILLING_PROXY_URL을 ""로 만든 뒤:
      await expect(deleteAccountOnServer()).rejects.toMatchObject({ status: 0, code: "NOT_CONFIGURED" });
      expect(authorizedFetch).not.toHaveBeenCalled();
    });
```

기존 파일에 그런 장치가 없으면 `vi.doMock("../../config", ...)` + `vi.resetModules()` 후 동적 import로 `deleteAccountOnServer`를 다시 불러와 테스트한다.

- [ ] **Step 2: 실패 확인** — `cd client && VITE_FIREBASE_API_KEY= npx vitest run src/features/billing/api` → FAIL.

- [ ] **Step 3: billingApi 구현** — `post`를 아래로 교체하고 함수 추가:

```ts
const send = async (path: string): Promise<Response> => {
  if (!BILLING_PROXY_URL) throw new BillingApiError(0, "NOT_CONFIGURED");
  const res = await authorizedFetch(BILLING_PROXY_URL, path, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new BillingApiError(res.status, body?.error ?? null);
  }
  return res;
};

const post = async <T>(path: string): Promise<T> => (await (await send(path)).json()) as T;
```

```ts
/** 탈퇴: 구독 즉시 해지 + 서버 데이터·계정 삭제. 성공 응답은 본문이 없다(204). */
export const deleteAccountOnServer = async (): Promise<void> => {
  await send("/account/delete");
};
```

- [ ] **Step 4: reminderProxyApi 추가** — 파일 끝에:

```ts
/** 탈퇴: 이 사용자의 푸시 토큰·알림 기록·예약 알람을 모두 지운다. */
export const deleteReminderAccount = (): Promise<void> => call("/account", { method: "DELETE" });
```

기존 `reminderProxyApi.test.ts`에 같은 모킹 방식으로 추가:

```ts
  it("deleteReminderAccount는 DELETE /account를 부른다", async () => {
    vi.mocked(authorizedFetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteReminderAccount();
    expect(authorizedFetch).toHaveBeenCalledWith(expect.any(String), "/account", { method: "DELETE" });
  });
```

- [ ] **Step 5: deleteAccount 실패 테스트** — `features/account/api/__tests__/deleteAccount.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const mockDisconnect = vi.fn(async (_ids: string[]) => {
  calls.push("calendar");
  return { deletedGoogleEventIds: [] };
});
const mockReminder = vi.fn(async () => void calls.push("reminder"));
const mockServer = vi.fn(async () => void calls.push("server"));

vi.mock("@/features/calendarIntegration/api", () => ({ disconnectCalendar: (ids: string[]) => mockDisconnect(ids) }));
vi.mock("@/features/reminders/api/reminderProxyApi", () => ({ deleteReminderAccount: () => mockReminder() }));
vi.mock("@/features/billing/api/billingApi", () => ({ deleteAccountOnServer: () => mockServer() }));
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "u1" } } }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));

const mockGetDocs = vi.fn();
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "todosRef"),
  where: vi.fn(() => "whereClause"),
  query: vi.fn(() => "q"),
  getDocs: () => mockGetDocs(),
}));

vi.mock("@/features/calendarIntegration/hooks/syncSnapshot", () => ({
  loadSnapshot: () => new Map([["gone", { updatedAt: "x", googleEventId: "ev_orphan" }]]),
  findOrphanGoogleEventIds: (snapshot: Map<string, { googleEventId: string | null }>, tracked: Iterable<string>) => {
    const set = new Set(tracked);
    return [...snapshot.values()].flatMap((e) => (e.googleEventId && !set.has(e.googleEventId) ? [e.googleEventId] : []));
  },
}));

const docsWith = (...data: Record<string, unknown>[]) => ({ docs: data.map((d) => ({ data: () => d })) });

describe("deleteAccount", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    mockGetDocs.mockResolvedValue(docsWith({ googleEventId: "ev_1" }, { googleEventId: null }, {}));
  });

  it("캘린더 → 알림 → 서버 순서로 부르고, 할 일 + 스냅샷 고아 이벤트 id를 보낸다", async () => {
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();
    expect(calls).toEqual(["calendar", "reminder", "server"]);
    expect(mockDisconnect).toHaveBeenCalledWith(["ev_1", "ev_orphan"]);
  });

  it("중간 단계가 실패하면 거기서 멈추고 던진다", async () => {
    mockReminder.mockRejectedValueOnce(new Error("reminder down"));
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("reminder down");
    expect(mockServer).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: 실패 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/features/account` → FAIL(모듈 없음).

- [ ] **Step 7: 구현** — `features/account/api/deleteAccount.ts`:

```ts
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth } from "@/shared/lib/firebase";
import { db } from "@/shared/lib/firestore";
import { disconnectCalendar } from "@/features/calendarIntegration/api";
import { findOrphanGoogleEventIds, loadSnapshot } from "@/features/calendarIntegration/hooks/syncSnapshot";
import { deleteReminderAccount } from "@/features/reminders/api/reminderProxyApi";
import { deleteAccountOnServer } from "@/features/billing/api/billingApi";

/** 보관된 할 일까지 포함해 구글에 만든 이벤트 id를 모은다. 스냅샷에만 남은 고아 이벤트도 같이 지운다. */
const collectGoogleEventIds = async (uid: string): Promise<string[]> => {
  const snapshot = await getDocs(query(collection(db, "todos"), where("userId", "==", uid)));
  const tracked = snapshot.docs
    .map((d) => d.data().googleEventId as unknown)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...tracked, ...findOrphanGoogleEventIds(loadSnapshot(uid), tracked)];
};

/**
 * 탈퇴. 각 단계는 멱등이라 실패하면 처음부터 다시 부르면 된다.
 * 서버 계정 삭제(마지막)가 끝나기 전까지는 ID 토큰이 유효하므로 앞 단계 재시도가 항상 가능하다.
 * 캘린더 연동이 없어도 /disconnect는 성공한다 — 연동 여부(프리미엄 전용 문서)를 미리 읽지 않는 이유.
 */
export const deleteAccount = async (): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  await disconnectCalendar(await collectGoogleEventIds(uid));
  await deleteReminderAccount();
  await deleteAccountOnServer();
};
```

`features/account/index.ts`:

```ts
export { deleteAccount } from "./api/deleteAccount";
```

- [ ] **Step 8: 통과 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/features/account src/features/billing src/features/reminders` → PASS. `npx tsc -b` → 오류 없음.

- [ ] **Step 9: 커밋**

```bash
git add client/src/features/account client/src/features/billing/api client/src/features/reminders/api
git commit -m "feat(client): 탈퇴 오케스트레이션 deleteAccount 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 웹 탈퇴 확인 창 + 프로필 메뉴 진입점

**Files:**
- Create: `client/src/features/account/components/accountDeletionDialog.tsx`
- Modify: `client/src/features/account/index.ts`, `client/src/layouts/profileMenu/profileMenu.tsx`
- Test: `client/src/features/account/components/__tests__/accountDeletionDialog.test.tsx`, `client/src/layouts/profileMenu/__tests__/profileMenu.test.tsx`

**Interfaces:**
- Consumes: `deleteAccount()` (Task 5), `useAuth(): { logout: () => Promise<void> }`, `useEntitlement(): { data?: { source; status } }` (`@/features/entitlement`), `useToast(): { success(title) }` (`@/shared`), `clearSnapshot(uid)` (`@/features/calendarIntegration/hooks/syncSnapshot`), `ConfirmModal` (`@/shared`)
- Produces: `AccountDeletionDialog({ onClose: () => void })` (`@/features/account`)

- [ ] **Step 1: 확인 창 실패 테스트** — `accountDeletionDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupUser } from "@/test/setupUser";

const mockDeleteAccount = vi.fn<() => Promise<void>>();
vi.mock("../../api/deleteAccount", () => ({ deleteAccount: () => mockDeleteAccount() }));

const mockLogout = vi.fn(async () => undefined);
vi.mock("@/features/auth/context/useAuth", () => ({ useAuth: () => ({ logout: mockLogout }) }));

let entitlement: { source: string | null; status: string } | undefined;
vi.mock("@/features/entitlement", () => ({ useEntitlement: () => ({ data: entitlement }) }));

const mockSuccess = vi.fn();
vi.mock("@/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared")>()),
  useToast: () => ({ success: mockSuccess }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));

const mockClearSnapshot = vi.fn();
vi.mock("@/features/calendarIntegration/hooks/syncSnapshot", () => ({ clearSnapshot: (uid: string) => mockClearSnapshot(uid) }));
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "u1" } } }));

const renderDialog = async (onClose = vi.fn()) => {
  const { default: AccountDeletionDialog } = await import("../accountDeletionDialog");
  const queryClient = new QueryClient();
  const clear = vi.spyOn(queryClient, "clear");
  render(
    <QueryClientProvider client={queryClient}>
      <AccountDeletionDialog onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, clear };
};

describe("AccountDeletionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlement = undefined;
    mockDeleteAccount.mockResolvedValue(undefined);
  });

  it("삭제 안내를 보여주고 구독이 없으면 구독 안내는 없다", async () => {
    await renderDialog();
    expect(screen.getByText(/할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다\./)).toBeInTheDocument();
    expect(screen.queryByText(/구독이 즉시 해지되고/)).not.toBeInTheDocument();
  });

  it("살아 있는 Paddle 구독이면 구독 해지·환불 안내를 덧붙인다", async () => {
    entitlement = { source: "paddle", status: "active" };
    await renderDialog();
    expect(
      screen.getByText(/구독이 즉시 해지되고 남은 기간은 사라집니다\. 결제 14일 이내라면 환불을 요청할 수 있습니다\./),
    ).toBeInTheDocument();
  });

  it("탈퇴하기를 누르면 삭제 → 스냅샷 정리 → 로그아웃 → 캐시 비움 → 홈 이동 + 토스트", async () => {
    const user = setupUser();
    const { clear } = await renderDialog();
    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith("탈퇴가 완료되었습니다"));
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockClearSnapshot).toHaveBeenCalledWith("u1");
    expect(mockLogout).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("진행 중에는 버튼이 비활성이고 취소로 닫히지 않으며 두 번 호출되지 않는다", async () => {
    mockDeleteAccount.mockReturnValue(new Promise(() => {}));
    const user = setupUser();
    const { onClose } = await renderDialog();
    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

    const pending = screen.getByRole("button", { name: "탈퇴 처리 중…" });
    expect(pending).toBeDisabled();
    await user.click(pending);
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it("실패하면 실패 안내를 보여주고 다시 시도할 수 있다(로그아웃하지 않음)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockDeleteAccount.mockRejectedValueOnce(new Error("boom"));
    const user = setupUser();
    await renderDialog();
    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));

    expect(await screen.findByText(/일부만 처리되었습니다\. 다시 시도해 주세요\./)).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "탈퇴하기" }));
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(2));
  });

  it("취소를 누르면 onClose", async () => {
    const user = setupUser();
    const { onClose } = await renderDialog();
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/features/account/components` → FAIL.

- [ ] **Step 3: 구현** — `accountDeletionDialog.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmModal, useToast } from "@/shared";
import { auth } from "@/shared/lib/firebase";
import { useAuth } from "@/features/auth/context/useAuth";
import { useEntitlement } from "@/features/entitlement";
import { clearSnapshot } from "@/features/calendarIntegration/hooks/syncSnapshot";
import { deleteAccount } from "../api/deleteAccount";

const BASE_MESSAGE = "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.";
const SUBSCRIPTION_NOTICE = "구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.";
const FAILURE_MESSAGE = "일부만 처리되었습니다. 다시 시도해 주세요.";

interface AccountDeletionDialogProps {
  onClose: () => void;
}

/** 열려 있을 때만 렌더한다(부모가 조건부 마운트). 라우터·쿼리 의존성을 프로필 메뉴에서 떼어 두기 위해서다. */
const AccountDeletionDialog = ({ onClose }: AccountDeletionDialogProps) => {
  const [status, setStatus] = useState<"idle" | "pending" | "failed">("idle");
  const { logout } = useAuth();
  const { data: entitlement } = useEntitlement();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const hasSubscription = entitlement?.source === "paddle" && entitlement.status !== "canceled";
  const isPending = status === "pending";

  const handleConfirm = async () => {
    if (isPending) return;
    const uid = auth.currentUser?.uid;
    setStatus("pending");
    try {
      await deleteAccount();
    } catch (error) {
      console.error("회원 탈퇴 실패:", error);
      setStatus("failed");
      return;
    }
    if (uid) clearSnapshot(uid);
    await logout();
    queryClient.clear();
    navigate("/", { replace: true });
    toast.success("탈퇴가 완료되었습니다");
  };

  const message = [BASE_MESSAGE, hasSubscription && SUBSCRIPTION_NOTICE, status === "failed" && FAILURE_MESSAGE]
    .filter(Boolean)
    .join("\n\n");

  return (
    <ConfirmModal
      isOpen
      title="회원 탈퇴"
      message={message}
      confirmText={isPending ? "탈퇴 처리 중…" : "탈퇴하기"}
      confirmDisabled={isPending}
      onConfirm={handleConfirm}
      onCancel={() => {
        if (!isPending) onClose();
      }}
    />
  );
};

export default AccountDeletionDialog;
```

`features/account/index.ts`에 추가:

```ts
export { default as AccountDeletionDialog } from "./components/accountDeletionDialog";
```

- [ ] **Step 4: 통과 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/features/account` → PASS.

- [ ] **Step 5: 프로필 메뉴 실패 테스트** — `profileMenu.test.tsx` 상단 mock들 아래에 추가하고, describe 안에 테스트 추가:

```tsx
vi.mock("@/features/account", () => ({
  AccountDeletionDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="회원 탈퇴 확인">
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </div>
  ),
}));
```

```tsx
  it("회원 탈퇴를 누르면 메뉴가 닫히고 탈퇴 확인 창이 열린다", async () => {
    const user = setupUser();
    render(<ProfileMenu>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));
    await user.click(screen.getByText("회원 탈퇴"));

    expect(screen.queryByText("로그아웃")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "회원 탈퇴 확인" })).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it("탈퇴 확인 창을 닫으면 사라진다", async () => {
    const user = setupUser();
    render(<ProfileMenu>프로필</ProfileMenu>);

    await user.click(screen.getByText("프로필"));
    await user.click(screen.getByText("회원 탈퇴"));
    await user.click(screen.getByText("닫기"));

    expect(screen.queryByRole("dialog", { name: "회원 탈퇴 확인" })).not.toBeInTheDocument();
  });
```

(`logout`이 이전 테스트의 호출을 기억한다면 해당 테스트 시작에 `logout.mockClear()`를 둔다.)

- [ ] **Step 6: 실패 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/layouts/profileMenu` → FAIL.

- [ ] **Step 7: 프로필 메뉴 구현** — `profileMenu.tsx`:

```tsx
import { useState, type ReactNode } from "react";
// ...기존 import
import { AccountDeletionDialog } from "@/features/account";
```

`ProfileMenu` 본문:

```tsx
  const [isDeletionOpen, setIsDeletionOpen] = useState(false);
  // ...
  const handleOpenDeletion = () => {
    close();
    setIsDeletionOpen(true);
  };
```

JSX — 확인 창은 `BottomSheet` 밖 형제로 둔다(BottomSheet는 닫히면 즉시 unmount되어 자식 모달이 같이 사라진다):

```tsx
      <BottomSheet isOpen={isOpen} onClose={close} title={user?.displayName ?? "메뉴"}>
        <MenuList>
          {BILLING_ENABLED && <PremiumMenuRow onNavigate={close} />}
          <MenuRow onClick={handleLogout}>로그아웃</MenuRow>
          <MenuRow onClick={handleOpenDeletion}>회원 탈퇴</MenuRow>
        </MenuList>
      </BottomSheet>
      {isDeletionOpen && <AccountDeletionDialog onClose={() => setIsDeletionOpen(false)} />}
```

- [ ] **Step 8: 전체 확인** — `cd client && VITE_FIREBASE_API_KEY= npx vitest run && npx tsc -b && npx eslint src/features/account src/layouts/profileMenu` → 모두 통과. 번들 예산 검사 스크립트가 있으면(`client/bundle-budget.json`) `package.json`의 해당 스크립트를 실행해 초과가 없는지 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add client/src/features/account client/src/layouts/profileMenu
git commit -m "feat(client): 프로필 메뉴에 회원 탈퇴 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 앱 탈퇴 오케스트레이션

**Files:**
- Create: `mobile/src/account/deleteAccount.ts`
- Test: `mobile/src/account/__tests__/deleteAccount.test.ts`

**Interfaces:**
- Produces: `deleteAccount(): Promise<void>` (`mobile/src/account/deleteAccount`) — 세 Worker를 순서대로 호출, 실패·미설정 시 throw.

- [ ] **Step 1: 실패 테스트** — `deleteAccount.test.ts`:

```ts
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const mockGetIdToken = jest.fn<() => Promise<string>>();
jest.mock("../../firebase", () => ({
  auth: { currentUser: { uid: "u1", getIdToken: () => mockGetIdToken() } },
  db: {},
}));

const mockGetDocs = jest.fn<() => Promise<{ docs: { data: () => Record<string, unknown> }[] }>>();
jest.mock("firebase/firestore", () => ({
  collection: () => "todosRef",
  where: () => "whereClause",
  query: () => "q",
  getDocs: () => mockGetDocs(),
}));

const ENV_KEYS = ["EXPO_PUBLIC_CALENDAR_PROXY_URL", "EXPO_PUBLIC_REMINDER_PROXY_URL", "EXPO_PUBLIC_BILLING_PROXY_URL"] as const;

const fetchMock = jest.fn<typeof fetch>();

describe("deleteAccount", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_CALENDAR_PROXY_URL = "https://cal.example";
    process.env.EXPO_PUBLIC_REMINDER_PROXY_URL = "https://rem.example";
    process.env.EXPO_PUBLIC_BILLING_PROXY_URL = "https://bill.example";
    mockGetIdToken.mockResolvedValue("id-token");
    mockGetDocs.mockResolvedValue({ docs: [{ data: () => ({ googleEventId: "ev_1" }) }, { data: () => ({ googleEventId: null }) }] });
    fetchMock.mockReset().mockImplementation(async () => new Response(null, { status: 204 }));
    global.fetch = fetchMock;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("캘린더 → 알림 → 결제 서버 순서로 ID 토큰을 붙여 호출한다", async () => {
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual(["https://cal.example/disconnect", "https://rem.example/account", "https://bill.example/account/delete"]);
    const [, calendarInit] = fetchMock.mock.calls[0];
    expect(calendarInit?.method).toBe("POST");
    expect(JSON.parse(calendarInit?.body as string)).toEqual({ googleEventIds: ["ev_1"] });
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
    expect(fetchMock.mock.calls[2][1]?.method).toBe("POST");
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    }
  });

  it("중간 단계가 실패하면 멈추고 던진다", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("reminder-proxy /account 실패 (500)");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("서버 주소가 비어 있으면 아무것도 호출하지 않고 던진다", async () => {
    delete process.env.EXPO_PUBLIC_BILLING_PROXY_URL;
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("EXPO_PUBLIC_BILLING_PROXY_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/account` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `mobile/src/account/deleteAccount.ts`:

```ts
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../firebase";

/** Expo는 process.env.EXPO_PUBLIC_*를 빌드 시 인라인한다. 함수 안에서 읽어 테스트가 값을 바꿀 수 있게 한다. */
const readProxyUrls = () => {
  const urls = {
    EXPO_PUBLIC_CALENDAR_PROXY_URL: process.env.EXPO_PUBLIC_CALENDAR_PROXY_URL ?? "",
    EXPO_PUBLIC_REMINDER_PROXY_URL: process.env.EXPO_PUBLIC_REMINDER_PROXY_URL ?? "",
    EXPO_PUBLIC_BILLING_PROXY_URL: process.env.EXPO_PUBLIC_BILLING_PROXY_URL ?? "",
  };
  const missing = Object.entries(urls).filter(([, value]) => !value).map(([key]) => key);
  // 하나라도 없으면 시작하지 않는다 — 일부만 지운 채 "성공"으로 끝나면 안 된다.
  if (missing.length > 0) throw new Error(`탈퇴 서버 주소 미설정: ${missing.join(", ")}`);
  return {
    calendar: urls.EXPO_PUBLIC_CALENDAR_PROXY_URL,
    reminder: urls.EXPO_PUBLIC_REMINDER_PROXY_URL,
    billing: urls.EXPO_PUBLIC_BILLING_PROXY_URL,
  };
};

const callWorker = async (name: string, baseUrl: string, path: string, init: RequestInit, idToken: string) => {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error(`${name} ${path} 실패 (${res.status})`);
};

/** 보관된 할 일까지 포함해 구글 캘린더에 만든 이벤트 id를 모은다. */
const collectGoogleEventIds = async (uid: string): Promise<string[]> => {
  const snapshot = await getDocs(query(collection(db, "todos"), where("userId", "==", uid)));
  return snapshot.docs
    .map((d) => d.data().googleEventId as unknown)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
};

/**
 * 탈퇴. 웹과 같은 순서: 캘린더 연동 해제 → 알림 저장소 삭제 → 결제 서버(구독 해지·데이터·계정 삭제).
 * 각 단계는 멱등이라 실패하면 처음부터 다시 부르면 된다.
 */
export const deleteAccount = async (): Promise<void> => {
  const urls = readProxyUrls();
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();

  const googleEventIds = await collectGoogleEventIds(user.uid);
  await callWorker(
    "calendar-proxy",
    urls.calendar,
    "/disconnect",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ googleEventIds }) },
    idToken,
  );
  await callWorker("reminder-proxy", urls.reminder, "/account", { method: "DELETE" }, idToken);
  await callWorker("billing-proxy", urls.billing, "/account/delete", { method: "POST" }, idToken);
};
```

- [ ] **Step 4: 통과 확인** — `npx jest src/account && npx tsc --noEmit` → PASS.

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/account
git commit -m "feat(mobile): 탈퇴 오케스트레이션 deleteAccount 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 앱 계정 화면 "회원 탈퇴" 버튼

**Files:**
- Modify: `mobile/src/shared/ui/button/Button.tsx`, `mobile/src/screens/AccountScreen.tsx`
- Test: `mobile/src/screens/__tests__/AccountScreen.test.tsx`

**Interfaces:**
- Consumes: `deleteAccount()` (Task 7), `signOut(queryClient)` (기존)
- Produces: `ButtonVariant`에 `"dangerText"` 추가.

- [ ] **Step 1: 실패 테스트** — `AccountScreen.test.tsx` 상단 mock들 아래에 추가:

```tsx
const mockDeleteAccount = jest.fn<() => Promise<void>>();
jest.mock("../../account/deleteAccount", () => ({
  deleteAccount: () => mockDeleteAccount(),
}));
```

`beforeEach`에 `mockDeleteAccount.mockReset().mockResolvedValue(undefined);` 추가. describe 안에 추가:

```tsx
  describe("회원 탈퇴", () => {
    const DELETE_MESSAGE =
      "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.\n\n구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.";

    it("누르면 구독 안내가 담긴 확인 창을 띄우고, 확인하면 탈퇴 후 로그아웃한다", async () => {
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      expect(alertSpy).toHaveBeenCalledWith("회원 탈퇴", DELETE_MESSAGE, expect.any(Array));
      expect(mockDeleteAccount).not.toHaveBeenCalled();

      await pressAlertButton(alertSpy, "탈퇴하기");

      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
      expect(mockSignOut).toHaveBeenCalledWith(queryClient);
    });

    it("취소하면 아무것도 하지 않는다", async () => {
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      await pressAlertButton(alertSpy, "취소");

      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    it("실패하면 안내 창을 띄우고 로그아웃하지 않으며 다시 누를 수 있다", async () => {
      mockDeleteAccount.mockRejectedValueOnce(new Error("boom"));
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      await pressAlertButton(alertSpy, "탈퇴하기");

      expect(alertSpy).toHaveBeenLastCalledWith("탈퇴 실패", "일부만 처리되었습니다. 다시 시도해 주세요.");
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "회원 탈퇴" }).props.accessibilityState).toMatchObject({ disabled: false });
    });

    it("처리 중에는 탈퇴·로그아웃 버튼이 모두 비활성화된다", async () => {
      mockDeleteAccount.mockReturnValueOnce(new Promise(() => {}));
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      await pressAlertButton(alertSpy, "탈퇴하기", false);

      expect(screen.getByRole("button", { name: "회원 탈퇴" }).props.accessibilityState).toMatchObject({ disabled: true });
      expect(screen.getByRole("button", { name: "로그아웃" }).props.accessibilityState).toMatchObject({ disabled: true });
    });

    it("탈퇴 후 로그아웃이 실패하면 앱을 다시 실행하라고 안내한다", async () => {
      mockSignOut.mockRejectedValueOnce(new Error("signout"));
      await renderScreen();

      await fireEvent.press(screen.getByRole("button", { name: "회원 탈퇴" }));
      await pressAlertButton(alertSpy, "탈퇴하기");

      expect(alertSpy).toHaveBeenLastCalledWith("탈퇴 완료", "앱을 다시 실행해 주세요.");
    });
  });
```

- [ ] **Step 2: 실패 확인** — `npx jest src/screens/__tests__/AccountScreen.test.tsx` → FAIL.

- [ ] **Step 3: Button variant** — `Button.tsx`:

```ts
export type ButtonVariant = "primary" | "outline" | "text" | "dangerText";
```

`style` 배열에 `variant === "dangerText" && styles.text,`를, 라벨 스타일 배열에 `variant === "dangerText" && styles.dangerTextLabel,`를 추가하고, `StyleSheet.create`에:

```ts
  dangerTextLabel: {
    color: colors.danger.text,
  },
```

(`styles.text`·`styles.textLabel`의 기존 정의를 확인해 `dangerText`가 text와 같은 여백·크기를 쓰도록 `styles.textLabel`도 함께 적용한다: `variant === "dangerText" && [styles.textLabel, styles.dangerTextLabel]`.)

- [ ] **Step 4: AccountScreen 구현** — import 추가:

```tsx
import { deleteAccount } from "../account/deleteAccount";
```

상수(컴포넌트 밖):

```tsx
// 앱은 아직 구독 상태를 표시하지 않으므로 구독 해지 안내를 항상 함께 보여준다.
const DELETE_MESSAGE =
  "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.\n\n구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.";
```

컴포넌트 안:

```tsx
  const [isDeleting, setIsDeleting] = useState(false);

  // 성공하면 signOut이 user=null을 만들어 RootNavigator가 로그인 화면으로 바꾼다.
  const runDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
    } catch {
      setIsDeleting(false);
      Alert.alert("탈퇴 실패", "일부만 처리되었습니다. 다시 시도해 주세요.");
      return;
    }
    try {
      await signOut(queryClient);
    } catch {
      // 계정은 이미 삭제됐다. 세션만 남은 상태라 재실행하면 토큰 갱신에서 끊긴다.
      Alert.alert("탈퇴 완료", "앱을 다시 실행해 주세요.");
    }
  };

  const handleDeletePress = () => {
    Alert.alert("회원 탈퇴", DELETE_MESSAGE, [
      { text: "취소", style: "cancel" },
      { text: "탈퇴하기", style: "destructive", onPress: runDeleteAccount },
    ]);
  };
```

로그아웃 버튼의 `disabled`를 `isSigningOut || isDeleting`으로 바꾸고, 그 아래에:

```tsx
      <Button
        title="회원 탈퇴"
        variant="dangerText"
        onPress={handleDeletePress}
        disabled={isSigningOut || isDeleting}
      />
```

- [ ] **Step 5: 통과 확인** — `npx jest && npx tsc --noEmit` → 전체 PASS.

- [ ] **Step 6: 커밋**

```bash
git add mobile/src/shared/ui/button mobile/src/screens
git commit -m "feat(mobile): 계정 화면에 회원 탈퇴 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 완료 후(사용자와 함께 할 수동 단계 — 구현 태스크 아님)

- 앱 로컬 `.env`와 EAS 환경에 `EXPO_PUBLIC_CALENDAR_PROXY_URL`, `EXPO_PUBLIC_REMINDER_PROXY_URL`, `EXPO_PUBLIC_BILLING_PROXY_URL` 추가.
- 웹 배포 환경에 `VITE_BILLING_PROXY_URL`이 설정돼 있는지 확인(비어 있으면 웹 탈퇴가 항상 실패로 보인다).
- billing-proxy 서비스 계정 IAM에 Firestore 쓰기·Firebase Auth 사용자 삭제 권한 확인.
- 배포 순서: billing-proxy·reminder-proxy 먼저 → 웹/앱.
- 수동 검증: billing-proxy 로컬 실검증 절차(Paddle 샌드박스)로 구독 중 계정 탈퇴 → Paddle 대시보드에서 해지 확인 → 해지 웹훅이 200으로 끝나고 `entitlements` 문서가 다시 생기지 않는지 확인.
