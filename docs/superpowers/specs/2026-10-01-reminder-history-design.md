# 알림 기록 UI 설계

- 날짜: 2026-10-01
- 브랜치: `feat/reminder-history`
- 선행: 마감 알림(`2026-09-27-deadline-reminders-design.md`, 운영 배포·실기 확인 완료)

## 목적

벨 메뉴(`client/src/layouts/notificationMenu/notificationMenu.tsx`)는 지금 권한 상태와 기본 알림 설정만 보여준다.
OS 알림을 넘겼거나 열린 탭에서 토스트로 잠깐 받은 알림은 다시 볼 방법이 없다.
"벨 아이콘이 있는데 기록이 없으면 어색하다"는 문제를 해결한다.

**성공 기준**

- 벨을 열면 최근 7일간 실제 발송된 마감 알림이 최신순으로 보이고, 눌러서 해당 할 일로 이동한다.
- 안 읽은 알림이 있으면 벨에 개수 배지가 뜨고, 한 기기에서 확인하면 모든 기기에서 사라진다.
- 서비스계정 권한(Datastore Viewer)과 Firestore 사용량은 바뀌지 않는다.

## 확정된 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 역할 | 기록 목록 + 안 읽음 배지 | 사용자 선택 |
| 읽음 저장 위치 | 서버(DO) 단일 `lastSeenAt` | 기기 간 일관성, 이후 모바일 앱도 공유 |
| 보관 | 최근 7일, 최대 50개 | 마감 알림은 시간이 지나면 가치가 급감. 50개는 응답·저장량 상한 |
| 저장소 | DO SQLite에 `history` 테이블 신설 | `sent`(중복 방지)와 수명·필드가 달라 분리. Firestore는 쓰기 권한·한도 비용 때문에 제외 |
| 제목 | 발송 시점 스냅샷 | 할 일이 지워지거나 바뀌어도 "받은 그대로" 보여야 함 |

## 화면

```
 🔔(3)                         ← 안 읽은 개수 배지, 9 초과는 "9+"
┌────────────────────────────┐
│ 알림                        │
│ ● 기획서 제출               │ ← ● = sentAt > (열 때의) lastSeenAt
│   마감 30분 전 · 12분 전     │
│   운동                      │
│   마감 하루 전 · 3일 전      │
│   …(최대 높이 + 스크롤)       │
├────────────────────────────┤
│ 기존 상태 문구 / [알림 켜기]  │
│ 기본 알림 [30분 전 ▾]        │
└────────────────────────────┘
```

- 기록 목록을 위, 기존 설정을 아래에 둔다.
- 항목 클릭: `/todo/:id`로 이동하고 패널을 닫는다(알림 클릭과 같은 경로). 삭제된 할 일은 상세 화면의 기존 "없음" 처리를 따른다 — 구현 계획에서 실제 동작을 확인한다.
- 빈 상태: "최근 7일간 받은 알림이 없어요".
- 조회 실패: 목록 자리에 "알림 기록을 불러오지 못했어요". 설정 영역은 계속 쓸 수 있어야 한다.
- 읽음: 패널을 여는 순간 seen을 보내고 배지는 즉시 0. 단 ● 표시는 패널이 열려 있는 동안 유지한다(열 때의 `lastSeenAt` 기준).
- 접근성: 트리거 `aria-label`을 "알림"으로, 안 읽음이 있으면 "알림, 읽지 않은 알림 N개".
- 모바일 헤더는 같은 컴포넌트를 쓴다. 좁은 화면에서 패널이 화면 밖으로 넘치지 않는지 확인한다.
- 알림 문구("마감 30분 전")는 `@tododo/core`의 `reminderBody`를 재사용해 OS 알림과 일치시킨다.

## 서버 (reminder-proxy)

### 저장소 (`src/store.ts`)

```sql
CREATE TABLE IF NOT EXISTS history (
  todoId TEXT NOT NULL, fireAt INTEGER NOT NULL,
  title TEXT NOT NULL, offsetMinutes INTEGER NOT NULL,
  dueAt TEXT NOT NULL, sentAt INTEGER NOT NULL,
  PRIMARY KEY (todoId, fireAt))
```

- `ReminderStore`에 `addHistory`, `listHistory(since, limit)`, `pruneHistory(before, keep)` 추가. `INSERT OR IGNORE`로 같은 예약의 중복 기록을 구조적으로 막는다.
- `MetaKey`에 `"lastSeenAt"` 추가.
- 테스트용 `src/__tests__/memoryStore.ts`도 같은 계약으로 확장.

### 기록 시점 (`src/alarmRunner.ts`)

- `deliver` 성공 → `markSent` 직후 `addHistory`. 둘 다 동기 SQL이라 사이에 다른 처리가 끼지 않는다.
- 발송 실패·재시도 대기·건너뜀(`shouldSend` false)·유예 초과 폐기는 기록하지 않는다.
- 정리: `pruneSent` 옆에서 `pruneHistory(now - 7일, 50)`.
- 알림 기기가 없으면 알람이 돌지 않아 정리가 밀릴 수 있으므로, 조회 시에도 7일·50개로 거른다.

### API (`src/router.ts`, `src/scheduler.ts`)

인증은 기존 Firebase ID 토큰. Firestore를 읽지 않는다.

- `GET /reminders/history` → `200 { items: [{ todoId, title, offsetMinutes, dueAt, sentAt }], lastSeenAt: number }` (최신순, `lastSeenAt` 기본 0)
- `POST /reminders/history/seen` body `{ seenUntil: number }` → `204`. 숫자가 아니면 `400 INVALID_INPUT`.
- CORS `Access-Control-Allow-Methods`에 `GET` 추가.
- DO RPC: `getHistory(uid)`, `markHistorySeen(uid, seenUntil)`.

**읽음 경쟁 처리**: 서버 시각으로 seen을 찍으면 목록 조회 후 ~ seen 전송 전에 도착한 알림이 보지도 않고 읽음 처리된다.
그래서 클라가 화면에 보여준 가장 최신 항목의 `sentAt`을 `seenUntil`로 보내고,
서버는 `lastSeenAt = max(기존값, min(seenUntil, now))`로 저장한다.
`max`는 늦게 도착한 오래된 탭의 요청이 읽음 위치를 되돌리지 못하게, `min(now)`는 미래 값으로 앞으로 올 알림을 미리 읽음 처리하지 못하게 한다.

로그아웃은 토큰만 지우고 기록은 유지한다(DO가 uid별이라 계정 간 분리는 이미 보장된다).

## 클라이언트

### API (`features/reminders/api/reminderProxyApi.ts`)

- `fetchReminderHistory()`, `markReminderHistorySeen(seenUntil)` 추가. 기존 `call()`은 본문을 버리므로 JSON을 돌려주는 변형을 둔다.
- `VITE_REMINDER_PROXY_URL`이 비면 빈 결과(`{ items: [], lastSeenAt: 0 }`)를 돌려준다.

### 훅 (`features/reminders/hooks/useReminderHistory.ts`)

- `useReminderHistory()`: 키 `["reminderHistory", uid]`, 로그인 시에만 활성. 탭 포커스 시 재조회(백그라운드에서 OS 알림을 받고 돌아오는 경우).
- `unreadCount`(= `sentAt > lastSeenAt` 개수)를 훅에서 계산해 제공.
- `useMarkHistorySeen()`: 캐시의 `lastSeenAt`을 먼저 올리는 낙관적 업데이트, 실패 시 롤백 + Sentry. 사용자 토스트는 없음.
- `useForegroundReminders`가 포그라운드 메시지를 받으면 `["reminderHistory"]`를 무효화한다.

### 컴포넌트

- 목록은 `NotificationHistoryList`로 분리(`notificationMenu.tsx`가 이미 설정 로직으로 큼).
- 패널은 열 때의 `lastSeenAt`을 상태로 기억해 ● 표시에 쓴다.

## 테스트

- **Worker (vitest)**: 발송 성공 시에만 기록 / 재시도 후 성공해도 1건 / 실패·건너뜀·폐기 시 기록 없음 / 7일·50개 정리와 조회 시 필터 / seen의 `max`·`min(now)` 규칙 / 라우터 401·404·400·GET 응답 모양·CORS GET.
- **Client (vitest)**: 배지 숫자와 "9+" / 열면 배지 0, ●는 유지 / 항목 클릭 시 이동 + 닫힘 / 빈 상태 / 조회 실패 시 설정 영역 유지 / 포그라운드 메시지 시 무효화. 시간은 시스템 시간 mock으로 고정(절대 날짜 하드코딩 금지).
- **로컬 수동 E2E**: wrangler dev로 실제 발송 → 배지 → 열기 → 다른 탭에서도 배지 사라짐.

## 스코프 밖

- 항목별 읽음, 기록 삭제
- 모바일 앱 UI (모바일 격차 단계에서 같은 API 연결)
- 실시간 배지 갱신(포커스·포그라운드 무효화로 충분)

## 알고 감수한 한계

- 알림 기기가 없는 기간엔 서버 정리가 밀린다 — 조회 시 필터로 사용자 결과는 동일.
- 백그라운드 탭에선 포커스 전까지 배지가 갱신되지 않는다.
- 발송 성공은 "FCM이 한 기기 이상에 수락"을 뜻하며, 실제 OS 표시 여부는 알 수 없다.
