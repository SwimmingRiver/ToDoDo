# 알림 기록 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 벨 메뉴에 최근 7일간 실제 발송된 마감 알림 기록과 안 읽음 배지를 보여주고, 읽음 위치를 모든 기기가 공유하게 한다.

**Architecture:** reminder-proxy의 사용자별 Durable Object가 발송 성공 시 `history` 테이블에 제목 스냅샷을 남기고, `GET /reminders/history`·`POST /reminders/history/seen`으로 노출한다. 읽음은 DO meta의 `lastSeenAt` 하나다. 클라이언트는 TanStack Query로 조회하고, 배지 = `sentAt > lastSeenAt` 개수.

**Tech Stack:** Cloudflare Workers + Durable Objects(SQLite), vitest 2 (worker) / React 19 + TanStack Query + styled-components + vitest 4 + Testing Library (client)

**Spec:** `docs/superpowers/specs/2026-10-01-reminder-history-design.md`

## Global Constraints

- 보관: 최근 7일(`7 * 24 * 60 * 60_000` ms), 최대 50개. 서버 정리 + 조회 시 필터 둘 다 적용.
- 기록은 `deliver` 성공(한 기기 이상 수락) 시에만. 실패·재시도 대기·건너뜀·유예 초과 폐기는 기록하지 않는다.
- 제목은 발송 시점 스냅샷(`current.title`).
- 읽음 규칙: `lastSeenAt = max(기존값, min(seenUntil, now))`. `seenUntil`은 클라가 화면에 보여준 가장 최신 `sentAt`.
- Firestore 쓰기 없음. 서비스계정 권한(Datastore Viewer) 변경 없음.
- `VITE_REMINDER_PROXY_URL`이 비면 클라는 네트워크 없이 `{ items: [], lastSeenAt: 0 }`.
- 알림 문구는 `@tododo/core/dist/reminders/index.js`의 `reminderBody` 재사용(OS 알림과 동일). `@tododo/core` 루트 import 금지.
- UI 문구(정확히): 패널/트리거 이름 `"알림"`, 안 읽음 시 트리거 `"알림, 읽지 않은 알림 N개"`, 빈 상태 `"최근 7일간 받은 알림이 없어요"`, 실패 `"알림 기록을 불러오지 못했어요"`, 배지 9 초과는 `"9+"`.
- 커밋 시 git hooks 우회(`--no-verify`) 금지. 포그라운드·유한 명령만 사용(백그라운드 대기 금지).
- client 테스트는 CI 등가로 `VITE_FIREBASE_API_KEY= npx vitest run`으로도 확인.

## Review Focus

1. **포그라운드 알림이 DO 기록보다 먼저 도착** — `deliver`는 모든 토큰에 보낸 뒤에야 `addHistory`하므로, 첫 기기가 메시지를 받고 즉시 재조회하면 아직 기록이 없다. 사용자 기대: 토스트를 본 직후 벨에 배지가 뜬다. → Task 4에서 무효화를 `HISTORY_REFETCH_DELAY_MS`(3초) 지연 + Task 6에서 패널 열 때 재조회.
2. **패널이 열린 채 새 알림이 도착** — 새 항목도 ●로 보이고, 읽음 처리도 그 항목까지 올라가야 한다(닫았다 열면 배지 0). → Task 6 테스트.
3. **오래된 탭이 늦게 seen을 보냄 / 시계가 앞선 클라가 미래 seenUntil을 보냄** — 읽음 위치가 되돌아가거나 미래 알림이 미리 읽음 처리되면 안 된다. → Task 1 `markSeen` 테스트.
4. **알림 기기가 0개인 동안 기록이 쌓여 있음**(알람이 안 돌아 정리 안 됨) — 7일 지난 항목이 보이면 안 된다. → Task 1 `readHistory` 테스트(정리 없이도 필터).
5. **같은 예약이 재시도 끝에 성공** — 기록은 정확히 1건. → Task 1 alarmRunner 테스트.

참고(스코프 밖, 기존 동작): 삭제된 할 일의 `/todo/:id`는 `TodoDetail`이 `null`을 렌더해 빈 본문이 된다. OS 알림 클릭과 같은 동작이므로 이번에 바꾸지 않는다.

---

## File Structure

**reminder-proxy**
- Modify `src/store.ts` — `history` 테이블, `HistoryItem` 타입, `addHistory`/`listHistory`/`pruneHistory`, `MetaKey`에 `lastSeenAt`
- Create `src/history.ts` — 보관 상수, `readHistory`, `markSeen`(순수 로직, 테스트 대상)
- Modify `src/alarmRunner.ts` — 발송 성공 시 기록, 정리
- Modify `src/scheduler.ts` — RPC `getHistory`, `markHistorySeen`
- Modify `src/router.ts` — 두 라우트, CORS `GET`
- Modify `src/__tests__/memoryStore.ts`; Create `src/__tests__/history.test.ts`; Modify `src/__tests__/alarmRunner.test.ts`, `src/__tests__/router.test.ts`

**client**
- Modify `src/features/reminders/api/reminderProxyApi.ts` (+ 테스트)
- Create `src/features/reminders/hooks/useReminderHistory.ts` (+ 테스트)
- Modify `src/features/reminders/hooks/useForegroundReminders.ts` (+ 테스트)
- Create `src/features/reminders/utils/timeAgo.ts` (+ 테스트)
- Create `src/layouts/notificationMenu/notificationHistoryList.tsx`, `notificationHistoryList.styles.tsx` (+ 테스트)
- Modify `src/layouts/notificationMenu/notificationMenu.tsx`, `notificationMenu.styles.tsx`, `__tests__/notificationMenu.test.tsx`
- Modify `src/features/reminders/index.ts` (배럴 export)

---

### Task 1: DO 기록 저장소와 읽음 규칙

**Files:**
- Modify: `reminder-proxy/src/store.ts`
- Create: `reminder-proxy/src/history.ts`
- Modify: `reminder-proxy/src/alarmRunner.ts`
- Modify: `reminder-proxy/src/__tests__/memoryStore.ts`
- Create: `reminder-proxy/src/__tests__/history.test.ts`
- Modify: `reminder-proxy/src/__tests__/alarmRunner.test.ts`

**Interfaces:**
- Produces:
  - `store.ts`: `export interface HistoryItem { todoId: string; title: string; offsetMinutes: ReminderOffsetMinutes; dueAt: string; sentAt: number }`; `ReminderStore.addHistory(item: HistoryItem, fireAt: number): void`; `listHistory(sinceSentAt: number, limit: number): HistoryItem[]`(sentAt 내림차순, `sentAt >= sinceSentAt`); `pruneHistory(beforeSentAt: number, keep: number): void`; `MetaKey`에 `"lastSeenAt"`
  - `history.ts`: `HISTORY_RETENTION_MS`, `HISTORY_LIMIT`, `interface HistoryResponse { items: HistoryItem[]; lastSeenAt: number }`, `readHistory(store: ReminderStore, now: number): HistoryResponse`, `markSeen(store: ReminderStore, seenUntil: number, now: number): void`

- [ ] **Step 1: 저장소 계약 확장 (타입 먼저)**

`reminder-proxy/src/store.ts` 상단을 다음으로 바꾼다:

```ts
import type { ReminderOffsetMinutes } from "@tododo/core/dist/reminders/index.js";
import type { ScheduleEntry } from "./schedule";

export type MetaKey = "uid" | "refreshPending" | "windowEnd" | "lastSeenAt";

/** 벨 메뉴에 보여줄 발송 기록. 제목은 발송 시점 스냅샷이다(할 일이 지워지거나 바뀌어도 받은 그대로). */
export interface HistoryItem {
  todoId: string;
  title: string;
  offsetMinutes: ReminderOffsetMinutes;
  dueAt: string;
  sentAt: number;
}
```

`ReminderStore` 인터페이스의 `pruneSent` 아래에 추가:

```ts
  /** (todoId, fireAt)이 같으면 무시한다 — 같은 예약이 두 번 기록되지 않게. */
  addHistory(item: HistoryItem, fireAt: number): void;
  /** sentAt >= sinceSentAt인 기록을 최신순으로 최대 limit개. */
  listHistory(sinceSentAt: number, limit: number): HistoryItem[];
  /** sentAt < beforeSentAt을 지우고, 남은 것 중 최신 keep개만 남긴다. */
  pruneHistory(beforeSentAt: number, keep: number): void;
```

- [ ] **Step 2: SQLite 구현**

`SqliteReminderStore` 생성자의 `meta` 테이블 생성 줄 아래에:

```ts
    // sent(중복 방지, 마감 하루 뒤 삭제)와 수명·필드가 달라 분리한다. 키를 같게 두어 중복 기록을 막는다.
    sql.exec(
      "CREATE TABLE IF NOT EXISTS history (todoId TEXT NOT NULL, fireAt INTEGER NOT NULL, title TEXT NOT NULL, offsetMinutes INTEGER NOT NULL, dueAt TEXT NOT NULL, sentAt INTEGER NOT NULL, PRIMARY KEY (todoId, fireAt))",
    );
```

`pruneSent` 메서드 아래에:

```ts
  addHistory(item: HistoryItem, fireAt: number): void {
    this.sql.exec(
      "INSERT OR IGNORE INTO history (todoId, fireAt, title, offsetMinutes, dueAt, sentAt) VALUES (?, ?, ?, ?, ?, ?)",
      item.todoId,
      fireAt,
      item.title,
      item.offsetMinutes,
      item.dueAt,
      item.sentAt,
    );
  }

  listHistory(sinceSentAt: number, limit: number): HistoryItem[] {
    return this.sql
      .exec<{ todoId: string; title: string; offsetMinutes: number; dueAt: string; sentAt: number }>(
        "SELECT todoId, title, offsetMinutes, dueAt, sentAt FROM history WHERE sentAt >= ? ORDER BY sentAt DESC LIMIT ?",
        sinceSentAt,
        limit,
      )
      .toArray()
      .map((r) => ({ ...r, offsetMinutes: r.offsetMinutes as ReminderOffsetMinutes }));
  }

  pruneHistory(beforeSentAt: number, keep: number): void {
    this.sql.exec("DELETE FROM history WHERE sentAt < ?", beforeSentAt);
    this.sql.exec(
      "DELETE FROM history WHERE rowid NOT IN (SELECT rowid FROM history ORDER BY sentAt DESC LIMIT ?)",
      keep,
    );
  }
```

- [ ] **Step 3: 메모리 저장소 구현**

`reminder-proxy/src/__tests__/memoryStore.ts`: import에 `HistoryItem` 추가(`import type { HistoryItem, MetaKey, ReminderStore } from "../store";`), 필드 `history = new Map<string, HistoryItem>(); // \`${todoId}:${fireAt}\``를 `meta` 아래에 추가, `pruneSent` 아래에:

```ts
  addHistory(item: HistoryItem, fireAt: number) {
    const key = `${item.todoId}:${fireAt}`;
    if (!this.history.has(key)) this.history.set(key, item);
  }
  listHistory(sinceSentAt: number, limit: number) {
    return [...this.history.values()]
      .filter((h) => h.sentAt >= sinceSentAt)
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, limit);
  }
  pruneHistory(beforeSentAt: number, keep: number) {
    const kept = this.listHistory(beforeSentAt, keep);
    this.history = new Map(
      [...this.history].filter(([, h]) => kept.includes(h)),
    );
  }
```

- [ ] **Step 4: history.ts 실패 테스트 작성**

Create `reminder-proxy/src/__tests__/history.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { HISTORY_LIMIT, HISTORY_RETENTION_MS, markSeen, readHistory } from "../history";
import type { HistoryItem } from "../store";
import { MemoryReminderStore } from "./memoryStore";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");
const MIN = 60_000;
const item = (todoId: string, sentAt: number): HistoryItem => ({
  todoId,
  title: `할 일 ${todoId}`,
  offsetMinutes: 30,
  dueAt: new Date(sentAt + 30 * MIN).toISOString(),
  sentAt,
});

let store: MemoryReminderStore;
beforeEach(() => {
  store = new MemoryReminderStore();
});

describe("readHistory", () => {
  it("최신순으로 주고, 읽음 기록이 없으면 lastSeenAt은 0", () => {
    store.addHistory(item("a", NOW - 10 * MIN), 1);
    store.addHistory(item("b", NOW - 1 * MIN), 2);
    const res = readHistory(store, NOW);
    expect(res.items.map((i) => i.todoId)).toEqual(["b", "a"]);
    expect(res.lastSeenAt).toBe(0);
  });

  // Review Focus 4: 알림 기기가 없어 알람(정리)이 안 돈 동안 쌓인 오래된 기록
  it("서버 정리가 안 됐어도 7일 지난 기록은 보이지 않는다", () => {
    store.addHistory(item("old", NOW - HISTORY_RETENTION_MS - 1), 1);
    store.addHistory(item("edge", NOW - HISTORY_RETENTION_MS), 2);
    expect(readHistory(store, NOW).items.map((i) => i.todoId)).toEqual(["edge"]);
  });

  it(`최대 ${HISTORY_LIMIT}개까지만 준다`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) store.addHistory(item(`t${i}`, NOW - i * MIN), i);
    const res = readHistory(store, NOW);
    expect(res.items).toHaveLength(HISTORY_LIMIT);
    expect(res.items[0].todoId).toBe("t0");
  });
});

describe("markSeen", () => {
  it("보여준 최신 sentAt으로 읽음 위치를 올린다", () => {
    markSeen(store, NOW - 5 * MIN, NOW);
    expect(readHistory(store, NOW).lastSeenAt).toBe(NOW - 5 * MIN);
  });

  // Review Focus 3
  it("늦게 도착한 오래된 탭의 요청은 읽음 위치를 되돌리지 못한다", () => {
    markSeen(store, NOW - 1 * MIN, NOW);
    markSeen(store, NOW - 30 * MIN, NOW);
    expect(readHistory(store, NOW).lastSeenAt).toBe(NOW - 1 * MIN);
  });

  it("미래 값은 서버 현재 시각으로 자른다(앞으로 올 알림을 미리 읽음 처리하지 않음)", () => {
    markSeen(store, NOW + 60 * MIN, NOW);
    expect(readHistory(store, NOW).lastSeenAt).toBe(NOW);
  });
});
```

- [ ] **Step 5: 실패 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/history.test.ts`
Expected: FAIL — `Cannot find module '../history'` (또는 이와 동등한 import 에러)

- [ ] **Step 6: history.ts 구현**

Create `reminder-proxy/src/history.ts`:

```ts
import type { HistoryItem, ReminderStore } from "./store";

export const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60_000;
export const HISTORY_LIMIT = 50;

export interface HistoryResponse {
  items: HistoryItem[];
  lastSeenAt: number;
}

const lastSeenAt = (store: ReminderStore): number => Number(store.getMeta("lastSeenAt") ?? 0);

/**
 * 정리는 알람이 돌 때만 일어나는데, 알림 기기가 없으면 알람이 돌지 않는다.
 * 그래서 읽을 때도 같은 기준(7일·50개)으로 걸러 정리 여부와 무관하게 결과를 같게 한다.
 */
export const readHistory = (store: ReminderStore, now: number): HistoryResponse => ({
  items: store.listHistory(now - HISTORY_RETENTION_MS, HISTORY_LIMIT),
  lastSeenAt: lastSeenAt(store),
});

/**
 * seenUntil은 클라가 화면에 실제로 보여준 가장 최신 sentAt이다(서버 시각으로 찍으면
 * 조회 후 ~ seen 전송 전에 도착한 알림이 보지도 않고 읽음 처리된다).
 * max: 늦게 도착한 오래된 탭의 요청이 읽음 위치를 되돌리지 못하게.
 * min(now): 미래 값으로 앞으로 올 알림을 미리 읽음 처리하지 못하게.
 */
export const markSeen = (store: ReminderStore, seenUntil: number, now: number): void => {
  const prev = lastSeenAt(store);
  const next = Math.max(prev, Math.min(seenUntil, now));
  if (next !== prev) store.setMeta("lastSeenAt", String(next));
};
```

- [ ] **Step 7: 통과 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/history.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 8: alarmRunner 기록 실패 테스트 작성**

`reminder-proxy/src/__tests__/alarmRunner.test.ts`: import에 `import { HISTORY_RETENTION_MS } from "../history";` 추가. `describe("runAlarm", ...)` 블록 끝(마지막 `it` 뒤)에 추가:

```ts
  describe("발송 기록", () => {
    it("발송에 성공하면 발송 시점 제목으로 기록한다", async () => {
      await runAlarm(deps());
      now = NOW + 30 * MIN;
      await runAlarm(deps());
      db.set("t1", todo({ title: "바뀐 제목" })); // 발송 뒤 바뀌어도 기록은 그대로
      expect(store.listHistory(0, 50)).toEqual([
        { todoId: "t1", title: "보고서", offsetMinutes: 30, dueAt: iso(60 * MIN), sentAt: NOW + 30 * MIN },
      ]);
    });

    it("모든 기기 발송이 실패하면 기록하지 않는다", async () => {
      await runAlarm(deps());
      sendPush.mockRejectedValue(new TransientFcmError("down"));
      now = NOW + 30 * MIN;
      await runAlarm(deps());
      expect(store.listHistory(0, 50)).toEqual([]);
    });

    it("보내지 않기로 한 예약(완료됨)은 기록하지 않는다", async () => {
      await runAlarm(deps());
      db.set("t1", todo({ status: "done" }));
      now = NOW + 30 * MIN;
      await runAlarm(deps());
      expect(store.listHistory(0, 50)).toEqual([]);
    });

    // Review Focus 5
    it("재시도 끝에 성공해도 기록은 1건이다", async () => {
      await runAlarm(deps());
      sendPush.mockRejectedValueOnce(new TransientFcmError("down"));
      now = NOW + 30 * MIN;
      await runAlarm(deps());
      now += ALARM_RETRY_MS;
      await runAlarm(deps());
      await runAlarm(deps());
      expect(store.listHistory(0, 50)).toHaveLength(1);
      expect(store.listHistory(0, 50)[0].sentAt).toBe(NOW + 30 * MIN + ALARM_RETRY_MS);
    });

    it("알람이 돌 때 7일 지난 기록을 정리한다", async () => {
      store.addHistory(
        { todoId: "old", title: "옛 알림", offsetMinutes: 30, dueAt: iso(0), sentAt: NOW - HISTORY_RETENTION_MS - 1 },
        1,
      );
      await runAlarm(deps());
      expect(store.history.size).toBe(0);
    });
  });
```

`TransientFcmError` 생성자 인자가 다르면 같은 파일의 기존 "모든 기기가 일시 실패면" 테스트가 쓰는 방식 그대로 맞춘다.

- [ ] **Step 9: 실패 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/alarmRunner.test.ts`
Expected: "발송에 성공하면…", "재시도 끝에…", "7일 지난 기록을 정리" FAIL(기록 없음/정리 안 됨). 나머지 2개는 이미 PASS여도 정상.

- [ ] **Step 10: alarmRunner 구현**

`reminder-proxy/src/alarmRunner.ts`: import 추가 `import { HISTORY_LIMIT, HISTORY_RETENTION_MS } from "./history";`.

`runAlarm`의

```ts
          await deliver(deps, entry, current.title);
          store.markSent(entry.todoId, entry.fireAt, Date.parse(entry.dueAt));
```

를

```ts
          await deliver(deps, entry, current.title);
          store.markSent(entry.todoId, entry.fireAt, Date.parse(entry.dueAt));
          // 벨 메뉴 기록. deliver가 성공(한 기기 이상 수락)했을 때만 여기 온다.
          store.addHistory(
            {
              todoId: entry.todoId,
              title: current.title,
              offsetMinutes: entry.offsetMinutes,
              dueAt: entry.dueAt,
              sentAt: deps.now(),
            },
            entry.fireAt,
          );
```

로 바꾸고, `store.pruneSent(now - DAY);` 아래에:

```ts
  store.pruneHistory(now - HISTORY_RETENTION_MS, HISTORY_LIMIT);
```

- [ ] **Step 11: 전체 통과 + 타입 확인**

Run: `cd reminder-proxy && npx vitest run && npx tsc --noEmit`
Expected: 모든 테스트 PASS, tsc 에러 없음

- [ ] **Step 12: Commit**

```bash
git add reminder-proxy/src/store.ts reminder-proxy/src/history.ts reminder-proxy/src/alarmRunner.ts reminder-proxy/src/__tests__/memoryStore.ts reminder-proxy/src/__tests__/history.test.ts reminder-proxy/src/__tests__/alarmRunner.test.ts
git commit -m "feat(reminder-proxy): 발송 성공한 알림을 기록하고 7일·50개로 정리

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 기록 API (DO RPC + 라우터)

**Files:**
- Modify: `reminder-proxy/src/scheduler.ts`
- Modify: `reminder-proxy/src/router.ts`
- Modify: `reminder-proxy/src/__tests__/router.test.ts`

**Interfaces:**
- Consumes: `readHistory`, `markSeen`, `HistoryResponse` (Task 1, `./history`)
- Produces: `GET /reminders/history` → `200 HistoryResponse` JSON; `POST /reminders/history/seen` body `{ seenUntil: number }` → `204`, 숫자 아님/음수/비유한 → `400 { error: "INVALID_INPUT" }`. DO RPC `getHistory(uid: string): Promise<HistoryResponse>`, `markHistorySeen(uid: string, seenUntil: number): Promise<void>`

- [ ] **Step 1: 실패 테스트 작성**

`reminder-proxy/src/__tests__/router.test.ts`의 `stub`에 추가:

```ts
  getHistory: vi.fn(async () => ({
    items: [{ todoId: "t1", title: "보고서", offsetMinutes: 30, dueAt: "2026-10-01T01:00:00.000Z", sentAt: 1 }],
    lastSeenAt: 0,
  })),
  markHistorySeen: vi.fn(async () => {}),
```

`describe("handleRequest", ...)` 안에 추가:

```ts
  it("GET /reminders/history → uid의 기록을 JSON으로, CORS 포함", async () => {
    const res = await handleRequest(req("GET", "/reminders/history"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(stub.getHistory).toHaveBeenCalledWith("u1");
    expect(await res.json()).toEqual({
      items: [{ todoId: "t1", title: "보고서", offsetMinutes: 30, dueAt: "2026-10-01T01:00:00.000Z", sentAt: 1 }],
      lastSeenAt: 0,
    });
  });

  it("POST /reminders/history/seen → 204", async () => {
    const res = await handleRequest(req("POST", "/reminders/history/seen", { seenUntil: 123 }), env);
    expect(res.status).toBe(204);
    expect(stub.markHistorySeen).toHaveBeenCalledWith("u1", 123);
  });

  it.each([[{}], [{ seenUntil: "123" }], [{ seenUntil: -1 }], [{ seenUntil: null }], ["not json"]])(
    "잘못된 seen 본문 %j → 400",
    async (body) => {
      const res = await handleRequest(req("POST", "/reminders/history/seen", body), env);
      expect(res.status).toBe(400);
      expect(stub.markHistorySeen).not.toHaveBeenCalled();
    },
  );

  it("기록 조회도 토큰이 무효면 401", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    const res = await handleRequest(req("GET", "/reminders/history"), env);
    expect(res.status).toBe(401);
    expect(stub.getHistory).not.toHaveBeenCalled();
  });

  it("GET /reminders/refresh처럼 메서드가 맞지 않으면 404", async () => {
    const res = await handleRequest(req("GET", "/reminders/refresh"), env);
    expect(res.status).toBe(404);
  });
```

기존 "OPTIONS preflight" 테스트에 `Access-Control-Allow-Methods` 단언이 있으면 기대값에 `GET`이 포함되도록 바꾸고, 없으면 그 테스트 안에 추가:

```ts
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
```

주의: `req()`는 `body === undefined`면 본문을 붙이지 않는다. GET에 본문을 넘기지 말 것(Request 생성자가 던진다).

- [ ] **Step 2: 실패 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/router.test.ts`
Expected: 새 테스트들 FAIL(404 응답 / GET 미포함)

- [ ] **Step 3: DO RPC 구현**

`reminder-proxy/src/scheduler.ts`: import 추가 `import { markSeen, readHistory, type HistoryResponse } from "./history";`. `requestRefresh` 메서드 아래에:

```ts
  async getHistory(uid: string): Promise<HistoryResponse> {
    this.store.setMeta("uid", uid);
    return readHistory(this.store, Date.now());
  }

  async markHistorySeen(uid: string, seenUntil: number): Promise<void> {
    this.store.setMeta("uid", uid);
    markSeen(this.store, seenUntil, Date.now());
  }
```

- [ ] **Step 4: 라우터 구현**

`reminder-proxy/src/router.ts`:

1. `withCors`의 Methods를 `"GET, POST, DELETE, OPTIONS"`로.
2. `readToken` 아래에:

```ts
const readSeenUntil = async (request: Request): Promise<number | null> => {
  const body = (await request.json().catch(() => null)) as { seenUntil?: unknown } | null;
  const value = body?.seenUntil;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
};
```

3. `route`의 앞부분을 다음으로 바꾼다:

```ts
  const isTokens = path === "/push-tokens" && (request.method === "POST" || request.method === "DELETE");
  const isRefresh = path === "/reminders/refresh" && request.method === "POST";
  const isHistory = path === "/reminders/history" && request.method === "GET";
  const isSeen = path === "/reminders/history/seen" && request.method === "POST";
  if (!isTokens && !isRefresh && !isHistory && !isSeen) return new Response("Not Found", { status: 404 });

  const uid = await authenticate(request, env);
  if (!uid) return json({ error: "UNAUTHORIZED" }, 401);
  const scheduler = env.REMINDER_SCHEDULER.get(env.REMINDER_SCHEDULER.idFromName(uid));

  if (isHistory) return json(await scheduler.getHistory(uid), 200);
  if (isSeen) {
    const seenUntil = await readSeenUntil(request);
    if (seenUntil === null) return json({ error: "INVALID_INPUT" }, 400);
    await scheduler.markHistorySeen(uid, seenUntil);
    return new Response(null, { status: 204 });
  }
```

(이후 `if (isRefresh) { ... }` 부터는 기존 그대로)

- [ ] **Step 5: 통과 + 타입 확인**

Run: `cd reminder-proxy && npx vitest run && npx tsc --noEmit`
Expected: 모든 테스트 PASS, tsc 에러 없음

- [ ] **Step 6: Commit**

```bash
git add reminder-proxy/src/scheduler.ts reminder-proxy/src/router.ts reminder-proxy/src/__tests__/router.test.ts
git commit -m "feat(reminder-proxy): 알림 기록 조회·읽음 처리 API 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 클라이언트 API 함수

**Files:**
- Modify: `client/src/features/reminders/api/reminderProxyApi.ts`
- Test: `client/src/features/reminders/api/__tests__/reminderProxyApi.test.ts`

**Interfaces:**
- Produces: `export interface ReminderHistoryItem { todoId: string; title: string; offsetMinutes: ReminderOffsetMinutes; dueAt: string; sentAt: number }`, `export interface ReminderHistory { items: ReminderHistoryItem[]; lastSeenAt: number }`, `fetchReminderHistory(): Promise<ReminderHistory>`, `markReminderHistorySeen(seenUntil: number): Promise<void>`

- [ ] **Step 1: 실패 테스트 작성**

`reminderProxyApi.test.ts`의 `describe` 안에 추가:

```ts
  it("기록 조회는 GET /reminders/history, 본문 JSON을 돌려준다", async () => {
    const api = await load("https://r.example.com");
    const body = { items: [], lastSeenAt: 5 };
    authorizedFetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    expect(await api.fetchReminderHistory()).toEqual(body);
    expect(authorizedFetchMock).toHaveBeenCalledWith("https://r.example.com", "/reminders/history", { method: "GET" });
  });

  it("기록 조회가 실패 응답이면 throw", async () => {
    const api = await load("https://r.example.com");
    authorizedFetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(api.fetchReminderHistory()).rejects.toThrow("500");
  });

  it("읽음 처리는 POST /reminders/history/seen {seenUntil}", async () => {
    const api = await load("https://r.example.com");
    await api.markReminderHistorySeen(123);
    expect(authorizedFetchMock).toHaveBeenCalledWith("https://r.example.com", "/reminders/history/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seenUntil: 123 }),
    });
  });

  it("URL이 없으면 기록은 네트워크 없이 빈 결과", async () => {
    const api = await load("");
    expect(await api.fetchReminderHistory()).toEqual({ items: [], lastSeenAt: 0 });
    await api.markReminderHistorySeen(1);
    expect(authorizedFetchMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/reminders/api/__tests__/reminderProxyApi.test.ts`
Expected: FAIL — `api.fetchReminderHistory is not a function`

- [ ] **Step 3: 구현**

`reminderProxyApi.ts` 맨 위 import에 `import type { ReminderOffsetMinutes } from "@tododo/core/dist/reminders/index.js";` 추가. 파일 끝에:

```ts
/** reminder-proxy `GET /reminders/history` 응답. 서버의 HistoryResponse와 같은 모양이다. */
export interface ReminderHistoryItem {
  todoId: string;
  title: string;
  offsetMinutes: ReminderOffsetMinutes;
  dueAt: string;
  sentAt: number;
}

export interface ReminderHistory {
  items: ReminderHistoryItem[];
  lastSeenAt: number;
}

export const fetchReminderHistory = async (): Promise<ReminderHistory> => {
  if (!REMINDER_PROXY_URL) return { items: [], lastSeenAt: 0 };
  const res = await authorizedFetch(REMINDER_PROXY_URL, "/reminders/history", { method: "GET" });
  if (!res.ok) throw new Error(`reminder-proxy /reminders/history 실패: ${res.status}`);
  return (await res.json()) as ReminderHistory;
};

export const markReminderHistorySeen = (seenUntil: number): Promise<void> =>
  call("/reminders/history/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seenUntil }),
  });
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/features/reminders/api/__tests__/reminderProxyApi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/features/reminders/api/reminderProxyApi.ts client/src/features/reminders/api/__tests__/reminderProxyApi.test.ts
git commit -m "feat(reminders): 알림 기록 조회·읽음 처리 API 함수 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 기록 훅 + 포그라운드 알림 시 재조회

**Files:**
- Create: `client/src/features/reminders/hooks/useReminderHistory.ts`
- Create: `client/src/features/reminders/hooks/__tests__/useReminderHistory.test.tsx`
- Modify: `client/src/features/reminders/hooks/useForegroundReminders.ts`
- Modify: `client/src/features/reminders/hooks/__tests__/useForegroundReminders.test.tsx`
- Modify: `client/src/features/reminders/index.ts`

**Interfaces:**
- Consumes: `fetchReminderHistory`, `markReminderHistorySeen`, `ReminderHistory`, `ReminderHistoryItem` (Task 3)
- Produces:
  - `REMINDER_HISTORY_KEY = "reminderHistory"`, `HISTORY_REFETCH_DELAY_MS = 3_000`
  - `useReminderHistory(): { data: ReminderHistory | undefined; isPending: boolean; isError: boolean; unreadCount: number; refetch: () => void }`
  - `useMarkHistorySeen(): { mutate: (seenUntil: number) => void }` (UseMutationResult)
  - 배럴에서 `useReminderHistory`, `useMarkHistorySeen`, `type ReminderHistoryItem` export

- [ ] **Step 1: 훅 실패 테스트 작성**

Create `client/src/features/reminders/hooks/__tests__/useReminderHistory.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "user-1" } } }));
const { fetchMock, seenMock, captureMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  seenMock: vi.fn(),
  captureMock: vi.fn(),
}));
vi.mock("../../api/reminderProxyApi", () => ({
  fetchReminderHistory: fetchMock,
  markReminderHistorySeen: seenMock,
}));
vi.mock("@sentry/react", () => ({ captureException: captureMock }));

import { useMarkHistorySeen, useReminderHistory } from "../useReminderHistory";

const item = (todoId: string, sentAt: number) => ({
  todoId,
  title: todoId,
  offsetMinutes: 30 as const,
  dueAt: "2026-10-01T01:00:00.000Z",
  sentAt,
});

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => ({ history: useReminderHistory(), seen: useMarkHistorySeen() }), { wrapper });
};

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ items: [item("b", 300), item("a", 100)], lastSeenAt: 100 });
  seenMock.mockReset().mockResolvedValue(undefined);
  captureMock.mockReset();
});

describe("useReminderHistory", () => {
  it("lastSeenAt 이후 기록 수가 unreadCount", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.history.unreadCount).toBe(1));
  });

  it("읽음 처리는 요청 전에 배지를 0으로 만든다(낙관적)", async () => {
    let resolve!: () => void;
    seenMock.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const { result } = setup();
    await waitFor(() => expect(result.current.history.unreadCount).toBe(1));
    act(() => result.current.seen.mutate(300));
    await waitFor(() => expect(result.current.history.unreadCount).toBe(0));
    expect(seenMock).toHaveBeenCalledWith(300);
    resolve();
  });

  it("읽음 처리가 실패하면 배지를 되돌리고 Sentry로 보낸다", async () => {
    seenMock.mockRejectedValue(new Error("down"));
    const { result } = setup();
    await waitFor(() => expect(result.current.history.unreadCount).toBe(1));
    act(() => result.current.seen.mutate(300));
    await waitFor(() => expect(captureMock).toHaveBeenCalled());
    expect(result.current.history.unreadCount).toBe(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/reminders/hooks/__tests__/useReminderHistory.test.tsx`
Expected: FAIL — 모듈 `../useReminderHistory` 없음

- [ ] **Step 3: 훅 구현**

Create `client/src/features/reminders/hooks/useReminderHistory.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { auth } from "@/shared/lib/firebase";
import { fetchReminderHistory, markReminderHistorySeen, type ReminderHistory } from "../api/reminderProxyApi";

export const REMINDER_HISTORY_KEY = "reminderHistory";
const historyKey = (uid: string | undefined) => [REMINDER_HISTORY_KEY, uid] as const;

export const useReminderHistory = () => {
  const uid = auth.currentUser?.uid;
  const query = useQuery({
    queryKey: historyKey(uid),
    queryFn: fetchReminderHistory,
    enabled: !!uid,
    // 전역 staleTime(1분)을 따르면 탭 포커스 재조회가 건너뛰어진다. 백그라운드에서 OS 알림을
    // 받고 돌아왔을 때 배지가 바로 떠야 하므로 이 쿼리는 항상 stale로 둔다.
    staleTime: 0,
  });
  const { data } = query;
  const unreadCount = data ? data.items.filter((i) => i.sentAt > data.lastSeenAt).length : 0;
  return { data, isPending: query.isPending, isError: query.isError, refetch: query.refetch, unreadCount };
};

export const useMarkHistorySeen = () => {
  const queryClient = useQueryClient();
  const key = historyKey(auth.currentUser?.uid);
  return useMutation({
    mutationFn: (seenUntil: number) => markReminderHistorySeen(seenUntil),
    // 벨을 여는 즉시 배지가 사라져야 하므로 서버 응답을 기다리지 않고 캐시를 먼저 올린다.
    onMutate: async (seenUntil) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ReminderHistory>(key);
      if (prev) queryClient.setQueryData<ReminderHistory>(key, { ...prev, lastSeenAt: Math.max(prev.lastSeenAt, seenUntil) });
      return { prev };
    },
    // 다음에 열 때 다시 시도되는 사소한 실패라 사용자 토스트는 띄우지 않는다.
    onError: (error, _seenUntil, context) => {
      if (context?.prev) queryClient.setQueryData(key, context.prev);
      Sentry.captureException(error);
    },
  });
};
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/features/reminders/hooks/__tests__/useReminderHistory.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 포그라운드 무효화 실패 테스트 작성**

`useForegroundReminders.test.tsx`를 수정한다:

1. import에 추가: `import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; import type { ReactNode } from "react";`, 그리고 vitest import에 `beforeEach` 추가.
2. 상단(훅 import 위)에 wrapper 헬퍼:

```tsx
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
beforeEach(() => {
  queryClient = new QueryClient();
});
```

3. 파일 안의 모든 `renderHook(() => useForegroundReminders())`를 `renderHook(() => useForegroundReminders(), { wrapper })`로 바꾼다.
4. `afterEach`에 `vi.useRealTimers();` 추가.
5. `describe` 안에 새 테스트:

```tsx
  // Review Focus 1: 서버는 모든 기기로 보낸 뒤에 기록하므로 즉시 재조회하면 아직 없다.
  it("포그라운드 알림을 받으면 잠시 뒤 알림 기록을 다시 불러온다", async () => {
    vi.useFakeTimers();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    let handler: ((m: { title: string; body: string }) => void) | null = null;
    subscribeMock.mockImplementation(async (h: (m: { title: string; body: string }) => void) => {
      handler = h;
      return vi.fn();
    });
    renderHook(() => useForegroundReminders(), { wrapper });
    await act(async () => {
      await vi.runAllTicks();
    });
    act(() => handler!({ title: "보고서", body: "30분 후 마감이에요" }));
    expect(invalidate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(HISTORY_REFETCH_DELAY_MS));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [REMINDER_HISTORY_KEY] });
  });
```

import 추가: `import { HISTORY_REFETCH_DELAY_MS } from "../useForegroundReminders"; import { REMINDER_HISTORY_KEY } from "../useReminderHistory";` (기존 `useForegroundReminders` import 줄에 합친다). `vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "user-1" } } }));`를 상단 mock들 옆에 추가(useReminderHistory가 firebase를 import하므로 CI 빈 키에서 초기화되지 않게).

`vi.runAllTicks` 뒤에도 `handler`가 null이면 `await act(async () => { await Promise.resolve(); })`를 한 번 더 두어 `subscribeForegroundMessages`의 then이 실행되게 한다.

- [ ] **Step 6: 실패 확인**

Run: `cd client && npx vitest run src/features/reminders/hooks/__tests__/useForegroundReminders.test.tsx`
Expected: FAIL — `HISTORY_REFETCH_DELAY_MS` undefined / invalidate 미호출

- [ ] **Step 7: 구현**

`useForegroundReminders.ts`:

```ts
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared/ui/toast/useToast";
import { subscribeForegroundMessages } from "../push/pushClient";
import { getPushPermission, onPushPermissionChanged } from "../push/pushSupport";
import { REMINDER_HISTORY_KEY } from "./useReminderHistory";

/**
 * 서버는 모든 기기로 보낸 "뒤에" 기록을 남긴다. 첫 기기가 메시지를 받자마자 재조회하면
 * 아직 기록이 없을 수 있어 잠시 기다린다(벨을 열면 어차피 다시 조회한다).
 */
export const HISTORY_REFETCH_DELAY_MS = 3_000;
```

훅 본문에서 `const toast = useToast();` 아래에 `const queryClient = useQueryClient();`를 추가하고, 구독 effect를 다음으로 바꾼다:

```ts
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    subscribeForegroundMessages(({ title, body }) => {
      toast.info(title, body);
      const timer = setTimeout(() => {
        timers.delete(timer);
        void queryClient.invalidateQueries({ queryKey: [REMINDER_HISTORY_KEY] });
      }, HISTORY_REFETCH_DELAY_MS);
      timers.add(timer);
    })
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      })
      .catch((error) => Sentry.captureException(error));
    return () => {
      cancelled = true;
      unsubscribe?.();
      timers.forEach(clearTimeout);
    };
    // toast·queryClient 객체 정체성에 따라 재구독하지 않는다(권한이 바뀔 때만 재구독).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission]);
```

`client/src/features/reminders/index.ts`에 추가:

```ts
export { useReminderHistory, useMarkHistorySeen } from "./hooks/useReminderHistory";
export type { ReminderHistoryItem } from "./api/reminderProxyApi";
```

- [ ] **Step 8: 통과 확인 (CI 등가 포함)**

Run: `cd client && npx vitest run src/features/reminders && VITE_FIREBASE_API_KEY= npx vitest run src/features/reminders`
Expected: 두 실행 모두 PASS

- [ ] **Step 9: Commit**

```bash
git add client/src/features/reminders
git commit -m "feat(reminders): 알림 기록 훅과 포그라운드 알림 시 기록 재조회

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 기록 목록 컴포넌트

**Files:**
- Create: `client/src/features/reminders/utils/timeAgo.ts`
- Create: `client/src/features/reminders/utils/__tests__/timeAgo.test.ts`
- Create: `client/src/layouts/notificationMenu/notificationHistoryList.tsx`
- Create: `client/src/layouts/notificationMenu/notificationHistoryList.styles.tsx`
- Create: `client/src/layouts/notificationMenu/__tests__/notificationHistoryList.test.tsx`
- Modify: `client/src/features/reminders/index.ts`

**Interfaces:**
- Consumes: `ReminderHistoryItem` (배럴), `reminderBody` (`@tododo/core/dist/reminders/index.js`)
- Produces:
  - `formatTimeAgo(sentAt: number, now: number): string` (배럴 export)
  - `NotificationHistoryList` default export, props `{ items: ReminderHistoryItem[] | undefined; isPending: boolean; isError: boolean; unreadAfter: number; now: number; onSelect: (todoId: string) => void }`

- [ ] **Step 1: timeAgo 실패 테스트**

Create `client/src/features/reminders/utils/__tests__/timeAgo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatTimeAgo } from "../timeAgo";

const NOW = 1_000_000_000_000;
const MIN = 60_000;

describe("formatTimeAgo", () => {
  it.each([
    [30 * 1000, "방금"],
    [-5 * 1000, "방금"], // 기기 시계가 서버보다 늦은 경우
    [MIN, "1분 전"],
    [59 * MIN, "59분 전"],
    [60 * MIN, "1시간 전"],
    [23 * 60 * MIN, "23시간 전"],
    [24 * 60 * MIN, "1일 전"],
    [7 * 24 * 60 * MIN, "7일 전"],
  ])("%d ms 전 → %s", (ago, text) => {
    expect(formatTimeAgo(NOW - ago, NOW)).toBe(text);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/reminders/utils/__tests__/timeAgo.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: timeAgo 구현**

Create `client/src/features/reminders/utils/timeAgo.ts`:

```ts
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 알림 기록용 상대 시각. 기록은 최대 7일이라 주·월 단위는 필요 없다. */
export const formatTimeAgo = (sentAt: number, now: number): string => {
  const ago = now - sentAt;
  if (ago < MINUTE) return "방금";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}분 전`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}시간 전`;
  return `${Math.floor(ago / DAY)}일 전`;
};
```

배럴 `index.ts`에 `export { formatTimeAgo } from "./utils/timeAgo";` 추가.

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/features/reminders/utils/__tests__/timeAgo.test.ts`
Expected: PASS

- [ ] **Step 5: 목록 실패 테스트**

Create `client/src/layouts/notificationMenu/__tests__/notificationHistoryList.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setupUser } from "@/test/setupUser";
import NotificationHistoryList from "../notificationHistoryList";

const NOW = 1_000_000_000_000;
const MIN = 60_000;
const items = [
  { todoId: "t2", title: "기획서 제출", offsetMinutes: 30 as const, dueAt: "x", sentAt: NOW - 12 * MIN },
  { todoId: "t1", title: "운동", offsetMinutes: 1440 as const, dueAt: "x", sentAt: NOW - 3 * 24 * 60 * MIN },
];

const renderList = (props: Partial<Parameters<typeof NotificationHistoryList>[0]> = {}) => {
  const onSelect = vi.fn();
  render(
    <NotificationHistoryList
      items={items}
      isPending={false}
      isError={false}
      unreadAfter={NOW - 60 * MIN}
      now={NOW}
      onSelect={onSelect}
      {...props}
    />,
  );
  return onSelect;
};

describe("NotificationHistoryList", () => {
  it("제목, OS 알림과 같은 문구, 상대 시각을 최신순으로 보여준다", () => {
    renderList();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("기획서 제출");
    expect(buttons[0]).toHaveTextContent("30분 후 마감이에요 · 12분 전");
    expect(buttons[1]).toHaveTextContent("내일 이 시간에 마감이에요 · 3일 전");
  });

  it("unreadAfter 이후 항목만 읽지 않음으로 표시한다", () => {
    renderList();
    const [newer, older] = screen.getAllByRole("button");
    expect(newer).toHaveAccessibleName(/읽지 않음/);
    expect(older).not.toHaveAccessibleName(/읽지 않음/);
  });

  it("항목을 누르면 그 할 일 id로 onSelect", async () => {
    const user = setupUser();
    const onSelect = renderList();
    await user.click(screen.getByRole("button", { name: /운동/ }));
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("비어 있으면 빈 상태 문구", () => {
    renderList({ items: [] });
    expect(screen.getByText("최근 7일간 받은 알림이 없어요")).toBeInTheDocument();
  });

  it("실패하면 실패 문구", () => {
    renderList({ items: undefined, isError: true });
    expect(screen.getByText("알림 기록을 불러오지 못했어요")).toBeInTheDocument();
  });

  it("불러오는 중엔 빈 상태 문구를 보여주지 않는다", () => {
    renderList({ items: undefined, isPending: true });
    expect(screen.queryByText("최근 7일간 받은 알림이 없어요")).not.toBeInTheDocument();
    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `cd client && npx vitest run src/layouts/notificationMenu/__tests__/notificationHistoryList.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 7: 스타일 작성**

Create `client/src/layouts/notificationMenu/notificationHistoryList.styles.tsx`:

```tsx
import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

export const Heading = styled.h2`
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

export const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const ItemButton = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: 8px 1fr;
  column-gap: 8px;
  align-items: start;
  padding: 8px 6px;
  border: none;
  border-radius: ${radius.sm};
  background: none;
  text-align: left;
  cursor: pointer;

  &:hover {
    background-color: ${colors.background.secondary};
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: -2px;
  }
`;

export const UnreadDot = styled.span<{ $visible: boolean }>`
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background-color: ${({ $visible }) => ($visible ? colors.brand.strong : "transparent")};
`;

export const Title = styled.span`
  display: block;
  font-size: 14px;
  color: ${colors.text.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Meta = styled.span`
  display: block;
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

export const Message = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.text.secondary};
`;

export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;
```

- [ ] **Step 8: 컴포넌트 구현**

Create `client/src/layouts/notificationMenu/notificationHistoryList.tsx`:

```tsx
import { reminderBody } from "@tododo/core/dist/reminders/index.js";
import { formatTimeAgo, type ReminderHistoryItem } from "@/features/reminders";
import {
  Heading,
  List,
  ItemButton,
  UnreadDot,
  Title,
  Meta,
  Message,
  VisuallyHidden,
} from "./notificationHistoryList.styles";

interface Props {
  items: ReminderHistoryItem[] | undefined;
  isPending: boolean;
  isError: boolean;
  /** 이 시각보다 늦게 온 항목이 "읽지 않음". 패널을 연 순간의 lastSeenAt이다. */
  unreadAfter: number;
  now: number;
  onSelect: (todoId: string) => void;
}

const Body = ({ items, isPending, isError, unreadAfter, now, onSelect }: Props) => {
  if (isError) return <Message>알림 기록을 불러오지 못했어요</Message>;
  if (isPending || !items) return <Message>불러오는 중…</Message>;
  if (items.length === 0) return <Message>최근 7일간 받은 알림이 없어요</Message>;
  return (
    <List>
      {items.map((item) => {
        const unread = item.sentAt > unreadAfter;
        return (
          <li key={`${item.todoId}:${item.sentAt}`}>
            <ItemButton type="button" onClick={() => onSelect(item.todoId)}>
              <UnreadDot $visible={unread} aria-hidden="true" />
              <span>
                {unread && <VisuallyHidden>읽지 않음, </VisuallyHidden>}
                <Title>{item.title}</Title>
                <Meta>
                  {reminderBody(item.offsetMinutes)} · {formatTimeAgo(item.sentAt, now)}
                </Meta>
              </span>
            </ItemButton>
          </li>
        );
      })}
    </List>
  );
};

const NotificationHistoryList = (props: Props) => (
  <>
    <Heading>알림</Heading>
    <Body {...props} />
  </>
);

export default NotificationHistoryList;
```

- [ ] **Step 9: 통과 확인**

Run: `cd client && npx vitest run src/layouts/notificationMenu/__tests__/notificationHistoryList.test.tsx src/features/reminders/utils`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add client/src/features/reminders/utils/timeAgo.ts client/src/features/reminders/utils/__tests__/timeAgo.test.ts client/src/features/reminders/index.ts client/src/layouts/notificationMenu/notificationHistoryList.tsx client/src/layouts/notificationMenu/notificationHistoryList.styles.tsx client/src/layouts/notificationMenu/__tests__/notificationHistoryList.test.tsx
git commit -m "feat(reminders): 벨 메뉴 알림 기록 목록 컴포넌트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 벨 메뉴 통합 (배지·읽음·이동)

**Files:**
- Modify: `client/src/layouts/notificationMenu/notificationMenu.tsx`
- Modify: `client/src/layouts/notificationMenu/notificationMenu.styles.tsx`
- Modify: `client/src/layouts/notificationMenu/__tests__/notificationMenu.test.tsx`

**Interfaces:**
- Consumes: `useReminderHistory`, `useMarkHistorySeen` (Task 4, 배럴), `NotificationHistoryList` (Task 5)

**동작 규칙:**
- 패널을 여는 순간 `openedLastSeenAt = data?.lastSeenAt ?? 0`을 상태로 고정하고 `refetch()`(Review Focus 1).
- 열려 있는 동안 `newest = data.items[0]?.sentAt`이 `data.lastSeenAt`보다 크면 `seen.mutate(newest)` — 열린 채 새 알림이 와도 따라 올라간다(Review Focus 2).
- ●는 `openedLastSeenAt` 기준(열려 있는 동안 유지), 배지는 `unreadCount`(낙관적 업데이트로 즉시 0).
- 항목 클릭 → `navigate(\`/todo/${encodeURIComponent(todoId)}\`)` + 패널 닫기(포커스 복원 안 함 — 페이지가 바뀌므로).

- [ ] **Step 1: 기존 테스트 이름 갱신 + 새 실패 테스트**

`notificationMenu.test.tsx`:

1. 모든 `{ name: "알림 설정" }`을 `{ name: "알림" }`으로 바꾼다(트리거와 dialog 둘 다). 트리거는 안 읽음이 0일 때 이름이 정확히 `"알림"`이다.
2. import에 `import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";` 추가.
3. `s`에 상태 추가:

```ts
  history: { items: [] as unknown[], lastSeenAt: 0 } as { items: { todoId: string; title: string; offsetMinutes: 30; dueAt: string; sentAt: number }[]; lastSeenAt: number } | undefined,
  refetch: vi.fn(),
  markSeen: vi.fn(),
```

4. `vi.mock("@/features/reminders", ...)`의 반환 객체에 추가:

```ts
  useReminderHistory: () => ({
    data: s.history,
    isPending: false,
    isError: false,
    refetch: s.refetch,
    unreadCount: s.history ? s.history.items.filter((i) => i.sentAt > s.history!.lastSeenAt).length : 0,
  }),
  useMarkHistorySeen: () => ({ mutate: s.markSeen }),
```

5. `renderMenu`를 라우터로 감싼다. 리렌더 테스트가 **같은 트리**를 다시 넘겨야 `NotificationMenu`가 리마운트되지 않으므로 트리를 헬퍼로 뺀다:

```tsx
const LocationProbe = () => <div data-testid="location">{useLocation().pathname}</div>;
const menuTree = () => (
  <MemoryRouter initialEntries={["/today"]}>
    <ToastProvider>
      <NotificationMenu />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </ToastProvider>
  </MemoryRouter>
);
const renderMenu = () => render(menuTree());
```

6. `beforeEach`에 리셋 추가: `s.history = { items: [], lastSeenAt: 0 }; s.refetch.mockReset(); s.markSeen.mockReset();`
7. 새 테스트:

```tsx
const h = (todoId: string, sentAt: number) => ({
  todoId,
  title: `할 일 ${todoId}`,
  offsetMinutes: 30 as const,
  dueAt: "2026-10-01T01:00:00.000Z",
  sentAt,
});

describe("NotificationMenu 알림 기록", () => {
  it("안 읽은 개수를 배지와 트리거 이름으로 알린다", () => {
    s.history = { items: [h("b", 300), h("a", 200), h("z", 50)], lastSeenAt: 100 };
    renderMenu();
    expect(screen.getByRole("button", { name: "알림, 읽지 않은 알림 2개" })).toHaveTextContent("2");
  });

  it("9개를 넘으면 9+", () => {
    s.history = { items: Array.from({ length: 12 }, (_, i) => h(`t${i}`, 1000 - i)), lastSeenAt: 0 };
    renderMenu();
    expect(screen.getByRole("button", { name: "알림, 읽지 않은 알림 12개" })).toHaveTextContent("9+");
  });

  it("열면 다시 불러오고, 보여준 최신 sentAt까지 읽음 처리한다", async () => {
    s.history = { items: [h("b", 300), h("a", 200)], lastSeenAt: 100 };
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    expect(s.refetch).toHaveBeenCalled();
    expect(s.markSeen).toHaveBeenCalledWith(300);
  });

  it("이미 다 읽었으면 읽음 요청을 보내지 않는다", async () => {
    s.history = { items: [h("a", 100)], lastSeenAt: 100 };
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림" }));
    expect(s.markSeen).not.toHaveBeenCalled();
  });

  it("열려 있는 동안엔 읽음 처리 후에도 ●를 유지한다", async () => {
    s.history = { items: [h("b", 300)], lastSeenAt: 100 };
    const user = setupUser();
    const view = renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    s.history = { items: [h("b", 300)], lastSeenAt: 300 }; // 낙관적 업데이트 반영
    view.rerender(menuTree());
    expect(screen.getByRole("button", { name: /할 일 b/ })).toHaveAccessibleName(/읽지 않음/);
  });

  // Review Focus 2
  it("열린 채 새 알림이 오면 그것도 ●로 보이고 읽음 위치가 따라 올라간다", async () => {
    s.history = { items: [h("a", 200)], lastSeenAt: 100 };
    const user = setupUser();
    const view = renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    s.history = { items: [h("b", 400), h("a", 200)], lastSeenAt: 200 };
    view.rerender(menuTree());
    expect(screen.getByRole("button", { name: /할 일 b/ })).toHaveAccessibleName(/읽지 않음/);
    expect(s.markSeen).toHaveBeenLastCalledWith(400);
  });

  it("항목을 누르면 할 일 상세로 이동하고 패널을 닫는다", async () => {
    s.history = { items: [h("t 1", 300)], lastSeenAt: 0 };
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    await user.click(screen.getByRole("button", { name: /할 일 t 1/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/todo/t%201");
    expect(screen.queryByRole("dialog", { name: "알림" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/layouts/notificationMenu/__tests__/notificationMenu.test.tsx`
Expected: FAIL — 트리거 이름이 "알림 설정", 배지 없음 등

- [ ] **Step 3: 스타일 추가**

`notificationMenu.styles.tsx` 끝에:

```tsx
export const TriggerSlot = styled.span`
  position: relative;
  display: inline-flex;
`;

export const Badge = styled.span`
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background-color: ${colors.danger.main};
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
`;

export const Divider = styled.hr`
  margin: 2px 0;
  border: none;
  border-top: 1px solid ${colors.border.secondary};
`;
```

`Panel`의 `width: 260px;` 아래에 `max-width: calc(100vw - 32px);`를 추가한다(모바일 헤더에서 화면 밖으로 넘치지 않게).

`#fff` 대비가 `colors.danger.main` 위에서 AA(4.5:1, 10px 굵은 글씨는 일반 텍스트 기준)를 만족하는지 라이트·다크 둘 다 `client/src/styles` 토큰 값으로 확인하고, 미달이면 `colors.brand.strong` + `colors.brand.onStrong` 조합으로 바꾼다.

- [ ] **Step 4: 컴포넌트 구현**

`notificationMenu.tsx`:

1. import 수정:

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
```

배럴 import 목록에 `useReminderHistory, useMarkHistorySeen,` 추가. 스타일 import에 `TriggerSlot, Badge, Divider,` 추가. `import NotificationHistoryList from "./notificationHistoryList";` 추가.

2. 컴포넌트 상단 훅들 아래에:

```tsx
  const navigate = useNavigate();
  const history = useReminderHistory();
  const markSeen = useMarkHistorySeen();
  // ●는 "열 때" 기준으로 고정한다. 읽음 처리로 lastSeenAt이 바로 올라가도 열려 있는 동안
  // 무엇이 새 알림이었는지 보이게 하려는 것이다(배지는 즉시 0).
  const [openedLastSeenAt, setOpenedLastSeenAt] = useState(0);
  const newestSentAt = history.data?.items[0]?.sentAt ?? 0;
  const lastSeenAt = history.data?.lastSeenAt ?? 0;
```

3. 열기 처리 — 트리거 `onClick`을 다음 핸들러로 바꾼다:

```tsx
  const toggle = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setOpenedLastSeenAt(lastSeenAt);
    // 포그라운드 재조회는 지연되고 백그라운드 탭은 포커스 전엔 갱신이 없으니, 열 때 한 번 더 확인한다.
    void history.refetch();
    setIsOpen(true);
  };
```

4. 읽음 effect(기존 `useEffect` 아래):

```tsx
  // 화면에 보여준 가장 최신 항목까지 읽음 처리한다. 열린 채 새 알림이 와도 따라 올라간다.
  useEffect(() => {
    if (isOpen && newestSentAt > lastSeenAt) markSeen.mutate(newestSentAt);
    // markSeen 객체 정체성은 렌더마다 바뀌므로 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, newestSentAt, lastSeenAt]);
```

5. 항목 선택:

```tsx
  const openTodo = (todoId: string) => {
    setIsOpen(false);
    navigate(`/todo/${encodeURIComponent(todoId)}`);
  };
```

6. 렌더 부분 교체:

```tsx
  const unread = history.unreadCount;
  const triggerLabel = unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : "알림";

  return (
    <Wrapper ref={wrapperRef} onKeyDown={onWrapperKeyDown}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={toggle}
      >
        <TriggerSlot>
          <Icon size={18} aria-hidden="true" />
          {unread > 0 && <Badge aria-hidden="true">{unread > 9 ? "9+" : unread}</Badge>}
        </TriggerSlot>
      </Trigger>
      {isOpen && (
        <Panel role="dialog" aria-label="알림">
          <NotificationHistoryList
            items={history.data?.items}
            isPending={history.isPending}
            isError={history.isError}
            unreadAfter={openedLastSeenAt}
            now={Date.now()}
            onSelect={openTodo}
          />
          <Divider />
          <StatusText>{STATUS_TEXT[permission]}</StatusText>
          {/* 이하 기존 EnableButton / FieldLabel / DefaultSelect 블록 그대로 */}
        </Panel>
      )}
    </Wrapper>
  );
```

`aria-label`이 있으면 버튼의 접근 가능한 이름은 그 값이므로, 배지 숫자("2")는 `toHaveTextContent`로만 보이고 이름에는 섞이지 않는다.

- [ ] **Step 5: 통과 확인 (CI 등가 포함)**

Run: `cd client && npx vitest run src/layouts && VITE_FIREBASE_API_KEY= npx vitest run src/layouts`
Expected: 두 실행 모두 PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/layouts/notificationMenu
git commit -m "feat(reminders): 벨 메뉴에 알림 기록·안 읽음 배지 표시

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 전체 검증 + 로컬 실사용 확인

**Files:** 없음(검증만). 문제를 발견하면 해당 Task의 파일을 고치고 그 Task 형식으로 테스트를 추가한다.

- [ ] **Step 1: 정적 검사·전체 테스트**

Run:
```bash
cd reminder-proxy && npx vitest run && npx tsc --noEmit
cd ../client && npm run lint && npx tsc -b && npx vitest run && VITE_FIREBASE_API_KEY= npx vitest run
```
Expected: 모두 성공. 실패하면 출력 그대로 기록하고 원인 수정.

- [ ] **Step 2: SQLite 구현 실측 (단위 테스트가 MemoryStore만 쓰므로)**

`reference_ai_proxy_local_testing`/마감 알림 로컬 검증과 같은 방식: `cd reminder-proxy && npx wrangler dev`(사용자 터미널에서 실행 요청 — 장시간 프로세스), 클라이언트는 `VITE_REMINDER_PROXY_URL=http://localhost:8787 npm run dev`.
확인 항목:
1. 마감 10분 뒤 할 일을 "정각" 알림으로 만들고 발송될 때까지 대기 → 토스트 후 약 3초 내 벨 배지 1
2. 벨 열기 → 항목 ● 표시, 배지 0, 같은 계정 다른 탭을 포커스하면 배지 0
3. 항목 클릭 → `/todo/:id` 상세 열림
4. 닫았다 다시 열기 → ● 사라짐
5. `curl -H "Authorization: Bearer <idToken>" http://localhost:8787/reminders/history` 응답에 `title`이 스냅샷 값으로 들어 있음

- [ ] **Step 3: 모바일 폭 확인**

브라우저 폭 360px에서 벨 패널이 화면 안에 들어오고 목록이 스크롤되는지 확인.

- [ ] **Step 4: 결과 보고**

통과/실패를 그대로 보고한다. 실기 확인 중 사용자 터미널이 필요한 단계는 사용자에게 `!` 프리픽스 실행을 안내한다.
