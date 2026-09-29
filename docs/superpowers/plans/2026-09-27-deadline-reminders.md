# 마감 알림(웹 푸시) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 탭을 닫아 둬도 마감 전에 웹 푸시 알림을 보낸다(무료 기능, 사용자 기본값 + 할 일별 재지정).

**Architecture:** 새 Cloudflare Worker `reminder-proxy`의 `ReminderScheduler` Durable Object(uid당 1개, SQLite)가 알람으로 발송 시각을 예약한다. 클라이언트는 todos 캐시의 "알림 지문"이 바뀌면 `/reminders/refresh` 신호만 보내고, DO가 서비스 계정으로 Firestore를 다시 읽어 예약표를 재계산한다. 발송 직전에 할 일을 한 번 더 읽어 완료·삭제·마감 변경을 걸러낸 뒤 FCM HTTP v1로 보낸다.

**Tech Stack:** Cloudflare Workers + Durable Objects(SQLite, wrangler 3.x), Firestore REST v1, FCM HTTP v1, WebCrypto RS256, React 19 + TanStack Query + styled-components, `firebase/messaging` 12.10.0(동적 import), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-deadline-reminders-design.md`

## Global Constraints

- 선택지: 알림 없음(`"off"`) / 정각(0) / 10분 / 30분 / 1시간(60) / 하루 전(1440). 처음 기본값 30분.
- `Todo.reminderOffsetMinutes?: number | "off" | null` — 없음과 `null`은 "사용자 기본값"이다.
- **사용자 기본값이 `"off"`면 할 일별 재지정과 무관하게 알림을 보내지 않는다**(대화에서 확정: "설정에서 고르면 알림 전체가 꺼진다").
- `userSettings/{uid}` 문서: `{ reminderDefaultOffsetMinutes: number | "off" }`. 없으면 30분.
- 이미 지난 알림 시각은 건너뛴다(즉시 발송 안 함). 마감 5분 넘게 지난 뒤 울린 알람은 버린다.
- 창: 재계산 시 `dueAt ∈ [now, now + 8일]` 조회, 예약은 `fireAt ≤ now + 7일`만. 알람은 `min(다음 fireAt, windowEnd)`.
- refresh 디바운스: 클라이언트 2초, DO 5초.
- `@tododo/core`는 **루트가 아닌 서브패스**로 import한다: `@tododo/core/dist/reminders/index.js`. 루트 import는 Firestore SDK를 번들에 끌어들인다.
- `firebase/messaging`은 동적 `import()`로만 불러온다(첫 화면 번들 금지, CI Bundle budget이 잡는다).
- 색은 `colors.*` 토큰만 쓴다. hex 하드코딩은 `noHardcodedColorRule` 테스트가 막는다.
- Worker 인증은 `@tododo/worker-auth`의 `verifyFirebaseIdToken`. 프리미엄 게이트 없음.
- wrangler는 3.x 유지(메이저 업그레이드 금지).
- 커밋 훅(lint-staged, 테스트)을 `--no-verify`로 우회하지 않는다.
- client 테스트는 CI 등가로 `VITE_FIREBASE_API_KEY= npx vitest run`도 통과해야 한다.
- 모든 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **기본값 "알림 없음" + 할 일별 30분** → 알림이 하나도 오지 않아야 한다(설정이 전체를 끈다). → Task 1 `resolveReminderOffset` 테스트.
2. **마감 20분 전에 만든 할 일(기본 30분)** → 알림 시각이 이미 지났으므로 아무것도 오지 않아야 한다("30분 후 마감" 즉시 발송 금지). → Task 2 `computeSchedule` 테스트.
3. **이 탭이 닫혀 있는 동안 다른 기기에서 마감을 옮기거나 완료** → 옛 예약이 울려도 발송 직전 재조회로 막혀야 한다. → Task 6 `runAlarm` 테스트(`dueAt` 변경·완료).
4. **기기 두 대 중 하나는 무효 토큰, 하나는 FCM 5xx** → 무효 토큰만 지워지고, 성공한 기기가 없으면 재시도되며, 한 기기라도 성공했으면 재시도로 중복 발송되지 않아야 한다. → Task 6 테스트.
5. **같은 브라우저에서 로그아웃 후 다른 계정 로그인** → 이전 계정의 알림이 이 브라우저로 오지 않아야 한다(로그아웃 시 토큰 해제). → Task 13 `AuthProvider` 테스트.

---

## File Structure

```
packages/core/src/reminders/index.ts          오프셋 상수·설정 판정·fireAt·문구 (웹·Worker·모바일 공용)
packages/core/src/reminders/__tests__/reminders.test.ts
packages/core/src/types/todo.ts               reminderOffsetMinutes 필드 추가
packages/core/src/index.ts                    reminders 재수출(모바일용)

reminder-proxy/                               새 Worker "tododo-reminder-proxy"
  package.json, tsconfig.json, wrangler.toml, README.md
  src/env.ts                                  Env 타입
  src/schedule.ts                             computeSchedule, shouldSend (순수)
  src/googleAuth.ts                           서비스 계정 JWT → 액세스 토큰(캐시)
  src/firestore.ts                            Firestore REST 조회 + 값 디코딩
  src/fcm.ts                                  FCM v1 발송 + 에러 분류
  src/store.ts                                ReminderStore 인터페이스 + SQLite 구현
  src/alarmRunner.ts                          알람 1회 처리(재계산→발송→다음 알람)
  src/scheduler.ts                            ReminderScheduler DO (얇은 어댑터)
  src/router.ts                               라우팅·인증·입력검증·CORS
  src/index.ts                                엔트리(router + DO export)
  src/__tests__/*.test.ts, memoryStore.ts

client/public/firebase-messaging-sw.js        백그라운드 푸시 표시·클릭 이동
client/src/features/reminders/
  index.ts                                    배럴
  api/reminderProxyApi.ts                     Worker 호출 3종
  api/reminderSettingsApi.ts                  userSettings 읽기/쓰기
  hooks/useReminderSettings.ts                useReminderDefault, useSetReminderDefault
  hooks/useReminderRefresh.ts                 지문 → 디바운스 refresh
  hooks/usePushTokenSync.ts                   진입 시 토큰 재등록
  hooks/useForegroundReminders.ts             탭 포커스 중 수신 → 토스트
  push/pushSupport.ts                         지원 판별·권한 조회
  push/pushClient.ts                          권한 요청·토큰 등록/해제·onMessage
  utils/reminderChoice.ts                     select 값 ↔ 설정 변환, 옵션 목록
  components/reminderPrompt/reminderPrompt.tsx  첫 마감 저장 후 안내창(Provider)
client/src/layouts/notificationMenu/          헤더 벨 메뉴
firestore.rules, firestore.indexes.json       userSettings 규칙, userId+dueAt 색인
.github/workflows/ci.yml                      reminder-proxy job + deploy env
```

---

### Task 1: core `reminders` 모듈과 Todo 필드

**Files:**
- Create: `packages/core/src/reminders/index.ts`
- Create: `packages/core/src/reminders/__tests__/reminders.test.ts`
- Modify: `packages/core/src/types/todo.ts` (Todo 인터페이스)
- Modify: `packages/core/src/index.ts`
- Modify: `client/src/features/todo/types/todo.type.ts` (Todo 인터페이스)
- Rebuild: `packages/core/dist/**` (dist는 git에 커밋되어 있다)

**Interfaces:**
- Produces:
  - `REMINDER_OFFSETS: readonly [0, 10, 30, 60, 1440]`
  - `type ReminderOffsetMinutes = 0 | 10 | 30 | 60 | 1440`
  - `type ReminderSetting = ReminderOffsetMinutes | "off"`
  - `DEFAULT_REMINDER_SETTING: ReminderSetting` (= 30)
  - `isReminderSetting(v: unknown): v is ReminderSetting`
  - `resolveReminderOffset(todoValue: unknown, userDefault: unknown): ReminderOffsetMinutes | null`
  - `computeFireAt(dueAtIso: string, offset: ReminderOffsetMinutes): number` (epoch ms, 파싱 실패 시 NaN)
  - `reminderBody(offset: ReminderOffsetMinutes): string`
  - `reminderSettingLabel(setting: ReminderSetting): string`
  - `Todo.reminderOffsetMinutes?: ReminderSetting | null` (core·client 양쪽)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/core/src/reminders/__tests__/reminders.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_REMINDER_SETTING,
  isReminderSetting,
  resolveReminderOffset,
  computeFireAt,
  reminderBody,
  reminderSettingLabel,
} from "..";

describe("isReminderSetting", () => {
  it("허용 숫자와 off만 통과한다", () => {
    for (const v of [0, 10, 30, 60, 1440, "off"]) expect(isReminderSetting(v)).toBe(true);
    for (const v of [5, -1, "30", null, undefined, "default", 30.5]) {
      expect(isReminderSetting(v)).toBe(false);
    }
  });
});

describe("resolveReminderOffset", () => {
  it("할 일 값이 없거나 null이면 사용자 기본값을 쓴다", () => {
    expect(resolveReminderOffset(undefined, 60)).toBe(60);
    expect(resolveReminderOffset(null, 10)).toBe(10);
  });

  it("사용자 기본값이 없거나 이상하면 30분", () => {
    expect(DEFAULT_REMINDER_SETTING).toBe(30);
    expect(resolveReminderOffset(undefined, undefined)).toBe(30);
    expect(resolveReminderOffset(undefined, "garbage")).toBe(30);
  });

  it("할 일별 재지정이 기본값보다 우선한다", () => {
    expect(resolveReminderOffset(1440, 30)).toBe(1440);
    expect(resolveReminderOffset(0, 30)).toBe(0);
  });

  it("할 일이 off면 null", () => {
    expect(resolveReminderOffset("off", 30)).toBeNull();
  });

  // Review Focus 1: 설정의 "알림 없음"은 전체를 끈다.
  it("사용자 기본값이 off면 할 일별 재지정이 있어도 null", () => {
    expect(resolveReminderOffset(30, "off")).toBeNull();
    expect(resolveReminderOffset(undefined, "off")).toBeNull();
  });

  it("할 일 값이 이상하면 기본값으로 취급한다", () => {
    expect(resolveReminderOffset(7, 60)).toBe(60);
  });
});

describe("computeFireAt", () => {
  it("마감에서 오프셋만큼 뺀 epoch ms", () => {
    expect(computeFireAt("2026-10-01T09:00:00.000Z", 30)).toBe(Date.parse("2026-10-01T08:30:00.000Z"));
    expect(computeFireAt("2026-10-01T09:00:00.000Z", 1440)).toBe(Date.parse("2026-09-30T09:00:00.000Z"));
  });

  it("파싱할 수 없으면 NaN", () => {
    expect(computeFireAt("not-a-date", 0)).toBeNaN();
  });
});

describe("문구", () => {
  it("reminderBody", () => {
    expect(reminderBody(0)).toBe("지금 마감이에요");
    expect(reminderBody(10)).toBe("10분 후 마감이에요");
    expect(reminderBody(30)).toBe("30분 후 마감이에요");
    expect(reminderBody(60)).toBe("1시간 후 마감이에요");
    expect(reminderBody(1440)).toBe("내일 이 시간에 마감이에요");
  });

  it("reminderSettingLabel", () => {
    expect(reminderSettingLabel("off")).toBe("알림 없음");
    expect(reminderSettingLabel(0)).toBe("정각");
    expect(reminderSettingLabel(10)).toBe("10분 전");
    expect(reminderSettingLabel(30)).toBe("30분 전");
    expect(reminderSettingLabel(60)).toBe("1시간 전");
    expect(reminderSettingLabel(1440)).toBe("하루 전");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd packages/core && npx vitest run src/reminders`
Expected: FAIL — `Failed to resolve import ".."`

- [ ] **Step 3: 구현**

```ts
// packages/core/src/reminders/index.ts
/**
 * 마감 알림 공용 규칙. 웹 클라이언트, reminder-proxy Worker, (후속) 모바일이 함께 쓴다.
 * firebase를 import하지 않는다 — 클라이언트·Worker가 서브패스로 가져가도 번들이 가볍다.
 */
export const REMINDER_OFFSETS = [0, 10, 30, 60, 1440] as const;
export type ReminderOffsetMinutes = (typeof REMINDER_OFFSETS)[number];
export type ReminderSetting = ReminderOffsetMinutes | "off";

export const DEFAULT_REMINDER_SETTING: ReminderSetting = 30;

export const isReminderSetting = (value: unknown): value is ReminderSetting =>
  value === "off" ||
  (typeof value === "number" && (REMINDER_OFFSETS as readonly number[]).includes(value));

/**
 * 실제 적용할 오프셋. 알림을 보내지 않으면 null.
 * - 사용자 기본값이 "off"면 할 일별 재지정과 무관하게 전체를 끈다.
 * - 할 일 값이 없음/null/이상한 값이면 사용자 기본값을 따른다.
 */
export const resolveReminderOffset = (
  todoValue: unknown,
  userDefault: unknown,
): ReminderOffsetMinutes | null => {
  const userSetting = isReminderSetting(userDefault) ? userDefault : DEFAULT_REMINDER_SETTING;
  if (userSetting === "off") return null;
  const setting = isReminderSetting(todoValue) ? todoValue : userSetting;
  return setting === "off" ? null : setting;
};

export const computeFireAt = (dueAtIso: string, offset: ReminderOffsetMinutes): number =>
  Date.parse(dueAtIso) - offset * 60_000;

export const reminderBody = (offset: ReminderOffsetMinutes): string => {
  if (offset === 0) return "지금 마감이에요";
  if (offset === 60) return "1시간 후 마감이에요";
  if (offset === 1440) return "내일 이 시간에 마감이에요";
  return `${offset}분 후 마감이에요`;
};

export const reminderSettingLabel = (setting: ReminderSetting): string => {
  if (setting === "off") return "알림 없음";
  if (setting === 0) return "정각";
  if (setting === 60) return "1시간 전";
  if (setting === 1440) return "하루 전";
  return `${setting}분 전`;
};
```

`packages/core/src/types/todo.ts` — 파일 맨 위에 import를 추가하고 `Todo` 인터페이스의 `overdueArchived` 아래에 필드를 추가한다:

```ts
import type { ReminderSetting } from "../reminders";
```

```ts
  /** 마감 알림 오프셋. 없거나 null이면 사용자 기본값(userSettings)을 따른다.
   *  "off"면 이 할 일만 알림을 끈다. */
  reminderOffsetMinutes?: ReminderSetting | null;
```

`packages/core/src/index.ts` 끝에 추가(모바일이 루트로 쓰기 위함. 웹은 서브패스로만 쓴다):

```ts
export * from "./reminders";
```

`client/src/features/todo/types/todo.type.ts` — 맨 위에 import 추가, `Todo` 인터페이스의 `googleEventId` 아래에 필드 추가:

```ts
import type { ReminderSetting } from "@tododo/core/dist/reminders/index.js";
```

```ts
  /** 마감 알림 오프셋. 없거나 null이면 사용자 기본값(userSettings)을 따른다.
   *  "off"면 이 할 일만 알림을 끈다. reminder-proxy가 이 값을 읽어 예약한다. */
  reminderOffsetMinutes?: ReminderSetting | null;
```

- [ ] **Step 4: 테스트 통과 + dist 빌드**

Run: `cd packages/core && npx vitest run && npm run build && ls dist/reminders`
Expected: 전부 PASS, `index.js index.d.ts` 출력

Run: `cd client && npx tsc -b`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add packages/core/src/reminders packages/core/src/types/todo.ts packages/core/src/index.ts packages/core/dist client/src/features/todo/types/todo.type.ts
git commit -m "feat(core): 마감 알림 공용 규칙(오프셋·기본값 판정·문구)과 Todo.reminderOffsetMinutes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: reminder-proxy 골격과 예약 계산(`schedule.ts`)

**Files:**
- Create: `reminder-proxy/package.json`, `reminder-proxy/tsconfig.json`, `reminder-proxy/wrangler.toml`, `reminder-proxy/.gitignore`
- Create: `reminder-proxy/src/env.ts`
- Create: `reminder-proxy/src/schedule.ts`
- Test: `reminder-proxy/src/__tests__/schedule.test.ts`

**Interfaces:**
- Consumes: Task 1의 `resolveReminderOffset`, `computeFireAt`, `ReminderOffsetMinutes` (`@tododo/core/dist/reminders/index.js`)
- Produces:
  - `WINDOW_MS = 7일`, `QUERY_SPAN_MS = 8일`, `LATE_GRACE_MS = 5분`
  - `interface ReminderTodo { id: string; userId: string; title: string; status: string; archived: boolean; dueAt: string | null; reminderOffsetMinutes: unknown }`
  - `interface ScheduleEntry { todoId: string; fireAt: number; dueAt: string; offsetMinutes: ReminderOffsetMinutes }`
  - `computeSchedule(todos: ReminderTodo[], userDefault: unknown, now: number): ScheduleEntry[]` (fireAt 오름차순)
  - `type SkipReason = "missing" | "done" | "archived" | "dueAtChanged" | "tooLate"`
  - `shouldSend(entry: ScheduleEntry, current: ReminderTodo | null, now: number): { send: true } | { send: false; reason: SkipReason }`
  - `interface Env` (아래)

- [ ] **Step 1: 패키지 골격**

```json
// reminder-proxy/package.json
{
  "name": "reminder-proxy",
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
    "@tododo/core": "file:../packages/core",
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

```json
// reminder-proxy/tsconfig.json
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

```toml
# reminder-proxy/wrangler.toml
name = "tododo-reminder-proxy"
main = "src/index.ts"
compatibility_date = "2025-01-01"

# 사용자(uid)마다 DO 1개(idFromName(uid)). 무료 플랜은 SQLite 백엔드만 쓸 수 있다.
[[durable_objects.bindings]]
name = "REMINDER_SCHEDULER"
class_name = "ReminderScheduler"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["ReminderScheduler"]

[vars]
FIREBASE_PROJECT_ID = "tododo-83576"
CLIENT_APP_URL = "https://tododo-83576.web.app"
# GOOGLE_SERVICE_ACCOUNT는 시크릿이다(README "배포 준비" 참고).
```

```gitignore
# reminder-proxy/.gitignore
node_modules
.wrangler
.dev.vars
```

```ts
// reminder-proxy/src/env.ts
import type { ReminderScheduler } from "./scheduler";

export interface Env {
  REMINDER_SCHEDULER: DurableObjectNamespace<ReminderScheduler>;
  FIREBASE_PROJECT_ID: string;
  CLIENT_APP_URL: string;
  /** 서비스 계정 JSON 전체(문자열). Firestore 읽기 + FCM 발송에 쓴다. */
  GOOGLE_SERVICE_ACCOUNT: string;
}
```

Run: `cd reminder-proxy && npm install && ls node_modules/@tododo`
Expected: `core worker-auth` (심볼릭 링크)

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// reminder-proxy/src/__tests__/schedule.test.ts
import { describe, it, expect } from "vitest";
import { computeSchedule, shouldSend, WINDOW_MS, type ReminderTodo, type ScheduleEntry } from "../schedule";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");
const iso = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const todo = (overrides: Partial<ReminderTodo> = {}): ReminderTodo => ({
  id: "t1",
  userId: "u1",
  title: "보고서",
  status: "todo",
  archived: false,
  dueAt: iso(2 * HOUR),
  reminderOffsetMinutes: undefined,
  ...overrides,
});

describe("computeSchedule", () => {
  it("기본값(30분)으로 fireAt을 계산한다", () => {
    expect(computeSchedule([todo()], undefined, NOW)).toEqual([
      { todoId: "t1", fireAt: NOW + 2 * HOUR - 30 * MIN, dueAt: iso(2 * HOUR), offsetMinutes: 30 },
    ]);
  });

  it("할 일별 재지정과 사용자 기본값을 적용한다", () => {
    const result = computeSchedule(
      [todo({ id: "a", reminderOffsetMinutes: 10 }), todo({ id: "b" })],
      60,
      NOW,
    );
    expect(result.map((e) => [e.todoId, e.offsetMinutes])).toEqual([
      ["b", 60],
      ["a", 10],
    ]);
  });

  it("완료·보관·off·마감 없음은 제외한다", () => {
    const result = computeSchedule(
      [
        todo({ id: "done", status: "done" }),
        todo({ id: "archived", archived: true }),
        todo({ id: "off", reminderOffsetMinutes: "off" }),
        todo({ id: "nodue", dueAt: null }),
        todo({ id: "ok" }),
      ],
      undefined,
      NOW,
    );
    expect(result.map((e) => e.todoId)).toEqual(["ok"]);
  });

  // Review Focus 2: 알림 시각이 이미 지난 할 일은 즉시 보내지 않고 건너뛴다.
  it("fireAt이 이미 지났으면 제외한다(마감 20분 전에 만든 할 일 + 30분 알림)", () => {
    expect(computeSchedule([todo({ dueAt: iso(20 * MIN) })], 30, NOW)).toEqual([]);
  });

  it("fireAt이 정확히 지금이어도 제외한다", () => {
    expect(computeSchedule([todo({ dueAt: iso(30 * MIN) })], 30, NOW)).toEqual([]);
  });

  it("fireAt이 7일 창 밖이면 제외한다", () => {
    const inside = todo({ id: "in", dueAt: iso(WINDOW_MS), reminderOffsetMinutes: 60 });
    const outside = todo({ id: "out", dueAt: iso(WINDOW_MS + 2 * HOUR), reminderOffsetMinutes: 60 });
    expect(computeSchedule([inside, outside], undefined, NOW).map((e) => e.todoId)).toEqual(["in"]);
  });

  it("하루 전 알림은 8일 뒤 마감까지 창 안에 들어온다", () => {
    const t = todo({ dueAt: iso(8 * DAY - HOUR), reminderOffsetMinutes: 1440 });
    expect(computeSchedule([t], undefined, NOW)).toHaveLength(1);
  });

  it("파싱할 수 없는 dueAt은 제외한다", () => {
    expect(computeSchedule([todo({ dueAt: "garbage" })], undefined, NOW)).toEqual([]);
  });

  it("사용자 기본값이 off면 아무것도 예약하지 않는다", () => {
    expect(computeSchedule([todo({ reminderOffsetMinutes: 30 })], "off", NOW)).toEqual([]);
  });
});

describe("shouldSend", () => {
  const entry: ScheduleEntry = { todoId: "t1", fireAt: NOW, dueAt: iso(30 * MIN), offsetMinutes: 30 };

  it("그대로면 보낸다", () => {
    expect(shouldSend(entry, todo({ dueAt: entry.dueAt }), NOW)).toEqual({ send: true });
  });

  it.each([
    ["missing", null],
    ["done", todo({ dueAt: entry.dueAt, status: "done" })],
    ["archived", todo({ dueAt: entry.dueAt, archived: true })],
    ["dueAtChanged", todo({ dueAt: iso(3 * HOUR) })],
  ] as const)("%s면 보내지 않는다", (reason, current) => {
    expect(shouldSend(entry, current, NOW)).toEqual({ send: false, reason });
  });

  it("마감 5분 이내 지연은 보낸다", () => {
    const due = { ...entry, dueAt: iso(0) };
    expect(shouldSend(due, todo({ dueAt: due.dueAt }), NOW + 5 * MIN)).toEqual({ send: true });
  });

  it("마감을 5분 넘게 지나 울리면 버린다", () => {
    const due = { ...entry, dueAt: iso(0) };
    expect(shouldSend(due, todo({ dueAt: due.dueAt }), NOW + 5 * MIN + 1)).toEqual({
      send: false,
      reason: "tooLate",
    });
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/schedule.test.ts`
Expected: FAIL — `Failed to resolve import "../schedule"`

- [ ] **Step 4: 구현**

```ts
// reminder-proxy/src/schedule.ts
import {
  computeFireAt,
  resolveReminderOffset,
  type ReminderOffsetMinutes,
} from "@tododo/core/dist/reminders/index.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** 예약표에 담는 범위. 이보다 먼 알림은 창이 끝날 때(windowEnd 알람) 다시 계산한다. */
export const WINDOW_MS = 7 * DAY;
/** Firestore 조회 범위 = 창 + 최대 오프셋(하루 전). */
export const QUERY_SPAN_MS = WINDOW_MS + DAY;
/** 알람이 늦게 울렸을 때 마감 후 이 시간까지만 보낸다. 더 늦으면 소음이다. */
export const LATE_GRACE_MS = 5 * MINUTE;

export interface ReminderTodo {
  id: string;
  userId: string;
  title: string;
  status: string;
  archived: boolean;
  dueAt: string | null;
  reminderOffsetMinutes: unknown;
}

export interface ScheduleEntry {
  todoId: string;
  fireAt: number;
  dueAt: string;
  offsetMinutes: ReminderOffsetMinutes;
}

export const computeSchedule = (
  todos: ReminderTodo[],
  userDefault: unknown,
  now: number,
): ScheduleEntry[] => {
  const windowEnd = now + WINDOW_MS;
  const entries: ScheduleEntry[] = [];
  for (const todo of todos) {
    if (!todo.dueAt || todo.status === "done" || todo.archived) continue;
    const offset = resolveReminderOffset(todo.reminderOffsetMinutes, userDefault);
    if (offset === null) continue;
    const fireAt = computeFireAt(todo.dueAt, offset);
    // 이미 지난 알림은 건너뛴다(스펙 결정): 방금 만든 할 일에 즉시 알림이 오면 소음이다.
    if (Number.isNaN(fireAt) || fireAt <= now || fireAt > windowEnd) continue;
    entries.push({ todoId: todo.id, fireAt, dueAt: todo.dueAt, offsetMinutes: offset });
  }
  return entries.sort((a, b) => a.fireAt - b.fireAt);
};

export type SkipReason = "missing" | "done" | "archived" | "dueAtChanged" | "tooLate";

/** 발송 직전 재조회한 할 일(current)로 예약이 아직 유효한지 판단한다. */
export const shouldSend = (
  entry: ScheduleEntry,
  current: ReminderTodo | null,
  now: number,
): { send: true } | { send: false; reason: SkipReason } => {
  if (!current) return { send: false, reason: "missing" };
  if (current.status === "done") return { send: false, reason: "done" };
  if (current.archived) return { send: false, reason: "archived" };
  if (current.dueAt !== entry.dueAt) return { send: false, reason: "dueAtChanged" };
  if (now > Date.parse(entry.dueAt) + LATE_GRACE_MS) return { send: false, reason: "tooLate" };
  return { send: true };
};
```

- [ ] **Step 5: 통과 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/schedule.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add reminder-proxy/package.json reminder-proxy/package-lock.json reminder-proxy/tsconfig.json reminder-proxy/wrangler.toml reminder-proxy/.gitignore reminder-proxy/src/env.ts reminder-proxy/src/schedule.ts reminder-proxy/src/__tests__/schedule.test.ts
git commit -m "feat(reminder-proxy): Worker 골격과 알림 예약 계산(computeSchedule/shouldSend)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`env.ts`가 아직 없는 `./scheduler`를 타입 import하므로 이 시점 `npm run typecheck`는 실패한다. Task 7에서 해소된다. vitest는 타입 import를 지우므로 통과한다.)

---

### Task 3: Google 서비스 계정 액세스 토큰(`googleAuth.ts`)

**Files:**
- Create: `reminder-proxy/src/googleAuth.ts`
- Test: `reminder-proxy/src/__tests__/googleAuth.test.ts`

**Interfaces:**
- Produces:
  - `interface ServiceAccount { client_email: string; private_key: string }`
  - `parseServiceAccount(json: string): ServiceAccount` (필드 누락 시 throw)
  - `GOOGLE_SCOPES: string` (공백 구분 2개)
  - `signServiceAccountJwt(sa: ServiceAccount, nowSec: number): Promise<string>`
  - `class GoogleTokenProvider { constructor(sa, fetchFn?: typeof fetch, now?: () => number); getToken(): Promise<string> }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// reminder-proxy/src/__tests__/googleAuth.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  GOOGLE_SCOPES,
  GoogleTokenProvider,
  parseServiceAccount,
  signServiceAccountJwt,
  type ServiceAccount,
} from "../googleAuth";

let sa: ServiceAccount;
let publicKey: CryptoKey;

const toPem = (der: ArrayBuffer) => {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
};
const b64urlDecode = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) =>
    c.charCodeAt(0),
  );

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  publicKey = pair.publicKey;
  sa = {
    client_email: "reminder@tododo-test.iam.gserviceaccount.com",
    private_key: toPem(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
  };
});

describe("parseServiceAccount", () => {
  it("client_email과 private_key를 꺼낸다", () => {
    expect(parseServiceAccount(JSON.stringify({ ...sa, project_id: "x" }))).toEqual(sa);
  });

  it("필드가 없으면 throw", () => {
    expect(() => parseServiceAccount("{}")).toThrow();
    expect(() => parseServiceAccount("not json")).toThrow();
  });
});

describe("signServiceAccountJwt", () => {
  it("RS256으로 서명된 올바른 클레임의 JWT를 만든다", async () => {
    const jwt = await signServiceAccountJwt(sa, 1_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({
      iss: sa.client_email,
      scope: GOOGLE_SCOPES,
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000,
      exp: 4_600,
    });
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      b64urlDecode(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(valid).toBe(true);
  });
});

describe("GoogleTokenProvider", () => {
  const okResponse = (token: string) =>
    new Response(JSON.stringify({ access_token: token, expires_in: 3600 }), { status: 200 });

  it("토큰을 교환하고 만료 5분 전까지 캐시한다", async () => {
    let now = 0;
    const fetchFn = vi.fn().mockResolvedValueOnce(okResponse("a")).mockResolvedValueOnce(okResponse("b"));
    const provider = new GoogleTokenProvider(sa, fetchFn as unknown as typeof fetch, () => now);

    expect(await provider.getToken()).toBe("a");
    now = 54 * 60_000;
    expect(await provider.getToken()).toBe("a");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    now = 56 * 60_000;
    expect(await provider.getToken()).toBe("b");
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(body.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("교환 실패면 throw하고 캐시하지 않는다", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response("no", { status: 400 })).mockResolvedValueOnce(okResponse("c"));
    const provider = new GoogleTokenProvider(sa, fetchFn as unknown as typeof fetch, () => 0);
    await expect(provider.getToken()).rejects.toThrow("400");
    expect(await provider.getToken()).toBe("c");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/googleAuth.test.ts`
Expected: FAIL — `Failed to resolve import "../googleAuth"`

- [ ] **Step 3: 구현**

```ts
// reminder-proxy/src/googleAuth.ts
export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/firebase.messaging",
].join(" ");
/** 만료 이 시간 전부터는 새 토큰을 받는다(발송 도중 만료 방지). */
const REFRESH_MARGIN_MS = 5 * 60_000;

export const parseServiceAccount = (json: string): ServiceAccount => {
  const data = JSON.parse(json) as Partial<ServiceAccount>;
  if (typeof data.client_email !== "string" || typeof data.private_key !== "string") {
    throw new Error("GOOGLE_SERVICE_ACCOUNT에 client_email/private_key가 없습니다");
  }
  return { client_email: data.client_email, private_key: data.private_key };
};

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const encodeJson = (value: unknown): string => base64Url(new TextEncoder().encode(JSON.stringify(value)));

const pemToDer = (pem: string): Uint8Array => {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

export const signServiceAccountJwt = async (sa: ServiceAccount, nowSec: number): Promise<string> => {
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({
    iss: sa.client_email,
    scope: GOOGLE_SCOPES,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
};

/** DO 인스턴스 메모리에 액세스 토큰을 캐시한다. DO가 퇴거되면 다음 알람에서 다시 받는다. */
export class GoogleTokenProvider {
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly sa: ServiceAccount,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - REFRESH_MARGIN_MS > this.now()) {
      return this.cached.token;
    }
    const assertion = await signServiceAccountJwt(this.sa, Math.floor(this.now() / 1000));
    const res = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!res.ok) throw new Error(`Google 토큰 교환 실패: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { token: data.access_token, expiresAt: this.now() + data.expires_in * 1000 };
    return data.access_token;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/googleAuth.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add reminder-proxy/src/googleAuth.ts reminder-proxy/src/__tests__/googleAuth.test.ts
git commit -m "feat(reminder-proxy): 서비스 계정 JWT(RS256) 서명과 액세스 토큰 캐시

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Firestore REST 조회(`firestore.ts`)

**Files:**
- Create: `reminder-proxy/src/firestore.ts`
- Test: `reminder-proxy/src/__tests__/firestore.test.ts`

**Interfaces:**
- Consumes: Task 2 `ReminderTodo`
- Produces:
  - `decodeValue(value: FirestoreValue): unknown`
  - `toReminderTodo(id: string, fields: Record<string, FirestoreValue>): ReminderTodo`
  - `class FirestoreClient { constructor(projectId: string, getToken: () => Promise<string>, fetchFn?: typeof fetch) }`
    - `queryUpcomingTodos(uid: string, fromIso: string, toIso: string): Promise<ReminderTodo[]>`
    - `getTodo(uid: string, todoId: string): Promise<ReminderTodo | null>` (없거나 다른 사용자 문서면 null)
    - `getReminderDefault(uid: string): Promise<unknown>` (문서 없으면 undefined)
  - `class FirestoreError extends Error { status: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// reminder-proxy/src/__tests__/firestore.test.ts
import { describe, it, expect, vi } from "vitest";
import { FirestoreClient, FirestoreError, decodeValue, toReminderTodo } from "../firestore";

const BASE = "https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents";
const fields = {
  userId: { stringValue: "u1" },
  title: { stringValue: "보고서" },
  status: { stringValue: "todo" },
  archived: { booleanValue: false },
  dueAt: { stringValue: "2026-10-01T09:00:00.000Z" },
  reminderOffsetMinutes: { integerValue: "60" },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const client = (fetchFn: ReturnType<typeof vi.fn>) =>
  new FirestoreClient("p1", async () => "tok", fetchFn as unknown as typeof fetch);

describe("decodeValue", () => {
  it("REST 값 타입을 JS 값으로 바꾼다", () => {
    expect(decodeValue({ stringValue: "a" })).toBe("a");
    expect(decodeValue({ integerValue: "30" })).toBe(30);
    expect(decodeValue({ doubleValue: 1.5 })).toBe(1.5);
    expect(decodeValue({ booleanValue: true })).toBe(true);
    expect(decodeValue({ nullValue: null })).toBeNull();
    expect(decodeValue({ mapValue: { fields: { a: { stringValue: "b" } } } })).toEqual({ a: "b" });
    expect(decodeValue({ arrayValue: { values: [{ integerValue: "1" }] } })).toEqual([1]);
    expect(decodeValue({ arrayValue: {} })).toEqual([]);
  });
});

describe("toReminderTodo", () => {
  it("필드를 ReminderTodo로 매핑하고 archived 누락은 false", () => {
    const { archived: _a, ...noArchived } = fields;
    expect(toReminderTodo("t1", noArchived)).toEqual({
      id: "t1",
      userId: "u1",
      title: "보고서",
      status: "todo",
      archived: false,
      dueAt: "2026-10-01T09:00:00.000Z",
      reminderOffsetMinutes: 60,
    });
  });

  it("reminderOffsetMinutes 문자열 off와 누락을 보존한다", () => {
    expect(toReminderTodo("t", { ...fields, reminderOffsetMinutes: { stringValue: "off" } }).reminderOffsetMinutes).toBe("off");
    const { reminderOffsetMinutes: _r, ...rest } = fields;
    expect(toReminderTodo("t", rest).reminderOffsetMinutes).toBeUndefined();
  });
});

describe("FirestoreClient", () => {
  it("queryUpcomingTodos는 userId + dueAt 범위로 runQuery한다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      json([
        { document: { name: `projects/p1/databases/(default)/documents/todos/t1`, fields } },
        { readTime: "2026-10-01T00:00:00Z" },
      ]),
    );
    const todos = await client(fetchFn).queryUpcomingTodos("u1", "2026-10-01T00:00:00.000Z", "2026-10-09T00:00:00.000Z");

    expect(todos.map((t) => t.id)).toEqual(["t1"]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}:runQuery`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      structuredQuery: {
        from: [{ collectionId: "todos" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: "u1" } } },
              {
                fieldFilter: {
                  field: { fieldPath: "dueAt" },
                  op: "GREATER_THAN_OR_EQUAL",
                  value: { stringValue: "2026-10-01T00:00:00.000Z" },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "dueAt" },
                  op: "LESS_THAN_OR_EQUAL",
                  value: { stringValue: "2026-10-09T00:00:00.000Z" },
                },
              },
            ],
          },
        },
      },
    });
  });

  it("getTodo는 404면 null, 다른 사용자 문서면 null", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ error: {} }, 404))
      .mockResolvedValueOnce(json({ name: "x/todos/t1", fields: { ...fields, userId: { stringValue: "other" } } }))
      .mockResolvedValueOnce(json({ name: "x/todos/t1", fields }));
    const c = client(fetchFn);
    expect(await c.getTodo("u1", "t1")).toBeNull();
    expect(await c.getTodo("u1", "t1")).toBeNull();
    expect((await c.getTodo("u1", "t1"))?.title).toBe("보고서");
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/todos/t1`);
  });

  it("getReminderDefault는 문서가 없으면 undefined", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({ fields: { reminderDefaultOffsetMinutes: { stringValue: "off" } } }));
    const c = client(fetchFn);
    expect(await c.getReminderDefault("u1")).toBeUndefined();
    expect(await c.getReminderDefault("u1")).toBe("off");
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/userSettings/u1`);
  });

  it("404가 아닌 실패는 FirestoreError", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({}, 503));
    await expect(client(fetchFn).getTodo("u1", "t1")).rejects.toBeInstanceOf(FirestoreError);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/firestore.test.ts`
Expected: FAIL — `Failed to resolve import "../firestore"`

- [ ] **Step 3: 구현**

```ts
// reminder-proxy/src/firestore.ts
import type { ReminderTodo } from "./schedule";

export type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
  arrayValue?: { values?: FirestoreValue[] };
};

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

export class FirestoreError extends Error {
  constructor(readonly status: number, path: string) {
    super(`Firestore 요청 실패 (${status}): ${path}`);
    this.name = "FirestoreError";
  }
}

export const decodeValue = (value: FirestoreValue): unknown => {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) return decodeFields(value.mapValue?.fields ?? {});
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decodeValue);
  return undefined;
};

const decodeFields = (fields: Record<string, FirestoreValue>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));

export const toReminderTodo = (id: string, fields: Record<string, FirestoreValue>): ReminderTodo => {
  const data = decodeFields(fields);
  return {
    id,
    userId: String(data.userId ?? ""),
    title: String(data.title ?? ""),
    status: String(data.status ?? ""),
    archived: data.archived === true,
    dueAt: typeof data.dueAt === "string" ? data.dueAt : null,
    reminderOffsetMinutes: data.reminderOffsetMinutes,
  };
};

const docId = (name: string): string => name.slice(name.lastIndexOf("/") + 1);

const fieldFilter = (fieldPath: string, op: string, value: FirestoreValue) => ({
  fieldFilter: { field: { fieldPath }, op, value },
});

/**
 * 서비스 계정으로 Firestore REST를 호출한다. 서비스 계정은 보안 규칙을 우회하므로
 * 사용자 경계는 여기서 지킨다: 조회는 항상 userId로 거르고, 단건 조회는 userId를 확인한다.
 */
export class FirestoreClient {
  private readonly base: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    private readonly fetchFn: typeof fetch = fetch,
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

  /** dueAt은 모든 작성 경로가 toISOString()(UTC Z) 형식이라 문자열 범위 비교가 시간 순서와 같다. */
  async queryUpcomingTodos(uid: string, fromIso: string, toIso: string): Promise<ReminderTodo[]> {
    const res = await this.request(":runQuery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "todos" }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                fieldFilter("userId", "EQUAL", { stringValue: uid }),
                fieldFilter("dueAt", "GREATER_THAN_OR_EQUAL", { stringValue: fromIso }),
                fieldFilter("dueAt", "LESS_THAN_OR_EQUAL", { stringValue: toIso }),
              ],
            },
          },
        },
      }),
    });
    if (!res.ok) throw new FirestoreError(res.status, ":runQuery");
    const rows = (await res.json()) as { document?: FirestoreDocument }[];
    return rows
      .filter((row): row is { document: FirestoreDocument } => !!row.document)
      .map(({ document }) => toReminderTodo(docId(document.name), document.fields ?? {}));
  }

  async getTodo(uid: string, todoId: string): Promise<ReminderTodo | null> {
    const path = `/todos/${encodeURIComponent(todoId)}`;
    const res = await this.request(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new FirestoreError(res.status, path);
    const document = (await res.json()) as FirestoreDocument;
    const todo = toReminderTodo(todoId, document.fields ?? {});
    return todo.userId === uid ? todo : null;
  }

  async getReminderDefault(uid: string): Promise<unknown> {
    const path = `/userSettings/${encodeURIComponent(uid)}`;
    const res = await this.request(path);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new FirestoreError(res.status, path);
    const document = (await res.json()) as FirestoreDocument;
    return decodeFields(document.fields ?? {}).reminderDefaultOffsetMinutes;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/firestore.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add reminder-proxy/src/firestore.ts reminder-proxy/src/__tests__/firestore.test.ts
git commit -m "feat(reminder-proxy): Firestore REST 조회(창 쿼리·단건·사용자 설정)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: FCM 발송(`fcm.ts`)

**Files:**
- Create: `reminder-proxy/src/fcm.ts`
- Test: `reminder-proxy/src/__tests__/fcm.test.ts`

**Interfaces:**
- Produces:
  - `interface PushMessage { token: string; title: string; body: string; link: string; todoId: string }`
  - `type SendResult = "sent" | "invalidToken"`
  - `class TransientFcmError extends Error`
  - `sendPush(projectId: string, accessToken: string, message: PushMessage, fetchFn?: typeof fetch): Promise<SendResult>`
    - 2xx → `"sent"`
    - 404, `UNREGISTERED`, `SENDER_ID_MISMATCH`, 메시지에 "registration token"이 있는 `INVALID_ARGUMENT` → `"invalidToken"`
    - 429, 5xx → `TransientFcmError`
    - 그 밖(401/403 인증 문제, 우리 페이로드 오류 등) → `Error`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// reminder-proxy/src/__tests__/fcm.test.ts
import { describe, it, expect, vi } from "vitest";
import { sendPush, TransientFcmError, type PushMessage } from "../fcm";

const message: PushMessage = {
  token: "tok-1",
  title: "보고서",
  body: "30분 후 마감이에요",
  link: "https://app.example.com/todo/t1",
  todoId: "t1",
};
const fcmError = (status: number, errorCode: string, msg = "x") =>
  new Response(
    JSON.stringify({
      error: {
        code: status,
        message: msg,
        details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }],
      },
    }),
    { status },
  );

describe("sendPush", () => {
  it("FCM v1 형식으로 보내고 2xx면 sent", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendPush("p1", "access", message, fetchFn as unknown as typeof fetch)).toBe("sent");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/p1/messages:send");
    expect(init.headers.Authorization).toBe("Bearer access");
    expect(JSON.parse(init.body)).toEqual({
      message: {
        token: "tok-1",
        notification: { title: "보고서", body: "30분 후 마감이에요" },
        data: { todoId: "t1" },
        webpush: { fcm_options: { link: "https://app.example.com/todo/t1" } },
      },
    });
  });

  it.each([
    ["404 UNREGISTERED", fcmError(404, "UNREGISTERED")],
    ["403 SENDER_ID_MISMATCH", fcmError(403, "SENDER_ID_MISMATCH")],
    [
      "400 잘못된 토큰",
      fcmError(400, "INVALID_ARGUMENT", "The registration token is not a valid FCM registration token"),
    ],
  ])("%s면 invalidToken", async (_label, response) => {
    const fetchFn = vi.fn().mockResolvedValue(response);
    expect(await sendPush("p1", "a", message, fetchFn as unknown as typeof fetch)).toBe("invalidToken");
  });

  it.each([429, 500, 503])("%i면 TransientFcmError", async (status) => {
    const fetchFn = vi.fn().mockResolvedValue(fcmError(status, "UNAVAILABLE"));
    await expect(sendPush("p1", "a", message, fetchFn as unknown as typeof fetch)).rejects.toBeInstanceOf(
      TransientFcmError,
    );
  });

  it("토큰 문제가 아닌 400(우리 페이로드 오류)은 토큰을 지우지 않도록 일반 Error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(fcmError(400, "INVALID_ARGUMENT", "Invalid JSON payload"));
    const promise = sendPush("p1", "a", message, fetchFn as unknown as typeof fetch);
    await expect(promise).rejects.toThrow("400");
    await expect(promise).rejects.not.toBeInstanceOf(TransientFcmError);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/fcm.test.ts`
Expected: FAIL — `Failed to resolve import "../fcm"`

- [ ] **Step 3: 구현**

```ts
// reminder-proxy/src/fcm.ts
export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** 알림 클릭 시 열 절대 URL. 웹 푸시는 같은 origin의 HTTPS여야 한다. */
  link: string;
  todoId: string;
}

export type SendResult = "sent" | "invalidToken";

/** 재시도하면 성공할 수 있는 실패(429, 5xx). */
export class TransientFcmError extends Error {
  constructor(readonly status: number) {
    super(`FCM 일시 실패: ${status}`);
    this.name = "TransientFcmError";
  }
}

interface FcmErrorBody {
  error?: { message?: string; details?: { errorCode?: string }[] };
}

const INVALID_TOKEN_CODES = new Set(["UNREGISTERED", "SENDER_ID_MISMATCH"]);

export const sendPush = async (
  projectId: string,
  accessToken: string,
  message: PushMessage,
  fetchFn: typeof fetch = fetch,
): Promise<SendResult> => {
  const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: { todoId: message.todoId },
        webpush: { fcm_options: { link: message.link } },
      },
    }),
  });
  if (res.ok) return "sent";
  if (res.status === 429 || res.status >= 500) throw new TransientFcmError(res.status);

  const body = (await res.json().catch(() => ({}))) as FcmErrorBody;
  const errorCode = body.error?.details?.find((d) => d.errorCode)?.errorCode;
  if (res.status === 404 || (errorCode && INVALID_TOKEN_CODES.has(errorCode))) return "invalidToken";
  // INVALID_ARGUMENT는 우리 페이로드 오류일 때도 온다. 그때 토큰을 지우면 모든 기기의
  // 알림이 조용히 끊기므로, 토큰 문제라고 명시된 경우만 무효 토큰으로 본다.
  if (errorCode === "INVALID_ARGUMENT" && /registration token/i.test(body.error?.message ?? "")) {
    return "invalidToken";
  }
  throw new Error(`FCM 발송 실패 (${res.status} ${errorCode ?? ""}): ${body.error?.message ?? ""}`);
};
```

- [ ] **Step 4: 통과 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/fcm.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add reminder-proxy/src/fcm.ts reminder-proxy/src/__tests__/fcm.test.ts
git commit -m "feat(reminder-proxy): FCM v1 발송과 무효 토큰/일시 실패 분류

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 저장소와 알람 처리(`store.ts`, `alarmRunner.ts`)

**Files:**
- Create: `reminder-proxy/src/store.ts`
- Create: `reminder-proxy/src/alarmRunner.ts`
- Create: `reminder-proxy/src/__tests__/memoryStore.ts` (테스트용 구현)
- Test: `reminder-proxy/src/__tests__/alarmRunner.test.ts`

**Interfaces:**
- Consumes: Task 2 `computeSchedule`, `shouldSend`, `ScheduleEntry`, `ReminderTodo`, `WINDOW_MS`, `QUERY_SPAN_MS`; Task 5 `PushMessage`, `SendResult`, `TransientFcmError`; Task 1 `reminderBody`
- Produces:
  - `interface ReminderStore` (동기 API — DO SQLite가 동기다):
    `listTokens(): string[]`, `upsertToken(token, platform, now): void`, `deleteToken(token): void`,
    `replaceSchedule(entries: ScheduleEntry[]): void`, `dueEntries(now): ScheduleEntry[]`, `deleteEntry(todoId): void`, `nextFireAt(): number | null`,
    `isSent(todoId, fireAt): boolean`, `markSent(todoId, fireAt, dueAtMs): void`, `pruneSent(beforeDueAtMs): void`,
    `getMeta(key: MetaKey): string | null`, `setMeta(key: MetaKey, value: string): void`
  - `type MetaKey = "uid" | "refreshPending" | "windowEnd"`
  - `class SqliteReminderStore implements ReminderStore { constructor(sql: SqlStorage) }`
  - `interface AlarmDeps { store; now(): number; uid: string; firestore: Pick<FirestoreClient, "queryUpcomingTodos" | "getTodo" | "getReminderDefault">; sendPush(message: PushMessage): Promise<SendResult>; appUrl: string }`
  - `runAlarm(deps: AlarmDeps): Promise<number | null>` — 다음 알람 시각(없으면 null)
  - `refreshSchedule(deps: AlarmDeps, now: number): Promise<void>`

- [ ] **Step 1: 저장소 인터페이스와 SQLite 구현**

```ts
// reminder-proxy/src/store.ts
import type { ReminderOffsetMinutes } from "@tododo/core/dist/reminders/index.js";
import type { ScheduleEntry } from "./schedule";

export type MetaKey = "uid" | "refreshPending" | "windowEnd";

/** DO SQLite가 동기 API라 저장소도 동기다. 테스트는 memoryStore로 같은 계약을 쓴다. */
export interface ReminderStore {
  listTokens(): string[];
  upsertToken(token: string, platform: string, now: number): void;
  deleteToken(token: string): void;
  replaceSchedule(entries: ScheduleEntry[]): void;
  dueEntries(now: number): ScheduleEntry[];
  deleteEntry(todoId: string): void;
  nextFireAt(): number | null;
  isSent(todoId: string, fireAt: number): boolean;
  markSent(todoId: string, fireAt: number, dueAtMs: number): void;
  pruneSent(beforeDueAtMs: number): void;
  getMeta(key: MetaKey): string | null;
  setMeta(key: MetaKey, value: string): void;
}

type ScheduleRow = { todoId: string; fireAt: number; dueAt: string; offsetMinutes: number };

export class SqliteReminderStore implements ReminderStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, platform TEXT NOT NULL, updatedAt INTEGER NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS schedule (todoId TEXT PRIMARY KEY, fireAt INTEGER NOT NULL, dueAt TEXT NOT NULL, offsetMinutes INTEGER NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS sent (todoId TEXT NOT NULL, fireAt INTEGER NOT NULL, dueAtMs INTEGER NOT NULL, PRIMARY KEY (todoId, fireAt))",
    );
    sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }

  listTokens(): string[] {
    return this.sql.exec<{ token: string }>("SELECT token FROM tokens").toArray().map((r) => r.token);
  }

  upsertToken(token: string, platform: string, now: number): void {
    this.sql.exec(
      "INSERT INTO tokens (token, platform, updatedAt) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET platform = excluded.platform, updatedAt = excluded.updatedAt",
      token,
      platform,
      now,
    );
  }

  deleteToken(token: string): void {
    this.sql.exec("DELETE FROM tokens WHERE token = ?", token);
  }

  replaceSchedule(entries: ScheduleEntry[]): void {
    this.sql.exec("DELETE FROM schedule");
    for (const e of entries) {
      this.sql.exec(
        "INSERT INTO schedule (todoId, fireAt, dueAt, offsetMinutes) VALUES (?, ?, ?, ?)",
        e.todoId,
        e.fireAt,
        e.dueAt,
        e.offsetMinutes,
      );
    }
  }

  dueEntries(now: number): ScheduleEntry[] {
    return this.sql
      .exec<ScheduleRow>(
        "SELECT todoId, fireAt, dueAt, offsetMinutes FROM schedule WHERE fireAt <= ? ORDER BY fireAt",
        now,
      )
      .toArray()
      .map((r) => ({ ...r, offsetMinutes: r.offsetMinutes as ReminderOffsetMinutes }));
  }

  deleteEntry(todoId: string): void {
    this.sql.exec("DELETE FROM schedule WHERE todoId = ?", todoId);
  }

  nextFireAt(): number | null {
    const row = this.sql.exec<{ next: number | null }>("SELECT MIN(fireAt) AS next FROM schedule").one();
    return row.next ?? null;
  }

  isSent(todoId: string, fireAt: number): boolean {
    return (
      this.sql.exec("SELECT 1 AS hit FROM sent WHERE todoId = ? AND fireAt = ?", todoId, fireAt).toArray().length > 0
    );
  }

  markSent(todoId: string, fireAt: number, dueAtMs: number): void {
    this.sql.exec("INSERT OR IGNORE INTO sent (todoId, fireAt, dueAtMs) VALUES (?, ?, ?)", todoId, fireAt, dueAtMs);
  }

  pruneSent(beforeDueAtMs: number): void {
    this.sql.exec("DELETE FROM sent WHERE dueAtMs < ?", beforeDueAtMs);
  }

  getMeta(key: MetaKey): string | null {
    const rows = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray();
    return rows[0]?.value ?? null;
  }

  setMeta(key: MetaKey, value: string): void {
    this.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }
}
```

```ts
// reminder-proxy/src/__tests__/memoryStore.ts
import type { MetaKey, ReminderStore } from "../store";
import type { ScheduleEntry } from "../schedule";

export class MemoryReminderStore implements ReminderStore {
  tokens = new Map<string, { platform: string; updatedAt: number }>();
  schedule = new Map<string, ScheduleEntry>();
  sent = new Map<string, number>(); // `${todoId}:${fireAt}` → dueAtMs
  meta = new Map<MetaKey, string>();

  listTokens() {
    return [...this.tokens.keys()];
  }
  upsertToken(token: string, platform: string, now: number) {
    this.tokens.set(token, { platform, updatedAt: now });
  }
  deleteToken(token: string) {
    this.tokens.delete(token);
  }
  replaceSchedule(entries: ScheduleEntry[]) {
    this.schedule = new Map(entries.map((e) => [e.todoId, e]));
  }
  dueEntries(now: number) {
    return [...this.schedule.values()].filter((e) => e.fireAt <= now).sort((a, b) => a.fireAt - b.fireAt);
  }
  deleteEntry(todoId: string) {
    this.schedule.delete(todoId);
  }
  nextFireAt() {
    const times = [...this.schedule.values()].map((e) => e.fireAt);
    return times.length ? Math.min(...times) : null;
  }
  isSent(todoId: string, fireAt: number) {
    return this.sent.has(`${todoId}:${fireAt}`);
  }
  markSent(todoId: string, fireAt: number, dueAtMs: number) {
    this.sent.set(`${todoId}:${fireAt}`, dueAtMs);
  }
  pruneSent(beforeDueAtMs: number) {
    for (const [k, due] of this.sent) if (due < beforeDueAtMs) this.sent.delete(k);
  }
  getMeta(key: MetaKey) {
    return this.meta.get(key) ?? null;
  }
  setMeta(key: MetaKey, value: string) {
    this.meta.set(key, value);
  }
}
```

- [ ] **Step 2: 실패하는 알람 처리 테스트 작성**

```ts
// reminder-proxy/src/__tests__/alarmRunner.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAlarm, type AlarmDeps } from "../alarmRunner";
import { TransientFcmError, type PushMessage, type SendResult } from "../fcm";
import { WINDOW_MS, type ReminderTodo } from "../schedule";
import { MemoryReminderStore } from "./memoryStore";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");
const MIN = 60_000;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

const todo = (overrides: Partial<ReminderTodo> = {}): ReminderTodo => ({
  id: "t1",
  userId: "u1",
  title: "보고서",
  status: "todo",
  archived: false,
  dueAt: iso(60 * MIN),
  reminderOffsetMinutes: undefined,
  ...overrides,
});

let store: MemoryReminderStore;
let now: number;
let db: Map<string, ReminderTodo>;
let userDefault: unknown;
let sendPush: ReturnType<typeof vi.fn<(m: PushMessage) => Promise<SendResult>>>;
let firestore: AlarmDeps["firestore"];

const deps = (): AlarmDeps => ({
  store,
  now: () => now,
  uid: "u1",
  firestore,
  sendPush,
  appUrl: "https://app.example.com",
});

beforeEach(() => {
  store = new MemoryReminderStore();
  now = NOW;
  db = new Map([["t1", todo()]]);
  userDefault = undefined;
  sendPush = vi.fn(async () => "sent" as const);
  firestore = {
    queryUpcomingTodos: vi.fn(async () => [...db.values()]),
    getTodo: vi.fn(async (_uid: string, id: string) => db.get(id) ?? null),
    getReminderDefault: vi.fn(async () => userDefault),
  };
  store.upsertToken("tok-a", "web", NOW);
  store.setMeta("refreshPending", "1");
});

describe("runAlarm", () => {
  it("토큰이 없으면 Firestore를 읽지 않고 알람도 걸지 않는다", async () => {
    store.deleteToken("tok-a");
    expect(await runAlarm(deps())).toBeNull();
    expect(firestore.queryUpcomingTodos).not.toHaveBeenCalled();
    expect(firestore.getTodo).not.toHaveBeenCalled();
  });

  it("refreshPending이면 재계산하고 다음 알람은 가장 이른 fireAt", async () => {
    const next = await runAlarm(deps());
    expect(firestore.queryUpcomingTodos).toHaveBeenCalledWith("u1", iso(0), iso(8 * 24 * 60 * MIN));
    expect(next).toBe(NOW + 30 * MIN);
    expect(store.getMeta("refreshPending")).toBe("0");
    expect(store.getMeta("windowEnd")).toBe(String(NOW + WINDOW_MS));
  });

  it("예약이 없으면 windowEnd에 알람을 건다(창이 끝나면 다시 계산)", async () => {
    db.clear();
    expect(await runAlarm(deps())).toBe(NOW + WINDOW_MS);
  });

  it("windowEnd가 지나면 pending이 아니어도 재계산한다", async () => {
    store.setMeta("refreshPending", "0");
    store.setMeta("windowEnd", String(NOW - 1));
    await runAlarm(deps());
    expect(firestore.queryUpcomingTodos).toHaveBeenCalledTimes(1);
  });

  it("재계산 조회가 실패하면 pending을 유지한 채 throw(알람 재시도)", async () => {
    vi.mocked(firestore.queryUpcomingTodos).mockRejectedValueOnce(new Error("503"));
    await expect(runAlarm(deps())).rejects.toThrow("503");
    expect(store.getMeta("refreshPending")).toBe("1");
  });

  it("시각이 된 예약을 재조회 후 모든 토큰으로 보내고 sent에 기록한다", async () => {
    store.upsertToken("tok-b", "web", NOW);
    await runAlarm(deps()); // 예약 생성
    now = NOW + 30 * MIN;
    await runAlarm(deps());

    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(sendPush.mock.calls.map(([m]) => m.token).sort()).toEqual(["tok-a", "tok-b"]);
    expect(sendPush.mock.calls[0][0]).toMatchObject({
      title: "보고서",
      body: "30분 후 마감이에요",
      link: "https://app.example.com/todo/t1",
      todoId: "t1",
    });
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);
    expect(store.nextFireAt()).toBeNull();
  });

  // Review Focus 3: 다른 기기에서 옮기거나 완료했는데 이 사용자의 refresh가 안 온 경우.
  it.each([
    ["마감이 바뀌었으면", () => db.set("t1", todo({ dueAt: iso(3 * 60 * MIN) }))],
    ["완료됐으면", () => db.set("t1", todo({ status: "done" }))],
    ["삭제됐으면", () => db.delete("t1")],
  ])("%s 옛 예약으로 보내지 않는다", async (_label, mutate) => {
    await runAlarm(deps());
    mutate();
    now = NOW + 30 * MIN;
    await runAlarm(deps());
    expect(sendPush).not.toHaveBeenCalled();
    expect(store.dueEntries(now)).toEqual([]);
  });

  it("무효 토큰은 지우고 나머지 기기로는 보낸다", async () => {
    store.upsertToken("tok-dead", "web", NOW);
    sendPush.mockImplementation(async (m) => (m.token === "tok-dead" ? "invalidToken" : "sent"));
    await runAlarm(deps());
    now = NOW + 30 * MIN;
    await runAlarm(deps());
    expect(store.listTokens()).toEqual(["tok-a"]);
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);
  });

  // Review Focus 4
  it("한 기기라도 성공하면 다른 기기의 일시 실패로 재시도하지 않는다(중복 방지)", async () => {
    store.upsertToken("tok-flaky", "web", NOW);
    sendPush.mockImplementation(async (m) => {
      if (m.token === "tok-flaky") throw new TransientFcmError(503);
      return "sent";
    });
    await runAlarm(deps());
    now = NOW + 30 * MIN;
    await runAlarm(deps()); // throw하지 않아야 한다(재시도 안 함)
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);
    expect(store.dueEntries(now)).toEqual([]);
  });

  it("모든 기기가 일시 실패면 sent에 기록하지 않고 throw(재시도)", async () => {
    sendPush.mockRejectedValue(new TransientFcmError(503));
    await runAlarm(deps());
    now = NOW + 30 * MIN;
    await expect(runAlarm(deps())).rejects.toBeInstanceOf(TransientFcmError);
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(false);
    expect(store.dueEntries(now)).toHaveLength(1);
  });

  it("이미 보낸 예약은 다시 보내지 않는다", async () => {
    await runAlarm(deps());
    store.markSent("t1", NOW + 30 * MIN, Date.parse(iso(60 * MIN)));
    now = NOW + 30 * MIN;
    await runAlarm(deps());
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("마감 하루가 지난 sent 기록은 정리한다", async () => {
    store.markSent("old", 1, NOW - 25 * 60 * MIN);
    await runAlarm(deps());
    expect(store.isSent("old", 1)).toBe(false);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/alarmRunner.test.ts`
Expected: FAIL — `Failed to resolve import "../alarmRunner"`

- [ ] **Step 4: 구현**

```ts
// reminder-proxy/src/alarmRunner.ts
import { reminderBody } from "@tododo/core/dist/reminders/index.js";
import type { FirestoreClient } from "./firestore";
import { TransientFcmError, type PushMessage, type SendResult } from "./fcm";
import { computeSchedule, shouldSend, QUERY_SPAN_MS, WINDOW_MS, type ScheduleEntry } from "./schedule";
import type { ReminderStore } from "./store";

const DAY = 24 * 60 * 60_000;

export interface AlarmDeps {
  store: ReminderStore;
  now: () => number;
  uid: string;
  firestore: Pick<FirestoreClient, "queryUpcomingTodos" | "getTodo" | "getReminderDefault">;
  sendPush: (message: PushMessage) => Promise<SendResult>;
  appUrl: string;
}

/** Firestore에서 창 안의 할 일과 기본값을 읽어 예약표를 통째로 교체한다.
 *  조회가 성공한 뒤에만 pending을 내린다 — 실패하면 알람 재시도가 다시 계산한다. */
export const refreshSchedule = async (deps: AlarmDeps, now: number): Promise<void> => {
  const [todos, userDefault] = await Promise.all([
    deps.firestore.queryUpcomingTodos(
      deps.uid,
      new Date(now).toISOString(),
      new Date(now + QUERY_SPAN_MS).toISOString(),
    ),
    deps.firestore.getReminderDefault(deps.uid),
  ]);
  deps.store.replaceSchedule(computeSchedule(todos, userDefault, now));
  deps.store.setMeta("windowEnd", String(now + WINDOW_MS));
  deps.store.setMeta("refreshPending", "0");
};

/**
 * 모든 토큰으로 보낸다. 무효 토큰은 지운다. 한 기기라도 받았으면 성공으로 보고
 * 나머지의 일시 실패는 로그만 남긴다 — 재시도하면 받은 기기에 중복으로 가기 때문이다.
 * 아무 기기도 받지 못했고 일시 실패가 있었으면 throw해서 알람 재시도에 맡긴다.
 */
const deliver = async (deps: AlarmDeps, entry: ScheduleEntry, title: string): Promise<void> => {
  let delivered = 0;
  let transient: unknown = null;
  for (const token of deps.store.listTokens()) {
    try {
      const result = await deps.sendPush({
        token,
        title,
        body: reminderBody(entry.offsetMinutes),
        link: `${deps.appUrl}/todo/${encodeURIComponent(entry.todoId)}`,
        todoId: entry.todoId,
      });
      if (result === "invalidToken") deps.store.deleteToken(token);
      else delivered += 1;
    } catch (error) {
      if (!(error instanceof TransientFcmError)) throw error;
      console.error(`FCM 일시 실패 (todo ${entry.todoId}):`, error);
      transient = error;
    }
  }
  if (delivered === 0 && transient) throw transient;
};

/** 알람 1회 처리. 반환값은 다음 알람 시각(걸 필요 없으면 null). */
export const runAlarm = async (deps: AlarmDeps): Promise<number | null> => {
  const { store } = deps;
  const now = deps.now();

  // 알림을 켠 기기가 없으면 아무것도 읽지 않는다(무료 한도 보호).
  if (store.listTokens().length === 0) {
    store.replaceSchedule([]);
    store.setMeta("refreshPending", "0");
    return null;
  }

  const windowEnd = Number(store.getMeta("windowEnd") ?? 0);
  if (store.getMeta("refreshPending") === "1" || now >= windowEnd) {
    await refreshSchedule(deps, now);
  }

  for (const entry of store.dueEntries(now)) {
    if (!store.isSent(entry.todoId, entry.fireAt)) {
      const current = await deps.firestore.getTodo(deps.uid, entry.todoId);
      const decision = shouldSend(entry, current, now);
      if (decision.send && current) {
        await deliver(deps, entry, current.title);
        store.markSent(entry.todoId, entry.fireAt, Date.parse(entry.dueAt));
      }
    }
    store.deleteEntry(entry.todoId);
  }

  store.pruneSent(now - DAY);

  const nextFire = store.nextFireAt();
  const nextWindowEnd = Number(store.getMeta("windowEnd"));
  return nextFire === null ? nextWindowEnd : Math.min(nextFire, nextWindowEnd);
};
```

- [ ] **Step 5: 통과 확인**

Run: `cd reminder-proxy && npx vitest run`
Expected: 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add reminder-proxy/src/store.ts reminder-proxy/src/alarmRunner.ts reminder-proxy/src/__tests__/memoryStore.ts reminder-proxy/src/__tests__/alarmRunner.test.ts
git commit -m "feat(reminder-proxy): 알람 처리(재계산·발송 직전 재확인·중복 방지)와 SQLite 저장소

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Durable Object와 라우터(`scheduler.ts`, `router.ts`, `index.ts`)

**Files:**
- Create: `reminder-proxy/src/scheduler.ts`
- Create: `reminder-proxy/src/router.ts`
- Create: `reminder-proxy/src/index.ts`
- Test: `reminder-proxy/src/__tests__/router.test.ts`

**Interfaces:**
- Consumes: Task 3 `GoogleTokenProvider`, `parseServiceAccount`; Task 4 `FirestoreClient`; Task 5 `sendPush`; Task 6 `SqliteReminderStore`, `runAlarm`
- Produces (클라이언트 계약):
  - `POST /push-tokens` `{ token: string(1~4096자), platform: "web" }` → 204
  - `DELETE /push-tokens` `{ token: string }` → 204
  - `POST /reminders/refresh` → 202
  - 인증 실패 401 `{ error: "UNAUTHORIZED" }`, 입력 오류 400 `{ error: "INVALID_INPUT" }`
  - DO RPC: `registerToken(uid, token, platform)`, `unregisterToken(uid, token)`, `requestRefresh(uid)`
  - `handleRequest(request: Request, env: Env): Promise<Response>` (router.ts)

- [ ] **Step 1: 실패하는 라우터 테스트 작성**

```ts
// reminder-proxy/src/__tests__/router.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRequest } from "../router";
import type { Env } from "../env";

vi.mock("@tododo/worker-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tododo/worker-auth")>()),
  verifyFirebaseIdToken: vi.fn(),
}));
import { verifyFirebaseIdToken } from "@tododo/worker-auth";

const stub = {
  registerToken: vi.fn(async () => {}),
  unregisterToken: vi.fn(async () => {}),
  requestRefresh: vi.fn(async () => {}),
};
const env = {
  REMINDER_SCHEDULER: {
    idFromName: vi.fn((name: string) => `id:${name}`),
    get: vi.fn(() => stub),
  },
  FIREBASE_PROJECT_ID: "tododo-test",
  CLIENT_APP_URL: "https://app.example.com",
  GOOGLE_SERVICE_ACCOUNT: "{}",
} as unknown as Env;

const req = (method: string, path: string, body?: unknown, origin = "https://app.example.com") =>
  new Request(`https://reminder.example.com${path}`, {
    method,
    headers: { Authorization: "Bearer valid", "Content-Type": "application/json", Origin: origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: "u1", premium: false });
});

describe("handleRequest", () => {
  it("POST /push-tokens → uid의 DO에 등록, 204 + CORS", async () => {
    const res = await handleRequest(req("POST", "/push-tokens", { token: "tok", platform: "web" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    expect(env.REMINDER_SCHEDULER.idFromName).toHaveBeenCalledWith("u1");
    expect(stub.registerToken).toHaveBeenCalledWith("u1", "tok", "web");
  });

  it("DELETE /push-tokens → 해제 204", async () => {
    const res = await handleRequest(req("DELETE", "/push-tokens", { token: "tok" }), env);
    expect(res.status).toBe(204);
    expect(stub.unregisterToken).toHaveBeenCalledWith("u1", "tok");
  });

  it("POST /reminders/refresh → 202", async () => {
    const res = await handleRequest(req("POST", "/reminders/refresh"), env);
    expect(res.status).toBe(202);
    expect(stub.requestRefresh).toHaveBeenCalledWith("u1");
  });

  it("프리미엄이 아니어도 된다(무료 기능)", async () => {
    const res = await handleRequest(req("POST", "/reminders/refresh"), env);
    expect(res.status).toBe(202);
  });

  it("토큰이 무효면 401, DO를 건드리지 않는다", async () => {
    vi.mocked(verifyFirebaseIdToken).mockRejectedValueOnce(new Error("bad"));
    const res = await handleRequest(req("POST", "/reminders/refresh"), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(stub.requestRefresh).not.toHaveBeenCalled();
  });

  it.each([
    [{ platform: "web" }],
    [{ token: "", platform: "web" }],
    [{ token: "x".repeat(4097), platform: "web" }],
    [{ token: "tok", platform: "ios" }],
    ["not json"],
  ])("잘못된 등록 본문 %j → 400", async (body) => {
    const res = await handleRequest(req("POST", "/push-tokens", body), env);
    expect(res.status).toBe(400);
    expect(stub.registerToken).not.toHaveBeenCalled();
  });

  it("OPTIONS preflight는 인증 없이 204, DELETE 허용", async () => {
    const res = await handleRequest(
      new Request("https://reminder.example.com/push-tokens", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("DELETE");
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it("모르는 경로는 404, 허용 안 된 origin엔 CORS 헤더 없음", async () => {
    const res = await handleRequest(req("GET", "/nope", undefined, "https://evil.example.com"), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("DO 호출이 터지면 CORS가 붙은 500", async () => {
    stub.requestRefresh.mockRejectedValueOnce(new Error("boom"));
    const res = await handleRequest(req("POST", "/reminders/refresh"), env);
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd reminder-proxy && npx vitest run src/__tests__/router.test.ts`
Expected: FAIL — `Failed to resolve import "../router"`

- [ ] **Step 3: 라우터 구현**

```ts
// reminder-proxy/src/router.ts
import { isAllowedOrigin, verifyFirebaseIdToken } from "@tododo/worker-auth";
import type { Env } from "./env";

const MAX_TOKEN_LENGTH = 4096;
const PLATFORMS = new Set(["web"]);

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const withCors = (response: Response, origin: string | null, env: Env): Response => {
  const headers = new Headers(response.headers);
  if (isAllowedOrigin(origin, env)) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
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

const readToken = async (request: Request): Promise<{ token: string; platform: unknown } | null> => {
  const body = (await request.json().catch(() => null)) as { token?: unknown; platform?: unknown } | null;
  if (!body || typeof body.token !== "string") return null;
  if (body.token.length === 0 || body.token.length > MAX_TOKEN_LENGTH) return null;
  return { token: body.token, platform: body.platform };
};

const route = async (request: Request, env: Env, path: string): Promise<Response> => {
  const isTokens = path === "/push-tokens" && (request.method === "POST" || request.method === "DELETE");
  const isRefresh = path === "/reminders/refresh" && request.method === "POST";
  if (!isTokens && !isRefresh) return new Response("Not Found", { status: 404 });

  const uid = await authenticate(request, env);
  if (!uid) return json({ error: "UNAUTHORIZED" }, 401);
  const scheduler = env.REMINDER_SCHEDULER.get(env.REMINDER_SCHEDULER.idFromName(uid));

  if (isRefresh) {
    await scheduler.requestRefresh(uid);
    return new Response(null, { status: 202 });
  }

  const input = await readToken(request);
  if (!input) return json({ error: "INVALID_INPUT" }, 400);
  if (request.method === "DELETE") {
    await scheduler.unregisterToken(uid, input.token);
    return new Response(null, { status: 204 });
  }
  if (typeof input.platform !== "string" || !PLATFORMS.has(input.platform)) {
    return json({ error: "INVALID_INPUT" }, 400);
  }
  await scheduler.registerToken(uid, input.token, input.platform);
  return new Response(null, { status: 204 });
};

export const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  try {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), origin, env);
    return withCors(await route(request, env, url.pathname), origin, env);
  } catch (error) {
    // 다른 Worker와 같은 이유: CORS 없이 죽으면 브라우저엔 CORS 에러로만 보여 원인이 가려진다.
    console.error(`처리되지 않은 예외 (${url.pathname}):`, error);
    return withCors(new Response("Internal Server Error", { status: 500 }), origin, env);
  }
};
```

- [ ] **Step 4: DO와 엔트리 구현**

```ts
// reminder-proxy/src/scheduler.ts
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { runAlarm } from "./alarmRunner";
import { sendPush } from "./fcm";
import { FirestoreClient } from "./firestore";
import { GoogleTokenProvider, parseServiceAccount } from "./googleAuth";
import { SqliteReminderStore } from "./store";

/** refresh 신호를 이만큼 모았다가 한 번에 재계산한다. */
const REFRESH_DEBOUNCE_MS = 5_000;

/**
 * 사용자(uid)당 1개. 로직은 alarmRunner(테스트됨)에 있고 여기는 DO API와 이어주는 얇은 어댑터다.
 * DO는 단일 스레드라 같은 사용자의 알람 처리가 동시에 돌지 않는다.
 */
export class ReminderScheduler extends DurableObject<Env> {
  private readonly store: SqliteReminderStore;
  private tokenProvider: GoogleTokenProvider | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqliteReminderStore(ctx.storage.sql);
  }

  async registerToken(uid: string, token: string, platform: string): Promise<void> {
    this.store.setMeta("uid", uid);
    this.store.upsertToken(token, platform, Date.now());
    await this.requestRefresh(uid);
  }

  async unregisterToken(uid: string, token: string): Promise<void> {
    this.store.setMeta("uid", uid);
    this.store.deleteToken(token);
  }

  async requestRefresh(uid: string): Promise<void> {
    this.store.setMeta("uid", uid);
    // 알림을 켠 기기가 없으면 알람조차 걸지 않는다(DO 쓰기·Firestore 읽기 0).
    if (this.store.listTokens().length === 0) return;
    this.store.setMeta("refreshPending", "1");
    const target = Date.now() + REFRESH_DEBOUNCE_MS;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > target) await this.ctx.storage.setAlarm(target);
  }

  async alarm(): Promise<void> {
    const uid = this.store.getMeta("uid");
    if (!uid) return;
    const tokenProvider = this.getTokenProvider();
    const firestore = new FirestoreClient(this.env.FIREBASE_PROJECT_ID, () => tokenProvider.getToken());
    const next = await runAlarm({
      store: this.store,
      now: Date.now,
      uid,
      firestore,
      sendPush: async (message) =>
        sendPush(this.env.FIREBASE_PROJECT_ID, await tokenProvider.getToken(), message),
      appUrl: this.env.CLIENT_APP_URL,
    });
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  private getTokenProvider(): GoogleTokenProvider {
    this.tokenProvider ??= new GoogleTokenProvider(parseServiceAccount(this.env.GOOGLE_SERVICE_ACCOUNT));
    return this.tokenProvider;
  }
}
```

```ts
// reminder-proxy/src/index.ts
import type { Env } from "./env";
import { handleRequest } from "./router";

export { ReminderScheduler } from "./scheduler";

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env),
};
```

- [ ] **Step 5: 테스트·타입체크·번들 확인**

Run: `cd reminder-proxy && npx vitest run && npm run typecheck`
Expected: 전체 PASS, 타입 에러 없음

Run: `cd reminder-proxy && npx wrangler deploy --dry-run --outdir /tmp/reminder-proxy-dry`
Expected: `--dry-run: exiting now.`로 끝나고 에러 없음(DO 바인딩·마이그레이션·import 해석 확인)

Run: `ls reminder-proxy/node_modules | grep -c '^firebase$' || true`
Expected: 0이 아니어도 괜찮다(core의 peer 설치). 번들엔 안 들어가는지 확인: `grep -c "firebase/firestore" /tmp/reminder-proxy-dry/index.js` → `0`

- [ ] **Step 6: 커밋**

```bash
git add reminder-proxy/src/scheduler.ts reminder-proxy/src/router.ts reminder-proxy/src/index.ts reminder-proxy/src/__tests__/router.test.ts
git commit -m "feat(reminder-proxy): ReminderScheduler DO와 토큰 등록/해제·refresh 엔드포인트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Firestore 규칙·색인과 클라이언트 설정·Worker API

**Files:**
- Modify: `firestore.rules` (`calendarIntegrations` 블록 뒤)
- Modify: `firestore.indexes.json`
- Modify: `client/.env.example`
- Create: `client/src/features/reminders/api/reminderProxyApi.ts`
- Create: `client/src/features/reminders/api/reminderSettingsApi.ts`
- Create: `client/src/features/reminders/hooks/useReminderSettings.ts`
- Create: `client/src/features/reminders/utils/reminderChoice.ts`
- Create: `client/src/features/reminders/index.ts`
- Test: `client/src/features/reminders/api/__tests__/reminderProxyApi.test.ts`
- Test: `client/src/features/reminders/hooks/__tests__/useReminderSettings.test.tsx`
- Test: `client/src/features/reminders/utils/__tests__/reminderChoice.test.ts`

**Interfaces:**
- Consumes: Task 1 core 모듈, Task 7 엔드포인트 계약
- Produces:
  - `registerPushToken(token: string): Promise<void>`, `unregisterPushToken(token: string): Promise<void>`, `requestReminderRefresh(): Promise<void>` — `VITE_REMINDER_PROXY_URL`이 비어 있으면 아무것도 안 하고 resolve
  - `getReminderDefault(uid: string): Promise<ReminderSetting>`, `setReminderDefault(uid: string, setting: ReminderSetting): Promise<void>`
  - `useReminderDefault(): UseQueryResult<ReminderSetting>` (queryKey `["reminderSettings", uid]`)
  - `useSetReminderDefault(): UseMutationResult<void, Error, ReminderSetting>` (성공 시 캐시 갱신 + refresh 신호)
  - `REMINDER_SETTING_OPTIONS: { value: string; label: string }[]` ("off" + 오프셋 5개)
  - `toReminderChoice(value: unknown): string` ("default" | "off" | "0" | "10" | ...)
  - `parseReminderSetting(value: string | undefined): ReminderSetting | null` ("default"/빈 값/이상한 값 → null)

- [ ] **Step 1: 규칙·색인·env**

`firestore.rules`의 `calendarIntegrations` 블록 바로 뒤에 추가:

```
    match /userSettings/{userId} {
      // 마감 알림 기본값. reminder-proxy는 서비스 계정(규칙 우회)으로 읽는다.
      allow read, delete: if request.auth != null && request.auth.uid == userId;
      allow create, update: if request.auth != null && request.auth.uid == userId
                            && request.resource.data.keys().hasOnly(["reminderDefaultOffsetMinutes"])
                            && (request.resource.data.reminderDefaultOffsetMinutes == "off"
                                || request.resource.data.reminderDefaultOffsetMinutes in [0, 10, 30, 60, 1440]);
    }
```

`firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "todos",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "dueAt", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

`client/.env.example` 끝에 추가:

```
# 마감 알림 Worker(reminder-proxy) URL. 비어 있으면 알림 신호를 보내지 않는다.
VITE_REMINDER_PROXY_URL=
# Firebase 콘솔 > 프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서의 키 쌍(공개키)
VITE_FIREBASE_VAPID_KEY=
```

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// client/src/features/reminders/utils/__tests__/reminderChoice.test.ts
import { describe, it, expect } from "vitest";
import { REMINDER_SETTING_OPTIONS, parseReminderSetting, toReminderChoice } from "../reminderChoice";

describe("reminderChoice", () => {
  it("옵션은 알림 없음 + 오프셋 5개", () => {
    expect(REMINDER_SETTING_OPTIONS).toEqual([
      { value: "off", label: "알림 없음" },
      { value: "0", label: "정각" },
      { value: "10", label: "10분 전" },
      { value: "30", label: "30분 전" },
      { value: "60", label: "1시간 전" },
      { value: "1440", label: "하루 전" },
    ]);
  });

  it("toReminderChoice: 없음/null/이상한 값은 default", () => {
    expect(toReminderChoice(undefined)).toBe("default");
    expect(toReminderChoice(null)).toBe("default");
    expect(toReminderChoice(7)).toBe("default");
    expect(toReminderChoice("off")).toBe("off");
    expect(toReminderChoice(60)).toBe("60");
  });

  it("parseReminderSetting: default와 이상한 값은 null", () => {
    expect(parseReminderSetting("default")).toBeNull();
    expect(parseReminderSetting(undefined)).toBeNull();
    expect(parseReminderSetting("")).toBeNull();
    expect(parseReminderSetting("7")).toBeNull();
    expect(parseReminderSetting("off")).toBe("off");
    expect(parseReminderSetting("0")).toBe(0);
    expect(parseReminderSetting("1440")).toBe(1440);
  });
});
```

```ts
// client/src/features/reminders/api/__tests__/reminderProxyApi.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { authorizedFetchMock } = vi.hoisted(() => ({ authorizedFetchMock: vi.fn() }));
vi.mock("@/shared/lib/authorizedFetch", () => ({ authorizedFetch: authorizedFetchMock }));

const load = async (url: string) => {
  vi.stubEnv("VITE_REMINDER_PROXY_URL", url);
  vi.resetModules();
  return import("../reminderProxyApi");
};

beforeEach(() => authorizedFetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 })));
afterEach(() => vi.unstubAllEnvs());

describe("reminderProxyApi", () => {
  it("토큰 등록은 POST /push-tokens {token, platform: web}", async () => {
    const api = await load("https://r.example.com");
    await api.registerPushToken("tok");
    expect(authorizedFetchMock).toHaveBeenCalledWith("https://r.example.com", "/push-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tok", platform: "web" }),
    });
  });

  it("토큰 해제는 DELETE /push-tokens {token}", async () => {
    const api = await load("https://r.example.com");
    await api.unregisterPushToken("tok");
    expect(authorizedFetchMock.mock.calls[0][2]).toMatchObject({
      method: "DELETE",
      body: JSON.stringify({ token: "tok" }),
    });
  });

  it("refresh는 POST /reminders/refresh, 실패 응답이면 throw", async () => {
    const api = await load("https://r.example.com");
    authorizedFetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(api.requestReminderRefresh()).rejects.toThrow("500");
    expect(authorizedFetchMock.mock.calls[0][1]).toBe("/reminders/refresh");
  });

  it("URL이 설정되지 않았으면 아무것도 보내지 않는다(로컬 개발)", async () => {
    const api = await load("");
    await api.requestReminderRefresh();
    await api.registerPushToken("tok");
    expect(authorizedFetchMock).not.toHaveBeenCalled();
  });
});
```

```tsx
// client/src/features/reminders/hooks/__tests__/useReminderSettings.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "user-1" } } }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
const { getDocMock, setDocMock } = vi.hoisted(() => ({ getDocMock: vi.fn(), setDocMock: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, col, id) => ({ path: `${col}/${id}` })),
  getDoc: getDocMock,
  setDoc: setDocMock,
}));
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("../../api/reminderProxyApi", () => ({ requestReminderRefresh: refreshMock }));

import { useReminderDefault, useSetReminderDefault } from "../useReminderSettings";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  getDocMock.mockReset();
  setDocMock.mockReset().mockResolvedValue(undefined);
  refreshMock.mockReset().mockResolvedValue(undefined);
});

describe("useReminderDefault", () => {
  it("문서가 없으면 30분", async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    const { result } = renderHook(() => useReminderDefault(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBe(30));
  });

  it("저장된 값을 읽고, 이상한 값이면 30분", async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => true, data: () => ({ reminderDefaultOffsetMinutes: "off" }) });
    const { result } = renderHook(() => useReminderDefault(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBe("off"));

    getDocMock.mockResolvedValueOnce({ exists: () => true, data: () => ({ reminderDefaultOffsetMinutes: 7 }) });
    const { result: r2 } = renderHook(() => useReminderDefault(), { wrapper: wrapper() });
    await waitFor(() => expect(r2.current.data).toBe(30));
  });
});

describe("useSetReminderDefault", () => {
  it("userSettings/{uid}에 쓰고 refresh 신호를 보낸다", async () => {
    const { result } = renderHook(() => useSetReminderDefault(), { wrapper: wrapper() });
    await act(() => result.current.mutateAsync(60));
    expect(setDocMock).toHaveBeenCalledWith({ path: "userSettings/user-1" }, { reminderDefaultOffsetMinutes: 60 });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd client && npx vitest run src/features/reminders`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현**

```ts
// client/src/features/reminders/utils/reminderChoice.ts
import {
  REMINDER_OFFSETS,
  isReminderSetting,
  reminderSettingLabel,
  type ReminderSetting,
} from "@tododo/core/dist/reminders/index.js";

/** 설정 select 옵션(기본값 선택지 없음). 할 일 폼은 앞에 "default"를 따로 붙인다. */
export const REMINDER_SETTING_OPTIONS: { value: string; label: string }[] = [
  { value: "off", label: reminderSettingLabel("off") },
  ...REMINDER_OFFSETS.map((offset) => ({ value: String(offset), label: reminderSettingLabel(offset) })),
];

/** 저장된 값 → select 값. 없음/null/이상한 값은 "default". */
export const toReminderChoice = (value: unknown): string =>
  isReminderSetting(value) ? String(value) : "default";

/** select 값 → 저장할 값. "default"와 이상한 값은 null(= 사용자 기본값을 따름). */
export const parseReminderSetting = (value: string | undefined): ReminderSetting | null => {
  if (value === "off") return "off";
  if (value === undefined || value === "" || value === "default") return null;
  const n = Number(value);
  return isReminderSetting(n) ? n : null;
};
```

```ts
// client/src/features/reminders/api/reminderProxyApi.ts
import { authorizedFetch } from "@/shared/lib/authorizedFetch";

const REMINDER_PROXY_URL = (import.meta.env.VITE_REMINDER_PROXY_URL as string | undefined) ?? "";

/** URL이 없으면(로컬 개발 등) 조용히 건너뛴다 — 안 그러면 할 일을 바꿀 때마다 에러가 Sentry로 간다. */
const call = async (path: string, init: RequestInit): Promise<void> => {
  if (!REMINDER_PROXY_URL) return;
  const res = await authorizedFetch(REMINDER_PROXY_URL, path, init);
  if (!res.ok) throw new Error(`reminder-proxy ${path} 실패: ${res.status}`);
};

export const registerPushToken = (token: string): Promise<void> =>
  call("/push-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: "web" }),
  });

export const unregisterPushToken = (token: string): Promise<void> =>
  call("/push-tokens", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

export const requestReminderRefresh = (): Promise<void> => call("/reminders/refresh", { method: "POST" });
```

```ts
// client/src/features/reminders/api/reminderSettingsApi.ts
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import {
  DEFAULT_REMINDER_SETTING,
  isReminderSetting,
  type ReminderSetting,
} from "@tododo/core/dist/reminders/index.js";

export const getReminderDefault = async (uid: string): Promise<ReminderSetting> => {
  const snap = await getDoc(doc(db, "userSettings", uid));
  const value = snap.exists() ? snap.data().reminderDefaultOffsetMinutes : undefined;
  return isReminderSetting(value) ? value : DEFAULT_REMINDER_SETTING;
};

export const setReminderDefault = (uid: string, setting: ReminderSetting): Promise<void> =>
  setDoc(doc(db, "userSettings", uid), { reminderDefaultOffsetMinutes: setting });
```

```ts
// client/src/features/reminders/hooks/useReminderSettings.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import type { ReminderSetting } from "@tododo/core/dist/reminders/index.js";
import { auth } from "@/shared/lib/firebase";
import { getReminderDefault, setReminderDefault } from "../api/reminderSettingsApi";
import { requestReminderRefresh } from "../api/reminderProxyApi";

const settingsKey = (uid: string | undefined) => ["reminderSettings", uid] as const;

export const useReminderDefault = () => {
  const uid = auth.currentUser?.uid;
  return useQuery({
    queryKey: settingsKey(uid),
    queryFn: () => getReminderDefault(uid as string),
    enabled: !!uid,
  });
};

export const useSetReminderDefault = () => {
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid;
  return useMutation({
    mutationFn: (setting: ReminderSetting) => {
      if (!uid) throw new Error("Not authenticated");
      return setReminderDefault(uid, setting);
    },
    onSuccess: (_data, setting) => {
      queryClient.setQueryData(settingsKey(uid), setting);
      // 기본값이 바뀌면 예약 전체가 바뀐다. 실패해도 다음 할 일 변경 때 다시 신호가 간다.
      requestReminderRefresh().catch((error) => Sentry.captureException(error));
    },
  });
};
```

```ts
// client/src/features/reminders/index.ts
export { useReminderDefault, useSetReminderDefault } from "./hooks/useReminderSettings";
export { REMINDER_SETTING_OPTIONS, parseReminderSetting, toReminderChoice } from "./utils/reminderChoice";
```

- [ ] **Step 5: 통과 확인**

Run: `cd client && npx vitest run src/features/reminders && npx tsc -b`
Expected: PASS, 타입 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add firestore.rules firestore.indexes.json client/.env.example client/src/features/reminders
git commit -m "feat(reminders): userSettings 규칙·dueAt 색인과 알림 기본값/Worker API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 푸시 클라이언트와 서비스 워커

**Files:**
- Create: `client/public/firebase-messaging-sw.js`
- Create: `client/src/features/reminders/push/pushSupport.ts`
- Create: `client/src/features/reminders/push/pushClient.ts`
- Test: `client/src/features/reminders/push/__tests__/pushClient.test.ts`
- Modify: `client/src/features/reminders/index.ts`

**Interfaces:**
- Consumes: Task 8 `registerPushToken`, `unregisterPushToken`
- Produces:
  - `type PushPermission = NotificationPermission | "unsupported"`
  - `isPushSupported(): boolean`, `getPushPermission(): PushPermission`
  - `enablePushOnThisDevice(): Promise<PushPermission>` — 권한 요청, 허용되면 토큰 등록
  - `syncPushToken(): Promise<void>` — 권한이 granted일 때만 토큰을 받아 등록(멱등)
  - `disablePushOnThisDevice(): Promise<void>` — granted일 때 Worker 해제 + `deleteToken`
  - `subscribeForegroundMessages(handler: (m: { title: string; body: string }) => void): Promise<() => void>`

- [ ] **Step 1: 서비스 워커**

```js
// client/public/firebase-messaging-sw.js
/* 마감 알림 백그라운드 수신. 탭이 닫혀 있어도 브라우저가 이 워커를 깨워 알림을 띄운다.
 * FCM 메시지에 notification + webpush.fcm_options.link가 있으면 SDK가 표시와 클릭 이동을
 * 처리한다. public 파일이라 import.meta.env를 못 쓰므로 Firebase 설정은 등록 URL의
 * 쿼리스트링으로 받는다(pushClient.ts의 serviceWorkerUrl). 버전은 client의 firebase와 맞춘다. */
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});
firebase.messaging();
```

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// client/src/features/reminders/push/__tests__/pushClient.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  getMessaging: vi.fn(() => ({ id: "messaging" })),
  getToken: vi.fn(async () => "fcm-token"),
  deleteToken: vi.fn(async () => true),
  onMessage: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
}));
vi.mock("firebase/messaging", () => ({
  getMessaging: m.getMessaging,
  getToken: m.getToken,
  deleteToken: m.deleteToken,
  onMessage: m.onMessage,
}));
vi.mock("@/shared/lib/firebaseApp", () => ({ app: { name: "app" } }));
vi.mock("../../api/reminderProxyApi", () => ({
  registerPushToken: m.register,
  unregisterPushToken: m.unregister,
}));

import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getPushPermission,
  subscribeForegroundMessages,
  syncPushToken,
} from "../pushClient";

const registration = { scope: "/firebase-cloud-messaging-push-scope" };
const installPush = (permission: NotificationPermission, requestResult: NotificationPermission = permission) => {
  const NotificationStub = Object.assign(vi.fn(), {
    permission,
    requestPermission: vi.fn(async () => {
      NotificationStub.permission = requestResult;
      return requestResult;
    }),
  });
  vi.stubGlobal("Notification", NotificationStub);
  vi.stubGlobal("PushManager", vi.fn());
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn(async () => registration) },
  });
  return NotificationStub;
};

beforeEach(() => {
  vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "vapid");
  Object.values(m).forEach((fn) => fn.mockClear());
  m.register.mockResolvedValue(undefined);
  m.unregister.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // @ts-expect-error 테스트에서 설치한 속성 제거
  delete navigator.serviceWorker;
});

describe("getPushPermission", () => {
  it("PushManager가 없으면 unsupported(iOS 일반 브라우저)", () => {
    vi.stubGlobal("Notification", { permission: "default" });
    expect(getPushPermission()).toBe("unsupported");
  });

  it("지원하면 Notification.permission", () => {
    installPush("denied");
    expect(getPushPermission()).toBe("denied");
  });
});

describe("enablePushOnThisDevice", () => {
  it("허용되면 서비스 워커를 설정 쿼리와 함께 등록하고 토큰을 Worker에 등록한다", async () => {
    installPush("default", "granted");
    expect(await enablePushOnThisDevice()).toBe("granted");

    const [url, options] = vi.mocked(navigator.serviceWorker.register).mock.calls[0];
    expect(String(url)).toMatch(/^\/firebase-messaging-sw\.js\?/);
    expect(options).toEqual({ scope: "/firebase-cloud-messaging-push-scope" });
    expect(m.getToken).toHaveBeenCalledWith({ id: "messaging" }, {
      vapidKey: "vapid",
      serviceWorkerRegistration: registration,
    });
    expect(m.register).toHaveBeenCalledWith("fcm-token");
  });

  it("거절되면 토큰을 받지 않는다", async () => {
    installPush("default", "denied");
    expect(await enablePushOnThisDevice()).toBe("denied");
    expect(m.getToken).not.toHaveBeenCalled();
  });

  it("미지원이면 권한을 묻지 않는다", async () => {
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
    expect(await enablePushOnThisDevice()).toBe("unsupported");
  });
});

describe("syncPushToken", () => {
  it("granted가 아니면 아무것도 안 한다", async () => {
    installPush("default");
    await syncPushToken();
    expect(m.getToken).not.toHaveBeenCalled();
  });

  it("granted면 토큰을 다시 등록한다", async () => {
    installPush("granted");
    await syncPushToken();
    expect(m.register).toHaveBeenCalledWith("fcm-token");
  });
});

describe("disablePushOnThisDevice", () => {
  it("granted면 Worker에서 해제하고 FCM 토큰을 삭제한다", async () => {
    installPush("granted");
    await disablePushOnThisDevice();
    expect(m.unregister).toHaveBeenCalledWith("fcm-token");
    expect(m.deleteToken).toHaveBeenCalled();
  });

  it("granted가 아니면 아무것도 안 한다", async () => {
    installPush("denied");
    await disablePushOnThisDevice();
    expect(m.getToken).not.toHaveBeenCalled();
  });
});

describe("subscribeForegroundMessages", () => {
  it("granted면 onMessage로 받은 알림을 handler에 넘긴다", async () => {
    installPush("granted");
    const unsubscribe = vi.fn();
    m.onMessage.mockReturnValue(unsubscribe);
    const handler = vi.fn();
    const off = await subscribeForegroundMessages(handler);

    const listener = m.onMessage.mock.calls[0][1] as (p: unknown) => void;
    listener({ notification: { title: "보고서", body: "30분 후 마감이에요" } });
    expect(handler).toHaveBeenCalledWith({ title: "보고서", body: "30분 후 마감이에요" });
    off();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("granted가 아니면 구독하지 않는다", async () => {
    installPush("default");
    const off = await subscribeForegroundMessages(vi.fn());
    expect(m.onMessage).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd client && npx vitest run src/features/reminders/push`
Expected: FAIL — `Failed to resolve import "../pushClient"`

- [ ] **Step 4: 구현**

```ts
// client/src/features/reminders/push/pushSupport.ts
export type PushPermission = NotificationPermission | "unsupported";

/** iOS의 일반 브라우저(홈 화면 PWA가 아닌)는 PushManager가 없어 여기서 걸러진다. */
export const isPushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "PushManager" in window &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator;

export const getPushPermission = (): PushPermission =>
  isPushSupported() ? Notification.permission : "unsupported";
```

```ts
// client/src/features/reminders/push/pushClient.ts
import type { Messaging } from "firebase/messaging";
import { registerPushToken, unregisterPushToken } from "../api/reminderProxyApi";
import { getPushPermission, type PushPermission } from "./pushSupport";

export { getPushPermission, isPushSupported } from "./pushSupport";
export type { PushPermission } from "./pushSupport";

const SW_PATH = "/firebase-messaging-sw.js";
/** FCM SDK 기본 스코프. 앱 전체(/) 스코프를 차지하지 않아 다른 워커와 충돌하지 않는다. */
const SW_SCOPE = "/firebase-cloud-messaging-push-scope";

const serviceWorkerUrl = (): string => {
  const params = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  });
  return `${SW_PATH}?${params.toString()}`;
};

/** firebase/messaging은 여기서만 동적으로 불러온다(첫 화면 번들에 넣지 않는다). */
const loadMessaging = async (): Promise<{ messaging: Messaging; sdk: typeof import("firebase/messaging") }> => {
  const [sdk, { app }] = await Promise.all([import("firebase/messaging"), import("@/shared/lib/firebaseApp")]);
  return { messaging: sdk.getMessaging(app), sdk };
};

const getCurrentToken = async (): Promise<{ token: string; messaging: Messaging; sdk: typeof import("firebase/messaging") }> => {
  const { messaging, sdk } = await loadMessaging();
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), { scope: SW_SCOPE });
  const token = await sdk.getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  return { token, messaging, sdk };
};

/** 권한이 있으면 현재 토큰을 Worker에 등록한다. upsert라 여러 번 불러도 된다. */
export const syncPushToken = async (): Promise<void> => {
  if (getPushPermission() !== "granted") return;
  const { token } = await getCurrentToken();
  await registerPushToken(token);
};

export const enablePushOnThisDevice = async (): Promise<PushPermission> => {
  if (getPushPermission() === "unsupported") return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "granted") await syncPushToken();
  return permission;
};

/** 로그아웃 시: 이 브라우저가 다음 사용자에게 이전 계정의 알림을 받지 않게 한다. */
export const disablePushOnThisDevice = async (): Promise<void> => {
  if (getPushPermission() !== "granted") return;
  const { token, messaging, sdk } = await getCurrentToken();
  await unregisterPushToken(token);
  await sdk.deleteToken(messaging);
};

/** 탭이 포커스된 상태에서는 FCM이 알림을 자동 표시하지 않으므로 앱이 직접 보여준다. */
export const subscribeForegroundMessages = async (
  handler: (message: { title: string; body: string }) => void,
): Promise<() => void> => {
  if (getPushPermission() !== "granted") return () => {};
  const { messaging, sdk } = await loadMessaging();
  return sdk.onMessage(messaging, (payload) => {
    handler({ title: payload.notification?.title ?? "", body: payload.notification?.body ?? "" });
  });
};
```

`client/src/features/reminders/index.ts`에 추가:

```ts
export { getPushPermission, isPushSupported } from "./push/pushSupport";
export type { PushPermission } from "./push/pushSupport";
```

(`pushClient`는 배럴로 재수출하지 않는다 — 소비처가 필요할 때 동적 import하거나 직접 경로로 가져간다.)

- [ ] **Step 5: 통과 확인**

Run: `cd client && npx vitest run src/features/reminders && npx tsc -b`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add client/public/firebase-messaging-sw.js client/src/features/reminders
git commit -m "feat(reminders): 웹 푸시 권한·토큰 등록/해제와 백그라운드 서비스 워커

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 앱 전역 훅(refresh 신호·토큰 동기화·포그라운드 토스트)

**Files:**
- Create: `client/src/features/reminders/hooks/useReminderRefresh.ts`
- Create: `client/src/features/reminders/hooks/usePushTokenSync.ts`
- Create: `client/src/features/reminders/hooks/useForegroundReminders.ts`
- Test: `client/src/features/reminders/hooks/__tests__/useReminderRefresh.test.tsx`
- Test: `client/src/features/reminders/hooks/__tests__/useForegroundReminders.test.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: Task 8 `requestReminderRefresh`; Task 9 `syncPushToken`, `subscribeForegroundMessages`; `useGetTodos` (`@/features/todo/hooks`)
- Produces:
  - `buildReminderFingerprint(todos: Todo[]): string`
  - `REFRESH_DEBOUNCE_MS = 2000`
  - `useReminderRefresh(): void`, `usePushTokenSync(): void`, `useForegroundReminders(): void`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// client/src/features/reminders/hooks/__tests__/useReminderRefresh.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Todo } from "@/features/todo/types";

const { refreshMock, todosState } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  todosState: { data: undefined as Todo[] | undefined },
}));
vi.mock("../../api/reminderProxyApi", () => ({ requestReminderRefresh: refreshMock }));
vi.mock("@/features/todo/hooks", () => ({ useGetTodos: () => todosState }));
vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

import { buildReminderFingerprint, REFRESH_DEBOUNCE_MS, useReminderRefresh } from "../useReminderRefresh";

const todo = (o: Partial<Todo> = {}): Todo =>
  ({
    id: "t1",
    title: "보고서",
    status: "todo",
    dueAt: "2026-10-01T09:00:00.000Z",
    archived: false,
    ...o,
  }) as Todo;

beforeEach(() => {
  vi.useFakeTimers();
  refreshMock.mockReset().mockResolvedValue(undefined);
  todosState.data = undefined;
});
afterEach(() => vi.useRealTimers());

describe("buildReminderFingerprint", () => {
  it("마감 없는 할 일과 제목은 무시한다", () => {
    const a = buildReminderFingerprint([todo(), todo({ id: "t2", dueAt: null })]);
    const b = buildReminderFingerprint([todo({ title: "다른 제목" })]);
    expect(a).toBe(b);
  });

  it("dueAt·status·archived·reminderOffsetMinutes가 바뀌면 달라진다", () => {
    const base = buildReminderFingerprint([todo()]);
    for (const change of [
      { dueAt: "2026-10-02T09:00:00.000Z" },
      { status: "done" as const },
      { archived: true },
      { reminderOffsetMinutes: 60 as const },
    ]) {
      expect(buildReminderFingerprint([todo(change)])).not.toBe(base);
    }
  });

  it("순서와 무관하다", () => {
    const x = todo({ id: "a" });
    const y = todo({ id: "b" });
    expect(buildReminderFingerprint([x, y])).toBe(buildReminderFingerprint([y, x]));
  });
});

describe("useReminderRefresh", () => {
  it("todos가 로드되기 전엔 보내지 않는다", () => {
    renderHook(() => useReminderRefresh());
    act(() => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("첫 로드 때 디바운스 후 1회 보낸다(마감 있는 할 일이 없어도)", async () => {
    todosState.data = [];
    renderHook(() => useReminderRefresh());
    act(() => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS - 1));
    expect(refreshMock).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("연속 변경은 한 번으로 모으고, 제목만 바뀌면 보내지 않는다", async () => {
    todosState.data = [todo()];
    const { rerender } = renderHook(() => useReminderRefresh());
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).toHaveBeenCalledTimes(1);

    todosState.data = [todo({ title: "제목만" })];
    rerender();
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).toHaveBeenCalledTimes(1);

    todosState.data = [todo({ dueAt: "2026-10-02T09:00:00.000Z" })];
    rerender();
    act(() => vi.advanceTimersByTime(1000));
    todosState.data = [todo({ dueAt: "2026-10-03T09:00:00.000Z" })];
    rerender();
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("실패하면 같은 상태라도 다음 렌더에서 다시 보낸다", async () => {
    refreshMock.mockRejectedValueOnce(new Error("503"));
    todosState.data = [todo()];
    const { rerender } = renderHook(() => useReminderRefresh());
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    todosState.data = [todo()]; // 새 배열 참조, 같은 지문
    rerender();
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });
});
```

```tsx
// client/src/features/reminders/hooks/__tests__/useForegroundReminders.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { subscribeMock, infoMock } = vi.hoisted(() => ({ subscribeMock: vi.fn(), infoMock: vi.fn() }));
vi.mock("../../push/pushClient", () => ({ subscribeForegroundMessages: subscribeMock }));
vi.mock("@/shared/ui/toast/useToast", () => ({ useToast: () => ({ info: infoMock }) }));

import { useForegroundReminders } from "../useForegroundReminders";

describe("useForegroundReminders", () => {
  it("포그라운드 알림을 info 토스트로 보여주고 언마운트 시 구독 해제", async () => {
    const off = vi.fn();
    subscribeMock.mockImplementation(async (handler: (m: { title: string; body: string }) => void) => {
      handler({ title: "보고서", body: "30분 후 마감이에요" });
      return off;
    });
    const { unmount } = renderHook(() => useForegroundReminders());
    await waitFor(() => expect(infoMock).toHaveBeenCalledWith("보고서", "30분 후 마감이에요"));
    unmount();
    expect(off).toHaveBeenCalled();
  });
});
```


- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/reminders/hooks`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// client/src/features/reminders/hooks/useReminderRefresh.ts
import { useEffect, useMemo, useRef } from "react";
import * as Sentry from "@sentry/react";
// 배럴(@/features/todo)은 TodoList 등 컴포넌트까지 끌어온다. App 경로라 훅만 직접 가져온다.
import { useGetTodos } from "@/features/todo/hooks";
import type { Todo } from "@/features/todo/types";
import { requestReminderRefresh } from "../api/reminderProxyApi";

export const REFRESH_DEBOUNCE_MS = 2000;

/** 알림 예약에 영향을 주는 값만 담은 지문. 제목 변경 같은 무관한 수정은 신호를 보내지 않는다. */
export const buildReminderFingerprint = (todos: Todo[]): string =>
  todos
    .filter((t) => !!t.dueAt)
    .map((t) => [t.id, t.dueAt, t.status, t.archived ? 1 : 0, t.reminderOffsetMinutes ?? "default"].join("|"))
    .sort()
    .join(";");

/**
 * 캘린더 동기화(useSyncTodosToCalendar)와 같은 방식: 저장 경로마다 호출하지 않고
 * todos 캐시 변화를 관찰한다. 이 기기의 알림 권한과 무관하게 보낸다 — 다른 기기에서
 * 알림을 켰을 수 있고, 토큰이 없는 사용자의 신호는 DO가 조회 없이 끝낸다.
 */
export const useReminderRefresh = (): void => {
  const { data: todos } = useGetTodos();
  const lastSentRef = useRef<string | null>(null);
  const fingerprint = useMemo(() => (todos ? buildReminderFingerprint(todos) : null), [todos]);

  useEffect(() => {
    if (fingerprint === null || fingerprint === lastSentRef.current) return;
    const timer = setTimeout(() => {
      requestReminderRefresh()
        .then(() => {
          lastSentRef.current = fingerprint;
        })
        .catch((error) => {
          console.error("알림 예약 갱신 신호 실패:", error);
          Sentry.captureException(error);
        });
    }, REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [fingerprint, todos]);
};
```

(`todos`를 deps에 넣는 이유: 실패 뒤 같은 지문이라도 새 배열이 오면 다시 시도하게 하려는 것. 성공한 지문과 같으면 첫 줄에서 바로 빠진다.)

```ts
// client/src/features/reminders/hooks/usePushTokenSync.ts
import { useEffect } from "react";
import * as Sentry from "@sentry/react";

/** 앱 진입 시 1회: 권한이 있으면 현재 FCM 토큰을 다시 등록한다(토큰 교체·DO의 무효 토큰 삭제 복구). */
export const usePushTokenSync = (): void => {
  useEffect(() => {
    import("../push/pushClient")
      .then(({ syncPushToken }) => syncPushToken())
      .catch((error) => {
        console.error("푸시 토큰 동기화 실패:", error);
        Sentry.captureException(error);
      });
  }, []);
};
```

```ts
// client/src/features/reminders/hooks/useForegroundReminders.ts
import { useEffect } from "react";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared/ui/toast/useToast";
import { subscribeForegroundMessages } from "../push/pushClient";

export const useForegroundReminders = (): void => {
  const toast = useToast();

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    subscribeForegroundMessages(({ title, body }) => toast.info(title, body))
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      })
      .catch((error) => Sentry.captureException(error));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // toast 객체 정체성에 따라 재구독하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
```

`client/src/features/reminders/index.ts`에 추가:

```ts
export { useReminderRefresh } from "./hooks/useReminderRefresh";
export { usePushTokenSync } from "./hooks/usePushTokenSync";
export { useForegroundReminders } from "./hooks/useForegroundReminders";
```

`client/src/App.tsx` — import 추가(배럴이 아닌 직접 경로, 기존 주석과 같은 이유):

```ts
import { useReminderRefresh } from "@/features/reminders/hooks/useReminderRefresh";
import { usePushTokenSync } from "@/features/reminders/hooks/usePushTokenSync";
import { useForegroundReminders } from "@/features/reminders/hooks/useForegroundReminders";
```

`useSyncTodosToCalendar();` 바로 아래에:

```ts
  useReminderRefresh();
  usePushTokenSync();
  useForegroundReminders();
```

(`useForegroundReminders`가 `pushClient`를 정적 import하지만 `pushClient`는 `firebase/messaging`을 동적 import만 하므로 App 청크에 SDK가 들어오지 않는다. Step 5의 번들 검사로 확인한다.)

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/features/reminders src/App && npx tsc -b`
Expected: PASS

- [ ] **Step 5: 번들 확인**

Run: `cd client && VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 npm run build && npm run check:bundle`
Expected: 예산 통과. `firebase/messaging` 코드가 별도 청크인지 확인: `grep -l "messaging/token-subscribe-failed" dist/assets/*.js` 결과가 `index-*.js`(엔트리)가 아닐 것

- [ ] **Step 6: 커밋**

```bash
git add client/src/features/reminders client/src/App.tsx
git commit -m "feat(reminders): todos 지문 기반 refresh 신호·진입 시 토큰 재등록·포그라운드 토스트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 할 일 폼 알림 선택

**Files:**
- Modify: `client/src/features/todo/components/todoForm/todoForm.tsx` (TodoFormData, defaultValues, onSubmit 4경로, JSX 만료일시 아래)
- Test: `client/src/features/todo/components/todoForm/__tests__/todoForm.test.tsx`
- Test: `client/src/features/todo/utils/__tests__/startupMaintenance.test.ts` (시리즈 확장 승계)
- Test: `client/src/features/todo/api/__tests__/recurringTodoApi.test.ts` (반복 생성 승계)

**Interfaces:**
- Consumes: Task 8 `useReminderDefault`, `toReminderChoice`, `parseReminderSetting`, `REMINDER_SETTING_OPTIONS`; Task 1 `reminderSettingLabel`, `DEFAULT_REMINDER_SETTING`
- Produces: 폼이 모든 저장 경로에 `reminderOffsetMinutes: ReminderSetting | null`을 넣는다. select `aria-label="마감 알림"`.

- [ ] **Step 1: 실패하는 폼 테스트 작성**

`todoForm.test.tsx` 상단 mock 목록에 추가(다른 `vi.mock` 옆):

```ts
vi.mock("@/features/reminders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/reminders")>()),
  useReminderDefault: () => ({ data: 30 }),
}));
```

파일 끝에 추가:

```tsx
describe("마감 알림 선택", () => {
  it("마감이 없으면 비활성, 기본 라벨에 현재 기본값을 보여준다", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    const select = screen.getByLabelText("마감 알림") as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(screen.getByRole("option", { name: "기본값 (30분 전)" })).toBeInTheDocument();
  });

  it("새 할 일에 1시간 전을 고르면 reminderOffsetMinutes: 60으로 생성하고 reminder 키는 저장하지 않는다", async () => {
    asSuccess(mockTodo.useCreateTodo.mutate);
    const user = setupUser();
    renderForm();
    await user.type(screen.getByPlaceholderText("무엇을 해야 하나요?"), "보고서");
    await user.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.change(document.querySelector('input[name="dueAt"]')!, { target: { value: "2026-10-01T18:00" } });
    await user.selectOptions(screen.getByLabelText("마감 알림"), "60");
    fireEvent.submit(document.getElementById("todo-form")!);

    const payload = mockTodo.useCreateTodo.mutate.mock.calls[0][0];
    expect(payload.reminderOffsetMinutes).toBe(60);
    expect(payload).not.toHaveProperty("reminder");
  });

  it("기본값을 고르면 null로 저장한다(기존 재지정 해제)", async () => {
    asSuccess(mockTodo.useUpdateTodo.mutate);
    renderForm({ todo: makeTodo({ dueAt: "2026-10-01T09:00:00.000Z", reminderOffsetMinutes: 10 }) });
    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect((screen.getByLabelText("마감 알림") as HTMLSelectElement).value).toBe("10");
    fireEvent.change(screen.getByLabelText("마감 알림"), { target: { value: "default" } });
    fireEvent.submit(document.getElementById("todo-form")!);

    await vi.waitFor(() => expect(mockTodo.useUpdateTodo.mutate).toHaveBeenCalled());
    const payload = mockTodo.useUpdateTodo.mutate.mock.calls[0][0];
    expect(payload.reminderOffsetMinutes).toBeNull();
    expect(payload).not.toHaveProperty("reminder");
  });

  it("하위 할 일·반복 생성 경로도 값을 넘긴다", async () => {
    asSuccess(mockTodo.useCreateChildTodo.mutate);
    const user = setupUser();
    renderForm({ parentId: "p1" });
    await user.type(screen.getByPlaceholderText("무엇을 해야 하나요?"), "하위");
    await user.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.change(document.querySelector('input[name="dueAt"]')!, { target: { value: "2026-10-01T18:00" } });
    await user.selectOptions(screen.getByLabelText("마감 알림"), "off");
    fireEvent.submit(document.getElementById("todo-form")!);

    await vi.waitFor(() => expect(mockTodo.useCreateChildTodo.mutate).toHaveBeenCalled());
    expect(mockTodo.useCreateChildTodo.mutate.mock.calls[0][0].todo.reminderOffsetMinutes).toBe("off");
  });
});
```

(기존 테스트가 `setupUser`/`fireEvent`로 "더보기"를 여는 방식을 따른다. 버튼 이름·placeholder가 다르면 기존 테스트에서 쓰는 셀렉터로 맞춘다.)

반복 승계 테스트 — `recurringTodoApi.test.ts`의 `describe("createRecurringTodo")` 안(기존 "archived: false" 테스트 다음)에 추가. 이 파일의 `makeTodo`, `makeBatch`, `dailyRule`, `emptyDocsSnapshot`, `resetFirestoreMocks`(beforeEach)를 그대로 쓴다:

```ts
  it("reminderOffsetMinutes를 모든 인스턴스에 승계한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../todoApi");
    await createRecurringTodo(
      makeTodo({ recurrence: dailyRule, startAt: "2026-07-10T09:00:00", reminderOffsetMinutes: 60 }),
      new Date("2026-07-13T00:00:00"),
    );

    expect(batch.set).toHaveBeenCalledTimes(4);
    for (const [, data] of batch.set.mock.calls) {
      expect(data).toMatchObject({ reminderOffsetMinutes: 60 });
    }
  });
```

`startupMaintenance.test.ts`의 `buildExtensionCreates` describe에 추가:

```ts
  it("시리즈 확장 인스턴스가 마지막 인스턴스의 reminderOffsetMinutes를 승계한다", () => {
    const creates = buildExtensionCreates(
      [
        {
          recurrenceId: "r1",
          template: { title: "운동", reminderOffsetMinutes: 1440 } as unknown as Omit<Todo, "id">,
          dueDates: ["2026-10-08T09:00:00.000Z"],
        },
      ],
      0,
      "user-1",
      "2026-10-01T00:00:00.000Z",
    );
    expect(creates[0].doc.reminderOffsetMinutes).toBe(1440);
  });
```


- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/todo`
Expected: 폼 테스트 FAIL(`Unable to find a label with the text of: 마감 알림`). 승계 테스트 2개는 이미 PASS할 수 있다 — 기존 전개(`...todoData`/`...template`)가 필드를 옮기기 때문이며, 이 테스트는 그 동작을 회귀로부터 고정하는 용도다.

- [ ] **Step 3: 구현**

`todoForm.tsx` import 추가:

```ts
import {
  REMINDER_SETTING_OPTIONS,
  parseReminderSetting,
  toReminderChoice,
  useReminderDefault,
} from "@/features/reminders";
import {
  DEFAULT_REMINDER_SETTING,
  reminderSettingLabel,
} from "@tododo/core/dist/reminders/index.js";
```

`TodoFormData`에 필드 추가:

```ts
  /** select 값: "default" | "off" | "0" | "10" | ... — 저장 전 parseReminderSetting으로 바꾼다. */
  reminder?: string;
```

`useForm`의 `defaultValues`를 수정 — `todo` 분기에 `reminder: toReminderChoice(todo.reminderOffsetMinutes),`를 추가하고, 나머지 분기도 `reminder: "default"`를 갖게 한다:

```ts
    defaultValues: todo
      ? {
          title: todo.title,
          description: todo.description,
          priority: todo.priority,
          startAt: todo.startAt ? toDatetimeLocalValue(todo.startAt) : undefined,
          dueAt: todo.dueAt ? toDatetimeLocalValue(todo.dueAt) : undefined,
          reminder: toReminderChoice(todo.reminderOffsetMinutes),
        }
      : initialDueAt
        ? { dueAt: initialDueAt, reminder: "default" }
        : { reminder: "default" },
```

컴포넌트 본문(`const dueAtWatch = watch("dueAt");` 근처)에 추가:

```ts
  const { data: reminderDefault = DEFAULT_REMINDER_SETTING } = useReminderDefault();
```

`onSubmit` 맨 위(`if (isSubmitting) return;` 다음)에서 폼 전용 키를 떼어낸다:

```ts
    // reminder는 select용 문자열이라 문서에 그대로 저장하면 안 된다. 아래 경로들은
    // data 대신 fields를 전개하고 reminderOffsetMinutes를 따로 넣는다.
    const { reminder, ...fields } = data;
    const reminderOffsetMinutes = parseReminderSetting(reminder);
```

그리고 `onSubmit` 안에서 **`...data`를 전개하는 네 곳을 모두 `...fields`로 바꾸고** 각 payload에 `reminderOffsetMinutes`를 추가한다:

```ts
      const updatedFields = {
        ...todo,
        ...fields,
        startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
        dueAt: dueAtIso,
        recurrence: newRecurrence,
        reminderOffsetMinutes,
      } as Todo;
```

```ts
          todo: {
            ...fields,
            startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
            dueAt: dueAtIso,
            reminderOffsetMinutes,
          },
```

```ts
        {
          ...fields,
          startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
          dueAt: dueAtIso,
          recurrence: newRecurrence,
          reminderOffsetMinutes,
        } as Todo,
```

```ts
        {
          ...fields,
          startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
          dueAt: dueAtIso,
          reminderOffsetMinutes,
        } as Todo, {
```

JSX — `<Input type="datetime-local" {...register("dueAt")} />` 바로 아래에:

```tsx
            <InputLabel htmlFor="todo-reminder">마감 알림</InputLabel>
            <Select
              id="todo-reminder"
              aria-label="마감 알림"
              {...register("reminder")}
              disabled={!dueAtWatch}
            >
              <option value="default">기본값 ({reminderSettingLabel(reminderDefault)})</option>
              {REMINDER_SETTING_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
```

(`InputLabel`이 `htmlFor`를 받지 않는 styled 컴포넌트라도 DOM `label`이면 전달된다. `aria-label`이 있으므로 테스트는 어느 쪽이든 찾는다. 비활성 select는 react-hook-form이 `undefined`를 넘기고 `parseReminderSetting(undefined)`는 `null`이다.)

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/features/todo && npx tsc -b && npm run lint`
Expected: 전체 PASS, 린트 통과

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo
git commit -m "feat(todo): 할 일 폼에 마감 알림 선택(기본값/재지정) 추가, 반복 승계 테스트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 첫 마감 저장 후 권한 안내창

**Files:**
- Create: `client/src/features/reminders/components/reminderPrompt/reminderPrompt.tsx`
- Test: `client/src/features/reminders/components/reminderPrompt/__tests__/reminderPrompt.test.tsx`
- Modify: `client/src/features/reminders/index.ts`
- Modify: `client/src/App.tsx` (Provider로 감싸기)
- Modify: `client/src/features/todo/components/todoForm/todoForm.tsx` (저장 성공 시 `offerReminders`)
- Test: `client/src/features/todo/components/todoForm/__tests__/todoForm.test.tsx`

**Interfaces:**
- Consumes: Task 9 `getPushPermission`, `enablePushOnThisDevice`(동적 import); Task 8 `useReminderDefault`; `ConfirmModal`, `useToast`
- Produces:
  - `ReminderPromptProvider({ children })`
  - `useReminderPrompt(): { offerReminders: () => void }` — Provider 밖에서는 no-op
  - `PROMPT_SNOOZE_KEY = "tododo:reminderPromptSnoozedUntil"`, `PROMPT_SNOOZE_MS = 7일`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// client/src/features/reminders/components/reminderPrompt/__tests__/reminderPrompt.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import { setupUser } from "@/test/setupUser";

const s = vi.hoisted(() => ({
  permission: "default" as string,
  reminderDefault: 30 as unknown,
  enable: vi.fn(),
}));
vi.mock("../../../push/pushSupport", () => ({ getPushPermission: () => s.permission }));
vi.mock("../../../push/pushClient", () => ({ enablePushOnThisDevice: s.enable }));
vi.mock("../../../hooks/useReminderSettings", () => ({ useReminderDefault: () => ({ data: s.reminderDefault }) }));

import {
  PROMPT_SNOOZE_KEY,
  PROMPT_SNOOZE_MS,
  ReminderPromptProvider,
  useReminderPrompt,
} from "../reminderPrompt";

let offer: () => void = () => {};
const Probe = () => {
  offer = useReminderPrompt().offerReminders;
  return null;
};
const renderPrompt = () =>
  render(
    <ToastProvider>
      <ReminderPromptProvider>
        <Probe />
      </ReminderPromptProvider>
    </ToastProvider>,
  );

beforeEach(() => {
  s.permission = "default";
  s.reminderDefault = 30;
  s.enable.mockReset().mockResolvedValue("granted");
  localStorage.clear();
});

describe("ReminderPrompt", () => {
  it("권한이 default면 기본값 문구로 안내창을 띄운다", () => {
    renderPrompt();
    act(() => offer());
    expect(screen.getByText("마감 30분 전에 알려드릴까요?")).toBeInTheDocument();
  });

  it.each(["granted", "denied", "unsupported"])("권한이 %s면 띄우지 않는다", (permission) => {
    s.permission = permission;
    renderPrompt();
    act(() => offer());
    expect(screen.queryByText(/알려드릴까요/)).not.toBeInTheDocument();
  });

  it("기본값이 알림 없음이면 띄우지 않는다", () => {
    s.reminderDefault = "off";
    renderPrompt();
    act(() => offer());
    expect(screen.queryByText(/알려드릴까요/)).not.toBeInTheDocument();
  });

  it("[켜기]는 권한을 요청하고 닫는다", async () => {
    const user = setupUser();
    renderPrompt();
    act(() => offer());
    await user.click(screen.getByRole("button", { name: "켜기" }));
    expect(s.enable).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/알려드릴까요/)).not.toBeInTheDocument();
  });

  it("[나중에]는 7일간 다시 묻지 않는다", async () => {
    const user = setupUser();
    renderPrompt();
    act(() => offer());
    const before = Date.now();
    await user.click(screen.getByRole("button", { name: "나중에" }));
    expect(Number(localStorage.getItem(PROMPT_SNOOZE_KEY))).toBeGreaterThanOrEqual(before + PROMPT_SNOOZE_MS);
    act(() => offer());
    expect(screen.queryByText(/알려드릴까요/)).not.toBeInTheDocument();
  });

  it("Provider 밖에서는 아무 일도 없다", () => {
    render(<Probe />);
    expect(() => offer()).not.toThrow();
  });
});
```

`todoForm.test.tsx` — 위 Task 11에서 추가한 `@/features/reminders` mock에 `useReminderPrompt`를 추가하고 테스트를 덧붙인다:

```ts
const { offerRemindersMock } = vi.hoisted(() => ({ offerRemindersMock: vi.fn() }));
vi.mock("@/features/reminders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/reminders")>()),
  useReminderDefault: () => ({ data: 30 }),
  useReminderPrompt: () => ({ offerReminders: offerRemindersMock }),
}));
```

(Task 11의 mock 블록을 이것으로 교체한다. `beforeEach`에 `offerRemindersMock.mockClear();` 추가.)

```tsx
describe("알림 안내창 트리거", () => {
  it("마감이 있는 할 일을 저장하면 offerReminders를 부른다", async () => {
    asSuccess(mockTodo.useCreateTodo.mutate);
    const user = setupUser();
    renderForm();
    await user.type(screen.getByPlaceholderText("무엇을 해야 하나요?"), "보고서");
    await user.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.change(document.querySelector('input[name="dueAt"]')!, { target: { value: "2026-10-01T18:00" } });
    fireEvent.submit(document.getElementById("todo-form")!);
    await vi.waitFor(() => expect(offerRemindersMock).toHaveBeenCalledTimes(1));
  });

  it("마감이 없으면 부르지 않는다", async () => {
    asSuccess(mockTodo.useCreateTodo.mutate);
    const user = setupUser();
    renderForm();
    await user.type(screen.getByPlaceholderText("무엇을 해야 하나요?"), "보고서");
    fireEvent.submit(document.getElementById("todo-form")!);
    await vi.waitFor(() => expect(mockTodo.useCreateTodo.mutate).toHaveBeenCalled());
    expect(offerRemindersMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/reminders/components src/features/todo/components/todoForm`
Expected: FAIL

- [ ] **Step 3: 구현**

```tsx
// client/src/features/reminders/components/reminderPrompt/reminderPrompt.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import {
  DEFAULT_REMINDER_SETTING,
  reminderSettingLabel,
} from "@tododo/core/dist/reminders/index.js";
// @/shared 배럴은 linkifyjs 등까지 끌어온다. App 청크(모든 보호 라우트의 공통 경로)에
// 들어가므로 직접 경로로 가져온다.
import ConfirmModal from "@/shared/ui/confirmModal/confirmModal";
import { useToast } from "@/shared/ui/toast/useToast";
import { getPushPermission } from "../../push/pushSupport";
import { useReminderDefault } from "../../hooks/useReminderSettings";

export const PROMPT_SNOOZE_KEY = "tododo:reminderPromptSnoozedUntil";
export const PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const ReminderPromptContext = createContext<{ offerReminders: () => void }>({ offerReminders: () => {} });

export const useReminderPrompt = () => useContext(ReminderPromptContext);

const isSnoozed = (now: number): boolean => {
  try {
    const until = localStorage.getItem(PROMPT_SNOOZE_KEY);
    return until !== null && Number(until) > now;
  } catch {
    return false;
  }
};

/**
 * 마감 있는 할 일을 저장한 직후 한 번 묻는다. 브라우저 권한 거절은 영구적이라,
 * 맥락이 분명한 순간에 앱 안의 안내를 먼저 거친다. 폼 모달의 자식이 아니라
 * App 수준에 두어 모달이 닫힐 때 함께 사라지지 않게 한다.
 */
export const ReminderPromptProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const { data: reminderDefault = DEFAULT_REMINDER_SETTING } = useReminderDefault();
  const toast = useToast();

  const offerReminders = useCallback(() => {
    if (getPushPermission() !== "default") return;
    if (reminderDefault === "off") return;
    if (isSnoozed(Date.now())) return;
    setIsOpen(true);
  }, [reminderDefault]);

  const value = useMemo(() => ({ offerReminders }), [offerReminders]);
  const label = reminderDefault === "off" ? "" : reminderSettingLabel(reminderDefault);

  const handleConfirm = async () => {
    setIsEnabling(true);
    try {
      const { enablePushOnThisDevice } = await import("../../push/pushClient");
      const result = await enablePushOnThisDevice();
      if (result === "granted") toast.success("알림을 켰어요", `마감 ${label}에 알려드릴게요`);
      else if (result === "denied") toast.info("알림이 차단됐어요", "브라우저 사이트 설정에서 허용할 수 있어요");
    } catch (error) {
      console.error("알림 켜기 실패:", error);
      Sentry.captureException(error);
      toast.error("알림을 켜지 못했어요", "잠시 후 다시 시도해 주세요");
    } finally {
      setIsEnabling(false);
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    try {
      localStorage.setItem(PROMPT_SNOOZE_KEY, String(Date.now() + PROMPT_SNOOZE_MS));
    } catch {
      // 저장소를 못 쓰면 다음 저장 때 다시 물을 뿐이다.
    }
    setIsOpen(false);
  };

  return (
    <ReminderPromptContext.Provider value={value}>
      {children}
      <ConfirmModal
        isOpen={isOpen}
        title="마감 알림"
        message={`마감 ${label}에 알려드릴까요?`}
        confirmText="켜기"
        cancelText="나중에"
        confirmDisabled={isEnabling}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ReminderPromptContext.Provider>
  );
};
```

(`ConfirmModal`의 `onConfirm` 타입은 `() => void`다. `async` 함수를 넘겨도 타입은 맞지만 린트(`no-misused-promises`)가 있으면 `onConfirm={() => void handleConfirm()}`로 넘긴다.)

`client/src/features/reminders/index.ts`에 추가:

```ts
export { ReminderPromptProvider, useReminderPrompt } from "./components/reminderPrompt/reminderPrompt";
```

`client/src/App.tsx` — import 추가:

```ts
import { ReminderPromptProvider } from "@/features/reminders/components/reminderPrompt/reminderPrompt";
```

`return (` 안의 `<Container>…</Container>` 전체를 감싼다:

```tsx
  return (
    <ReminderPromptProvider>
      <Container>
        {/* 기존 내용 그대로 */}
      </Container>
    </ReminderPromptProvider>
  );
```

`todoForm.tsx` — import에 `useReminderPrompt` 추가(`@/features/reminders`에서), 본문에:

```ts
  const { offerReminders } = useReminderPrompt();
  // 저장 성공 후 마감이 있으면 알림 안내를 제안한다(조건 판단은 Provider가 한다).
  const offerIfDue = (dueAtIso: string | null) => {
    if (dueAtIso) offerReminders();
  };
```

그리고 **성공 토스트를 띄우는 모든 `onSuccess`**(시리즈 수정 `handleConfirmSeriesEdit`, 반복 전환, 일반 수정, 하위 생성, 반복 생성, 일반 생성)에서 `onClose?.();` 바로 앞에 `offerIfDue(...)`를 넣는다. 각 위치에서 쓸 값:
- `handleConfirmSeriesEdit`: `offerIfDue(pendingSeriesUpdate.dueAt);`
- 나머지 `onSubmit` 경로: `offerIfDue(dueAtIso);`

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/features/reminders src/features/todo && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/reminders client/src/features/todo client/src/App.tsx
git commit -m "feat(reminders): 마감 있는 할 일 저장 후 알림 권한 안내창(7일 억제)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 헤더 알림 메뉴와 로그아웃 토큰 해제

**Files:**
- Create: `client/src/layouts/notificationMenu/notificationMenu.tsx`
- Create: `client/src/layouts/notificationMenu/notificationMenu.styles.tsx`
- Test: `client/src/layouts/notificationMenu/__tests__/notificationMenu.test.tsx`
- Modify: `client/src/layouts/header/header.tsx`, `client/src/layouts/mobileHeader/mobileHeader.tsx` (`<ThemeMenu />` 앞)
- Modify: `client/src/features/auth/context/authProvider.tsx` (`logout`)
- Test: `client/src/features/auth/context/__tests__/authProvider.test.tsx`

**Interfaces:**
- Consumes: Task 8 `useReminderDefault`, `useSetReminderDefault`, `REMINDER_SETTING_OPTIONS`, `parseReminderSetting`; Task 9 `getPushPermission`, `enablePushOnThisDevice`, `disablePushOnThisDevice`
- Produces: `NotificationMenu` (default export). 트리거 `aria-label="알림 설정"`, 패널 `role="dialog"`. `logout()`은 토큰 해제를 시도한 뒤 로그아웃한다(해제 실패해도 로그아웃은 진행).

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// client/src/layouts/notificationMenu/__tests__/notificationMenu.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import { setupUser } from "@/test/setupUser";

const s = vi.hoisted(() => ({
  permission: "default" as string,
  reminderDefault: 30 as unknown,
  setDefault: vi.fn(),
  enable: vi.fn(),
}));
vi.mock("@/features/reminders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/reminders")>()),
  getPushPermission: () => s.permission,
  useReminderDefault: () => ({ data: s.reminderDefault }),
  useSetReminderDefault: () => ({ mutate: s.setDefault }),
}));
vi.mock("@/features/reminders/push/pushClient", () => ({ enablePushOnThisDevice: s.enable }));
// importOriginal이 실제 배럴을 읽으므로 Firebase 초기화를 막는다(CI는 API 키가 비어 있어 실패한다).
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "user-1" } }, googleProvider: {} }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));

import NotificationMenu from "../notificationMenu";

const renderMenu = () =>
  render(
    <ToastProvider>
      <NotificationMenu />
    </ToastProvider>,
  );

beforeEach(() => {
  s.permission = "default";
  s.reminderDefault = 30;
  s.setDefault.mockReset();
  s.enable.mockReset().mockImplementation(async () => {
    s.permission = "granted";
    return "granted";
  });
});

describe("NotificationMenu", () => {
  it.each([
    ["granted", "이 기기에서 마감 알림을 받고 있어요."],
    ["default", "알림을 켜면 탭을 닫아도 마감 전에 알려드려요."],
    ["denied", "브라우저에서 알림이 차단돼 있어요. 주소창 왼쪽의 사이트 설정에서 알림을 허용해 주세요."],
    ["unsupported", "이 브라우저에서는 알림을 받을 수 없어요."],
  ])("%s 상태 문구", async (permission, text) => {
    s.permission = permission;
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림 설정" }));
    expect(screen.getByRole("dialog", { name: "알림 설정" })).toHaveTextContent(text);
  });

  it("default면 [알림 켜기]로 권한을 요청하고 상태가 바뀐다", async () => {
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림 설정" }));
    await user.click(screen.getByRole("button", { name: "알림 켜기" }));
    expect(s.enable).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("이 기기에서 마감 알림을 받고 있어요.")).toBeInTheDocument();
  });

  it("기본 알림을 바꾸면 저장한다", async () => {
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림 설정" }));
    await user.selectOptions(screen.getByLabelText("기본 알림"), "1440");
    expect(s.setDefault).toHaveBeenCalledWith(1440);
  });

  it("미지원이면 기본 알림 선택을 숨긴다", async () => {
    s.permission = "unsupported";
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림 설정" }));
    expect(screen.queryByLabelText("기본 알림")).not.toBeInTheDocument();
  });

  it("Escape로 닫고 트리거로 포커스를 돌려준다", async () => {
    const user = setupUser();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "알림 설정" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
```

`authProvider.test.tsx`에 추가. 이 파일은 이미 `firebase/auth`의 `signOut`을 `vi.fn()`으로 mock하고 `useAuth`를 `../useAuth`에서 가져온다. 파일 상단 import에 `import { signOut } from 'firebase/auth'`를 추가하고, 기존 `vi.mock`들 옆에:

```tsx
const { disableMock } = vi.hoisted(() => ({ disableMock: vi.fn() }))
vi.mock('@/features/reminders/push/pushClient', () => ({ disablePushOnThisDevice: disableMock }))
```

파일 끝에:

```tsx
const logoutViaProvider = async () => {
  let logout: () => Promise<void> = async () => {}
  const Grab = () => {
    logout = useAuth().logout
    return null
  }
  render(
    <AuthProvider>
      <Grab />
    </AuthProvider>,
  )
  await act(() => logout())
}

// Review Focus 5
describe('logout', () => {
  beforeEach(() => {
    disableMock.mockReset()
    vi.mocked(signOut).mockReset()
  })

  it('푸시 토큰을 먼저 해제한 뒤 로그아웃한다', async () => {
    const order: string[] = []
    disableMock.mockImplementation(async () => void order.push('disable'))
    vi.mocked(signOut).mockImplementation(async () => void order.push('signOut'))
    await logoutViaProvider()
    expect(order).toEqual(['disable', 'signOut'])
  })

  it('해제가 실패해도 로그아웃은 진행한다', async () => {
    disableMock.mockRejectedValue(new Error('offline'))
    await logoutViaProvider()
    expect(signOut).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/layouts/notificationMenu src/features/auth`
Expected: FAIL

- [ ] **Step 3: 구현**

```tsx
// client/src/layouts/notificationMenu/notificationMenu.styles.tsx
import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

export { Wrapper, Trigger } from "@/layouts/themeMenu/themeMenu.styles";

export const Panel = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
  width: 260px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: ${colors.surface.overlay};
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.md};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
`;

export const StatusText = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${colors.text.secondary};
`;

export const EnableButton = styled.button`
  padding: 8px 12px;
  border: none;
  border-radius: ${radius.sm};
  background-color: ${colors.brand.strong};
  color: ${colors.brand.onStrong};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: ${colors.brand.strongHover};
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const FieldLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

export const DefaultSelect = styled.select`
  padding: 6px 8px;
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.sm};
  background-color: ${colors.background.primary};
  color: ${colors.text.primary};
  font-size: 14px;
`;
```

```tsx
// client/src/layouts/notificationMenu/notificationMenu.tsx
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bell, BellOff } from "lucide-react";
import * as Sentry from "@sentry/react";
import { DEFAULT_REMINDER_SETTING } from "@tododo/core/dist/reminders/index.js";
import {
  REMINDER_SETTING_OPTIONS,
  getPushPermission,
  parseReminderSetting,
  useReminderDefault,
  useSetReminderDefault,
  type PushPermission,
} from "@/features/reminders";
import { useToast } from "@/shared/ui/toast/useToast";
import {
  Wrapper,
  Trigger,
  Panel,
  StatusText,
  EnableButton,
  FieldLabel,
  DefaultSelect,
} from "./notificationMenu.styles";

const STATUS_TEXT: Record<PushPermission, string> = {
  granted: "이 기기에서 마감 알림을 받고 있어요.",
  default: "알림을 켜면 탭을 닫아도 마감 전에 알려드려요.",
  denied: "브라우저에서 알림이 차단돼 있어요. 주소창 왼쪽의 사이트 설정에서 알림을 허용해 주세요.",
  unsupported: "이 브라우저에서는 알림을 받을 수 없어요.",
};

const NotificationMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState<PushPermission>(getPushPermission);
  const [isEnabling, setIsEnabling] = useState(false);
  const { data: reminderDefault = DEFAULT_REMINDER_SETTING } = useReminderDefault();
  const setDefault = useSetReminderDefault();
  const toast = useToast();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = (restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    // 브라우저 설정에서 권한을 바꿨을 수 있으니 열 때마다 다시 읽는다.
    setPermission(getPushPermission());
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    }
  };

  const enable = async () => {
    setIsEnabling(true);
    try {
      const { enablePushOnThisDevice } = await import("@/features/reminders/push/pushClient");
      setPermission(await enablePushOnThisDevice());
    } catch (error) {
      console.error("알림 켜기 실패:", error);
      Sentry.captureException(error);
      toast.error("알림을 켜지 못했어요", "잠시 후 다시 시도해 주세요");
    } finally {
      setIsEnabling(false);
    }
  };

  const isActive = permission === "granted" && reminderDefault !== "off";
  const Icon = isActive ? Bell : BellOff;

  return (
    <Wrapper ref={wrapperRef}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label="알림 설정"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        <Icon size={18} aria-hidden="true" />
      </Trigger>
      {isOpen && (
        <Panel role="dialog" aria-label="알림 설정" onKeyDown={onPanelKeyDown}>
          <StatusText>{STATUS_TEXT[permission]}</StatusText>
          {permission === "default" && (
            <EnableButton type="button" onClick={() => void enable()} disabled={isEnabling}>
              알림 켜기
            </EnableButton>
          )}
          {permission !== "unsupported" && (
            <>
              <FieldLabel htmlFor="reminder-default">기본 알림</FieldLabel>
              <DefaultSelect
                id="reminder-default"
                value={String(reminderDefault)}
                onChange={(e) => {
                  const setting = parseReminderSetting(e.target.value);
                  if (setting !== null) setDefault.mutate(setting);
                }}
              >
                {REMINDER_SETTING_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </DefaultSelect>
            </>
          )}
        </Panel>
      )}
    </Wrapper>
  );
};

export default NotificationMenu;
```

`header.tsx`, `mobileHeader.tsx` — import 추가 후 `<ThemeMenu />` 바로 앞에 `<NotificationMenu />`:

```ts
import NotificationMenu from "@/layouts/notificationMenu/notificationMenu";
```

`authProvider.tsx`의 `logout`:

```ts
  // 같은 브라우저에서 다른 계정으로 로그인했을 때 이전 계정의 알림이 오지 않도록,
  // ID 토큰이 살아 있는 로그아웃 직전에 이 기기의 푸시 토큰을 해제한다. 실패해도
  // 로그아웃은 막지 않는다. pushClient는 동적 import해 초기 청크에 넣지 않는다.
  const logout = async () => {
    try {
      const { disablePushOnThisDevice } = await import("@/features/reminders/push/pushClient");
      await disablePushOnThisDevice();
    } catch (error) {
      console.error("푸시 토큰 해제 실패:", error);
    }
    await signOut(auth);
  };
```

`AuthContext`의 `logout`은 이미 `() => Promise<void>` 타입이다(`authContext.ts`) — 타입 변경 없음.

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run && npx tsc -b && npm run lint`
Expected: 전체 PASS(`noHardcodedColorRule` 포함 — `rgba` 그림자는 themeMenu와 같은 예외 규칙을 따른다. 테스트가 막으면 themeMenu.styles의 그림자 표기를 그대로 쓴다)

Run: `cd client && VITE_FIREBASE_API_KEY= npx vitest run`
Expected: 전체 PASS(CI 등가)

- [ ] **Step 5: 커밋**

```bash
git add client/src/layouts client/src/features/auth
git commit -m "feat(reminders): 헤더 알림 메뉴(상태·켜기·기본값)와 로그아웃 시 푸시 토큰 해제

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: CI·배포 문서·수동 검증

**Files:**
- Modify: `.github/workflows/ci.yml` (changes outputs/filters, 새 job, deploy env)
- Create: `reminder-proxy/README.md`

**Interfaces:**
- Consumes: Task 2~7의 `npm run typecheck/test/deploy`
- Produces: `reminderProxy` 경로 필터와 `Reminder Proxy` job(main push에 배포), deploy job의 `VITE_REMINDER_PROXY_URL`·`VITE_FIREBASE_VAPID_KEY`

- [ ] **Step 1: CI 수정**

`changes` job `outputs`에 추가:

```yaml
      reminderProxy: ${{ steps.filter.outputs.reminderProxy }}
```

`filters`에 추가(core의 reminders 모듈을 dist로 쓰므로 core 변경도 포함):

```yaml
            reminderProxy:
              - 'reminder-proxy/**'
              - 'packages/worker-auth/**'
              - 'packages/core/**'
```

`ai-proxy` job 뒤에 새 job:

```yaml
  reminder-proxy:
    name: Reminder Proxy
    runs-on: ubuntu-latest
    needs: changes
    # 다른 Worker와 같은 이유로 main push에는 항상 실행한다(배포는 멱등).
    if: >-
      needs.changes.outputs.reminderProxy == 'true' ||
      (github.ref == 'refs/heads/main' && github.event_name == 'push')
    defaults:
      run:
        working-directory: reminder-proxy

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Cache node_modules
        uses: actions/cache@v4
        id: cache-reminder-proxy-npm
        with:
          path: reminder-proxy/node_modules
          key: ${{ runner.os }}-reminder-proxy-node-modules-${{ hashFiles('reminder-proxy/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-reminder-proxy-node-modules-

      - name: Install dependencies
        if: steps.cache-reminder-proxy-npm.outputs.cache-hit != 'true'
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
        run: npm run deploy
```

`deploy` job의 Build `env`에서 `VITE_AI_PROXY_URL` 아래에 추가:

```yaml
          VITE_REMINDER_PROXY_URL: ${{ secrets.VITE_REMINDER_PROXY_URL }}
          VITE_FIREBASE_VAPID_KEY: ${{ secrets.VITE_FIREBASE_VAPID_KEY }}
```

(firestore rules·indexes는 deploy job이 이미 `--only hosting,firestore:rules,firestore:indexes`로 배포한다.)

Run: `npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK`

- [ ] **Step 2: README**

````markdown
<!-- reminder-proxy/README.md -->
# reminder-proxy

마감 알림(웹 푸시) Worker. 사용자마다 `ReminderScheduler` Durable Object 1개가 알람으로 발송 시각을 예약한다. 설계: `docs/superpowers/specs/2026-09-27-deadline-reminders-design.md`.

## 엔드포인트 (모두 `Authorization: Bearer <Firebase ID 토큰>`)

| 메서드·경로 | 본문 | 응답 |
|---|---|---|
| `POST /push-tokens` | `{ token, platform: "web" }` | 204 |
| `DELETE /push-tokens` | `{ token }` | 204 |
| `POST /reminders/refresh` | 없음 | 202 |

## 배포 준비 (최초 1회, 순서 중요)

1. **서비스 계정**: Google Cloud 콘솔(프로젝트 `tododo-83576`) > IAM > 서비스 계정 만들기. 역할 `Cloud Datastore User`, `Firebase Cloud Messaging API Admin`. 키(JSON) 발급. API 및 서비스에서 `Firebase Cloud Messaging API`가 사용 설정인지 확인. 결제 등록은 필요 없다.
2. **VAPID 키**: Firebase 콘솔 > 프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서 > 키 쌍 생성. 공개키를 `VITE_FIREBASE_VAPID_KEY`로 `client/.env`와 GitHub Secrets에 넣는다.
3. **Worker 코드 먼저 배포**: `npm run deploy`(또는 main 병합 후 CI). 출력된 URL을 `VITE_REMINDER_PROXY_URL`로 `client/.env`와 GitHub Secrets에 넣는다.
4. **시크릿**: 사용자 터미널에서 직접 실행한다(이 저장소의 에이전트 셸은 비대화형이라 입력을 받지 못한다).
   ```bash
   cd reminder-proxy && npx wrangler secret put GOOGLE_SERVICE_ACCOUNT < /path/to/service-account.json
   ```
   코드 배포 전에 시크릿을 넣으면 코드 없는 빈 Worker가 생긴다.
5. Firestore 규칙·색인은 main 배포 시 CI가 함께 배포한다. `userId + dueAt` 색인이 빌드되기 전(수 분)에는 재계산이 `FAILED_PRECONDITION`으로 실패하고 알람이 재시도한다.

## 로컬 테스트

```bash
cp /path/to/service-account.json .  # 커밋 금지
printf 'GOOGLE_SERVICE_ACCOUNT=%s\n' "$(jq -c . service-account.json)" > .dev.vars
npx wrangler dev   # http://localhost:8787
```
`client/.env.local`에 `VITE_REMINDER_PROXY_URL=http://localhost:8787`. 알림 클릭 링크는 `CLIENT_APP_URL`(배포 주소)로 열린다.

## 알고 감수한 한계
스펙 §9 참고(웹 외 경로의 늦은 반영, 브라우저 실행 필요, 제목이 FCM 경유, iOS 브라우저 미지원, Firestore 무료 읽기 한도, 자정 마감).
````

- [ ] **Step 3: 전체 검증**

Run: `cd reminder-proxy && npm run typecheck && npm test`
Expected: PASS

Run: `cd packages/core && npx vitest run`
Expected: PASS

Run: `cd client && npx tsc -b && npm run lint && npx vitest run && VITE_FIREBASE_API_KEY= npx vitest run && TZ=America/New_York npx vitest run`
Expected: 전부 PASS

Run: `cd client && VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 npm run build && npm run check:bundle`
Expected: 예산 통과

- [ ] **Step 4: 커밋**

```bash
git add .github/workflows/ci.yml reminder-proxy/README.md
git commit -m "ci(reminder-proxy): 테스트·배포 job과 deploy env, 배포 준비 문서

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 수동 E2E (사용자와 함께, 서비스 계정·VAPID 준비 후)**

1. `reminder-proxy`에서 `.dev.vars` 작성 후 `npx wrangler dev`, `client/.env.local`에 `VITE_REMINDER_PROXY_URL=http://localhost:8787`과 VAPID 키, `npm run dev`.
2. 데스크톱 Chrome에서 로그인 → 3분 뒤 마감인 할 일을 "정각" 알림으로 저장 → 안내창 [켜기] → 브라우저 허용.
3. `wrangler dev` 로그에 `/push-tokens` 204, `/reminders/refresh` 202가 보이는지 확인.
4. **탭을 닫고** 마감 시각에 OS 알림이 뜨는지, 클릭 시 `/todo/:id`가 열리는지 확인(링크는 `CLIENT_APP_URL`).
5. 같은 방식으로 할 일을 만들고 마감 전에 **완료** 처리 → 알림이 오지 않는지 확인.
6. 탭을 열어 둔 상태에서 알림 시각이 되면 토스트가 뜨는지 확인.
7. 헤더 벨 메뉴에서 기본값을 "알림 없음"으로 → 새 할 일에 알림이 오지 않는지 확인.
8. 로그아웃 → `wrangler dev` 로그에 `DELETE /push-tokens` 204 확인.

결과(성공/실패, 스크린샷)를 PR 본문에 적는다.
