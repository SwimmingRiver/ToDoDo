# 탈퇴 후 재가입 체험 재지급 방지 + 약관 4판 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 체험을 쓴 계정이 탈퇴하면 로그인 제공자 식별자 HMAC을 1년 보관해 같은 계정 재가입의 웹 체험을 409로 막고, 이를 고지하는 약관·방침 4판(2026-12-28 시행)을 추가한다.

**Architecture:** `@tododo/worker-auth`가 ID 토큰의 `firebase.identities`(google.com·apple.com)를 함께 돌려준다. billing-proxy는 탈퇴 처리에서 데이터 삭제 직전에 `trialHistory/{hmac}`(Firestore, 서비스 계정 전용)를 쓰고, `/trial`에서 같은 키로 조회해 만료 전 기록이 있으면 거절한다. 약관은 기존 판 구조(LEGAL_REVISIONS + LEGAL_EDITIONS)에 4판 본문을 추가한다.

**Tech Stack:** Cloudflare Workers(TypeScript, vitest), Firestore REST, React(client, vitest).

**Spec:** `docs/superpowers/specs/2026-11-22-trial-reuse-after-deletion-design.md`

## Global Constraints

- 시행일 `2026-12-28`(서울). billing-proxy 기록 시작 시각 = `2026-12-27T15:00:00.000Z`.
- 보관 기간 365일: `expireAt = recordedAt + 365일`.
- 식별자 제공자는 `"google.com"`, `"apple.com"`만. 해시 입력 `${provider}:${sub}`, `hmacSha256Hex(TRIAL_HMAC_SECRET, …)`.
- `trialHistory` 문서 필드는 `provider`, `recordedAt`(ISO 문자열), `expireAt`(Firestore timestampValue)만. uid·이메일·원래 sub 금지. 로그에도 sub·해시 금지(uid만).
- 저장 실패·시크릿 없음 → 탈퇴는 계속(console.error). 조회 실패·시크릿 없음 → 체험은 기존 로직대로(fail-open, console.error).
- 시크릿 이름 `TRIAL_HMAC_SECRET`, Env에서 optional(`?: string`).
- 거절 응답은 기존 그대로 `409 { error: "TRIAL_ALREADY_USED" }`. 클라이언트 변경 없음.
- 4판 법률 문구는 Task 1의 초안을 **사용자가 확인한 뒤에만** 확정 커밋한다(확인 전엔 초안으로 진행하되 최종 보고에 명시).
- 커밋 시 hooks 우회(`--no-verify`) 금지. 서브에이전트에도 명시.
- 주석·커밋 메시지는 한국어.

## Review Focus

1. 한 uid에 google.com·apple.com이 둘 다 연결된 계정 → 탈퇴 시 두 문서 모두, 재가입 시 둘 중 하나만 맞아도 거절 → Task 4 테스트.
2. `trialUsedAt` 없는 계정 탈퇴 → 아무것도 쓰지 않음(재가입 계정 재탈퇴로 기간이 늘지 않음) → Task 4 테스트.
3. 시행 시각 직전/직후 탈퇴 → 직전은 저장 안 함, 직후는 저장 → Task 4 테스트.
4. 만료(`expireAt <= now`)된 문서가 아직 남아 있음(TTL 지연) → 체험 허용 → Task 3 테스트.
5. identities가 없거나 이상한 형태(배열 아님, 다른 제공자만) → 던지지 않고 빈 결과 → Task 2 테스트.

---

### Task 1: 약관·방침 4판 본문 (2026-12-28)

**Files:**
- Create: `client/src/features/legal/content/editions/2026-11-27/{privacy,terms}.ts` — 현재 `content/privacy.ts`·`terms.ts`를 그대로 옮김(상수명 `PRIVACY_2026_11_27`·`TERMS_2026_11_27`, 상단 주석은 2026-11-04 편 형식)
- Modify: `client/src/features/legal/content/privacy.ts`, `terms.ts` — 4판 본문, 상단 주석 "2026-12-28 시행 판…"
- Modify: `client/src/features/legal/content/index.ts` — terms·privacy에 `2026-11-27`(옛 본문) → `2026-12-28`(새 본문). refund는 본문이 안 바뀌므로 그대로.
- Modify: `client/src/features/legal/config.ts` — `LEGAL_REVISIONS`에 4판 추가(config는 직전 판과 같음)
- Test: `client/src/features/legal/content/__tests__/content.test.ts`

**4판 문구 초안 (사용자 확인 대상)**

`LEGAL_REVISIONS` change:
> 회원 탈퇴 후 같은 계정으로 다시 가입해 7일 무료 체험을 반복해서 받지 못하도록, 체험을 사용한 계정은 탈퇴 후 1년 동안 체험 사용 확인값(로그인 계정 식별자를 원래 값으로 되돌릴 수 없게 변환한 값)을 보관합니다. Apple 로그인으로 받는 정보를 추가합니다.

개인정보처리방침
- 2번 표: 기존 Google 행 아래에 추가
  - `["이메일 또는 Apple이 만든 대리 이메일, 이름(Apple 로그인, 이름은 처음 가입할 때만)", "회원 식별, 화면 표시"]`
  - `["체험 사용 확인값(로그인한 Google·Apple 계정의 식별자를 원래 값으로 되돌릴 수 없게 변환한 값)", "7일 무료 체험 중복 사용 방지"]`
- 3번 목록: Google 문장 다음에 `"Apple 로그인 시 Apple로부터 이메일(이메일 가리기를 고르면 Apple이 만든 대리 이메일)과, 처음 가입할 때 이름을 받습니다."`
- 4번 표: `["체험 사용 확인값", "체험을 사용한 계정을 회원 탈퇴한 날부터 1년"]` 추가
- 4번 문단: `"보유 기간이 지나거나 회원 탈퇴 또는 삭제를 요청하면 복구할 수 없는 방법으로 지체 없이 삭제합니다. 다만 체험 사용 확인값은 위 기간 동안 보관한 뒤 삭제하고, 결제 관련 기록은 결제를 처리한 Paddle, Apple, Google이 관련 법령에 따라 보관합니다."`
- 5번 표 Google LLC 행 이전 항목: 끝에 `", 체험 사용 확인값"` 추가
- 7번 탈퇴 문장 끝에 추가: `" 7일 무료 체험을 사용한 계정은, 같은 Google·Apple 계정으로 다시 가입해 체험을 또 받는 것을 막기 위해 체험 사용 확인값을 탈퇴한 날부터 1년 동안 보관합니다."`

이용약관 제6조 첫 항목:
> 이용자는 프리미엄을 7일 동안 무료로 체험할 수 있으며, 체험은 웹과 앱을 합쳐 계정당 한 번입니다. 회원 탈퇴 후 같은 Google 또는 Apple 계정으로 다시 가입해도 탈퇴한 날부터 1년 동안은 체험을 다시 받을 수 없습니다.

- [ ] **Step 1: 실패하는 테스트** — `content.test.ts`에 추가:
  - `it("4판(2026-12-28): 방침은 체험 사용 확인값과 1년 보관, Apple 로그인 정보를 적는다")` — `LEGAL_DOCUMENTS.privacy` 전체 텍스트에 `"체험 사용 확인값"`, `"탈퇴한 날부터 1년"`, `"Apple 로그인 시 Apple로부터"` 포함
  - `it("4판: 약관 제6조는 탈퇴 후 재가입 1년 제한을 적는다")` — terms 텍스트에 `"탈퇴한 날부터 1년 동안은 체험을 다시 받을 수 없습니다"` 포함
  - `it("3판 본문(2026-11-27)은 옛 문장 그대로다")` — `PRIVACY_2026_11_27`에 `"체험 사용 확인값"` 미포함, Google 로그인 문장 포함
- [ ] **Step 2: 실패 확인** — `cd client && npx vitest run src/features/legal` → 새 케이스 FAIL
- [ ] **Step 3: 구현** — 위 Files대로. 기존 "본문 판" 테스트(시행일 순·LEGAL_REVISIONS 포함)가 통과해야 한다.
- [ ] **Step 4: 통과 확인** — `cd client && npx vitest run src/features/legal && npx tsc --noEmit -p .` → PASS
- [ ] **Step 5: 커밋** — `feat(legal): 약관·개인정보처리방침 4판(2026-12-28) — 탈퇴 후 체험 사용 확인값 1년 보관, Apple 로그인 정보`

---

### Task 2: `@tododo/worker-auth` — identities 노출

**Files:**
- Modify: `packages/worker-auth/src/auth.ts`, `packages/worker-auth/src/index.ts`(타입 export)
- Test: `packages/worker-auth/src/__tests__/auth.test.ts`

**Interfaces:**
- Produces: `export type LoginProvider = "google.com" | "apple.com"`; `VerifiedToken.identities: Partial<Record<LoginProvider, string[]>>`

- [ ] **Step 1: 실패하는 테스트** — 기존 토큰 생성 헬퍼에 `firebase` 클레임을 넣어:
  - `it("firebase.identities의 google.com·apple.com 값을 identities로 돌려준다")` — `{ "google.com": ["g1"], "apple.com": ["a1"], email: ["x@y"] }` → `{ "google.com": ["g1"], "apple.com": ["a1"] }`
  - `it("identities가 없거나 형태가 이상하면 빈 객체")` — `firebase` 없음 → `{}`; `"google.com": "g1"`(배열 아님) → 키 없음; 배열 안 비문자열은 버림
- [ ] **Step 2: 실패 확인** — `cd packages/worker-auth && npx vitest run` → FAIL
- [ ] **Step 3: 구현** — payload 타입에 `firebase?: { identities?: unknown }`, 반환에 `identities` 추가.
- [ ] **Step 4: 통과 확인** — `cd packages/worker-auth && npx vitest run && npx tsc --noEmit`, 그리고 소비처 `cd ai-proxy && npx tsc --noEmit`, `cd calendar-proxy && npx tsc --noEmit`, `cd billing-proxy && npx tsc --noEmit` → 모두 통과
- [ ] **Step 5: 커밋** — `feat(worker-auth): ID 토큰의 로그인 제공자 식별자(google.com·apple.com) 노출`

---

### Task 3: billing-proxy `trialHistory` 저장소와 키

**Files:**
- Create: `billing-proxy/src/trialHistory.ts`
- Modify: `billing-proxy/src/env.ts`(`TRIAL_HMAC_SECRET?: string` + 주석: 운영에만, 회전 안 함), `billing-proxy/src/deps.ts`(인스턴스 생성), `firestore.rules`(`match /trialHistory/{key} { allow read, write: if false; }`, storeLinks 블록 옆)
- Test: `billing-proxy/src/__tests__/trialHistory.test.ts`

**Interfaces:**
- Consumes: Task 2 `LoginProvider`, `VerifiedToken["identities"]`
- Produces:
  - `TRIAL_HISTORY_START = new Date("2026-12-27T15:00:00.000Z")`, `TRIAL_HISTORY_TTL_MS = 365 * 24 * 60 * 60 * 1000`
  - `trialIdentityKeys(secret: string, identities: VerifiedToken["identities"]): Promise<{ provider: LoginProvider; key: string }[]>`
  - `class TrialHistoryStore { constructor(projectId, getToken, fetchFn?); record(entries: { provider: LoginProvider; key: string }[], now: Date): Promise<void>; hasActive(keys: string[], now: Date): Promise<boolean> }`
  - `BillingDeps.trialHistory: Pick<TrialHistoryStore, "record" | "hasActive"> | null`(시크릿 없으면 null), `BillingDeps.trialSecret: string | null` — 또는 둘을 묶은 동등한 형태(구현자 판단, Task 4가 이 이름을 쓴다)

- [ ] **Step 1: 실패하는 테스트**
  - `it("trialIdentityKeys는 provider:sub를 HMAC한 키를 제공자별로 만든다")` — 같은 sub라도 google.com/apple.com 키가 다르고, `hmacSha256Hex(secret, "google.com:g1")`과 같다
  - `it("record는 trialHistory/{key}에 provider·recordedAt·expireAt(+365일)만 쓴다")` — 가짜 fetch로 요청 URL·body 단언, uid 필드 없음
  - `it("hasActive는 만료 전 문서가 하나라도 있으면 true")`
  - `it("hasActive는 expireAt이 지난 문서만 있으면 false (TTL 지연)")`
  - `it("hasActive는 404면 false")`
- [ ] **Step 2: 실패 확인** — `cd billing-proxy && npx vitest run src/__tests__/trialHistory.test.ts` → FAIL
- [ ] **Step 3: 구현** — `storeLinks.ts`의 요청·`fetchFn` 패턴 그대로(전역 fetch 기본값 금지 — Illegal invocation). `hasActive`는 키마다 GET(키는 최대 2개). `record`는 문서마다 PATCH(덮어쓰기). `expireAt`은 `timestampValue`.
- [ ] **Step 4: 통과 확인** — `cd billing-proxy && npx vitest run && npx tsc --noEmit` → PASS
- [ ] **Step 5: 커밋** — `feat(billing-proxy): 체험 사용 확인값 저장소(trialHistory)와 HMAC 키, 보안 규칙`

---

### Task 4: 탈퇴 시 저장 + `/trial` 거절 + 라우터 연결

**Files:**
- Modify: `billing-proxy/src/router.ts` — `authenticate`가 `VerifiedToken | null` 반환, `/account/delete`·`/trial`에 identities 전달(다른 라우트는 `token.uid`)
- Modify: `billing-proxy/src/handlers/deleteAccount.ts` — Google 해지 뒤, `deleteUserData` 전에 기록
- Modify: `billing-proxy/src/handlers/account.ts` — `handleTrial`에서 `applyTrial` 전 조회
- Modify: `billing-proxy/README.md` — `TRIAL_HMAC_SECRET`(운영에만), Firestore TTL 설정 명령, 회전 금지
- Test: `billing-proxy/src/__tests__/deleteAccount.test.ts`, `router.test.ts`(또는 trial 핸들러 테스트 위치)

**Interfaces:**
- Consumes: Task 3 전부

- [ ] **Step 1: 실패하는 테스트**
  - deleteAccount:
    - `it("시행 후 체험을 쓴 계정이면 데이터 삭제 전에 google·apple 키를 모두 기록한다")` — 호출 순서: record → deleteUserData → deleteUser
    - `it("trialUsedAt이 없으면 기록하지 않는다")`
    - `it("시행 시각 전(2026-12-27T14:59:59Z)이면 기록하지 않고, 시행 시각에는 기록한다")`
    - `it("기록이 실패해도 탈퇴는 204로 끝난다")`
    - `it("시크릿이 없으면(trialHistory null) 기록 없이 탈퇴한다")`
  - trial:
    - `it("만료 전 기록이 있는 식별자면 409 TRIAL_ALREADY_USED, 체험을 쓰지 않는다")`
    - `it("apple.com만 일치해도 거절한다")`
    - `it("기록 조회가 실패하면 기존 로직대로 체험을 시작한다")`
- [ ] **Step 2: 실패 확인** — `cd billing-proxy && npx vitest run` → 새 케이스 FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `cd billing-proxy && npx vitest run && npx tsc --noEmit`, 루트 node_modules 영향 확인([[worker-tsc-root-types-leak]]: Buffer 등 Node 전용 API 금지)
- [ ] **Step 5: 커밋** — `feat(billing-proxy): 체험을 쓴 계정 탈퇴 시 확인값 기록, 재가입 웹 체험 거절`
