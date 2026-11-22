# 반복 할 일 데이터 명세

> 반복 할 일(`todos` 컬렉션의 반복 회차)을 **읽거나 쓰는 코드를 추가·수정하기 전에** 이 문서를 먼저 확인한다.
> 새 쓰기 경로를 만들면 [8. 새 쓰기 경로 체크리스트](#8-새-쓰기-경로-체크리스트)를 통과시키고, 규칙이 바뀌면 이 문서도 함께 고친다.
>
> 처음 작성: 2026-11-21. 근거는 작성 시점의 코드(`packages/core/src/recurring/`, `packages/core/src/api/`)다.

## 0. 왜 이 문서가 필요한가

반복 데이터는 **시리즈 정보를 회차 문서마다 복사(비정규화)**하는 구조다. 이 구조는 "어느 회차를 열어도 규칙을 읽고 수정할 수 있다"는 장점이 있지만, 바꿀 때마다 모든 사본과 관계를 코드가 직접 맞춰야 한다. 지켜야 할 규칙이 적혀 있지 않아 경로를 추가할 때마다 하나씩 빠졌고, 실제로 다음 버그가 났다.

| 빠진 규칙 | 버그 | 수정 |
|---|---|---|
| 반복을 끌 때 **모든 회차**의 규칙 사본을 지운다 | 꺼 둔 반복이 앱 진입 연장으로 되살아남 | #161 |
| 회차마다 고유한 값은 **복사하지 않는다** | 회차 N개가 구글 일정 1개를 공유, 숨김 상태가 새 회차로 전염 | #167 |
| 문서를 지우는 **모든 경로**는 하위 할 일도 지운다 | 시리즈 삭제 시 하위 할 일이 고아로 남음 | #200 |

## 1. 기준 정의

- **타입의 기준은 core다**: `packages/core/src/types/todo.ts`. 웹 `client/src/features/todo/types/todo.type.ts`에도 같은 모양의 정의가 있는데(이중 정의, 정리 전), 필드를 바꿀 때는 **둘 다** 고치고 core를 기준으로 맞춘다.
- **반복 로직의 기준은 core다**: `packages/core/src/recurring/`. 웹과 앱은 같은 함수를 호출한다. 반복 규칙을 클라이언트에서 따로 구현하지 않는다.
- **날짜**: `startAt`·`dueAt`·`doneAt`은 UTC `Z` ISO 문자열이다. "같은 날짜" 판정과 회차 id의 날짜는 **로컬 타임존** 기준 `YYYY-MM-DD`이고, `split("T")[0]`로 자르면 안 된다(`toDateKeyFromISO` 사용).

## 2. 구조 요약

```
todos/{recurrenceId}_{2026-11-21}  { recurrenceId: "S1", recurrence: {규칙}, status, dueAt, ... }
todos/{recurrenceId}_{2026-11-22}  { recurrenceId: "S1", recurrence: {규칙}, status, dueAt, ... }
todos/{recurrenceId}_{2026-11-23}  { recurrenceId: "S1", recurrence: {규칙}, status, dueAt, ... }
```

- **시리즈 문서는 없다.** 시리즈는 `recurrenceId`가 같은 회차들의 묶음으로만 존재한다.
- 반복 규칙 `recurrence`는 **시리즈 단위 사실의 사본**이 각 회차에 들어 있다.
- 회차는 오늘부터 **호라이즌(`RECURRENCE_HORIZON_WEEKS` = 4주)**까지만 미리 만든다. 그 뒤는 앱을 열 때 연장 작업이 **가장 늦은 회차를 틀로 삼아** 이어 만든다.

## 3. 필드 구분

| 필드 | 단위 | 쓰는 경로 | 규칙 |
|---|---|---|---|
| `recurrenceId` | 시리즈 묶음 | 생성 시 1회 발급 | 반복을 끈 뒤에도 **기록용으로 남을 수 있다**(I4). 수정 중이던 회차를 일반 할 일로 분리할 때만 `null`. |
| `recurrence` | **시리즈 단위(사본)** | 생성, 시리즈 수정 | 같은 `recurrenceId`의 남는 회차는 **모두 같은 값**(I3). 끄면 **모두 `null`**. |
| `title`, `description`, `priority`, `reminderOffsetMinutes` | 시리즈 단위(생성 시점 스냅샷) | 생성, 시리즈 수정의 재생성 | 시리즈 수정은 **창 안의 `todo` 회차만** 새 값으로 재생성한다. 보존되는 `done`·`doing`·지난 회차는 옛 값을 그대로 둔다(기록). |
| `id` | 회차 | 생성 | `{recurrenceId}_{로컬 YYYY-MM-DD}`로 결정론적(I6). |
| `startAt`, `dueAt` | 회차 | 생성 | 회차를 만들 때 `startAt = dueAt`(발생일)로 덮어쓴다. |
| `status`, `doneAt` | 회차 | 사용자 상태 변경 | 새 회차는 항상 `todo` / `null`. |
| `order` | 회차 | 생성 | 루트 할 일 전체에서 이어지는 순번(`getNextRootOrder`). |
| `archived` | 회차 | 앱 진입 정리(30일 지난 완료) | 새 회차는 항상 `false`. |
| `overdueArchived` | 회차 | 앱 진입 정리(지난 미완료 반복 회차 숨김) | 새 회차는 항상 `false`. 기존 문서엔 필드가 없을 수 있어 `!== true`로 판정한다(Firestore 등호 조건 금지). |
| `googleEventId` | **회차(1:1)** | 캘린더 동기화(웹·앱 `useSyncTodosToCalendar`) | 문서 1개 ↔ 구글 일정 1개. **절대 복사하지 않는다**(I5). |
| `createdAt`, `updatedAt` | 회차 | 모든 쓰기 | `updatedAt`은 캘린더 동기화가 "바뀐 회차"를 고르는 기준이다 — 내용이 바뀌는 쓰기는 반드시 갱신한다. |
| `parentId` | 관계 | 하위 할 일 생성 | 반복 회차(`recurrence != null`)에는 하위 할 일을 달 수 없다(I1·I2). |
| `userId` | 소유 | 생성 | `firestore.rules`가 강제한다. 모든 조회는 `where("userId", "==", uid)`를 포함해야 한다(I10). |

**회차를 새로 만들 때 복사하지 않는 값**은 `buildRecurringOccurrenceDoc`(`recurrence.ts`) **한 곳**에서 정리한다: `id`, `googleEventId`, `status`, `doneAt`, `parentId`, `startAt`, `archived`, `overdueArchived`, `createdAt`, `updatedAt`, `order`. 회차별 필드를 새로 만들면 **여기에만 추가**한다.

## 4. 문서 상태

| 상태 | 조건 | 의미 |
|---|---|---|
| 일반 할 일 | `recurrenceId == null` | 반복과 무관 |
| 반복 회차 | `recurrenceId != null && recurrence != null` | 살아 있는 시리즈의 회차. 연장 대상. |
| 반복을 끈 회차 | `recurrenceId != null && recurrence == null` | 반복을 끈 뒤 남은 기록(`done`·`doing`·지난 회차). **연장 대상 아님**. 목록 묶음·배지용으로 `recurrenceId`를 유지. 하위 할 일 추가 **허용**. |

## 5. 쓰기 경로 전체

반복 회차를 쓰는 함수는 모두 core에 있다. 시리즈 단위 쓰기는 `withRecurringSeriesLock`으로 **같은 탭 안에서** 직렬화되고, 탭·기기 사이 경쟁은 결정론적 회차 id로 같은 문서에 수렴시킨다.

| 경로 | 함수 | 하는 일 |
|---|---|---|
| 시리즈 생성 | `createRecurringTodo` (`seriesApi.ts`) | `recurrenceId` 발급, 시작일부터 호라이즌까지 회차 생성. 하위 할 일이면 거부, 생성 0개면 커밋 전에 실패. |
| 시리즈 수정(반복 유지) | `editRecurringSeries` | "이 회차와 이후": 창 시작 = max(수정 회차 날짜, 오늘). `done`·`doing`·창 이전 `todo`는 **보존**, 창 안 `todo`는 삭제 후 새 규칙·새 값으로 재생성. **남는 회차 전부에 새 `recurrence`를 기록**(I3). |
| 반복 끄기 | `editRecurringSeries` (`recurrence: null`) | 창 안 `todo` 회차 삭제(재생성 없음). 수정 중인 회차는 `done`이 아니면 **일반 할 일로 분리**(`recurrence`·`recurrenceId` 모두 `null`). 나머지 남는 회차는 **`recurrence: null`만** 기록(I4). |
| 시리즈 삭제 | `deleteRecurringSeries` | 같은 `recurrenceId` 문서 전부 + **각 회차의 하위 할 일**을 한 batch로 삭제(`in` 30개씩 조회, I7). |
| 할 일 1개 삭제 | `deleteTodo` (`api/todoApi.ts`, 웹은 `client/.../todoApi.ts`) | 그 문서 + 하위 할 일 삭제(I7). 반복 회차의 삭제 UI는 이 경로가 아니라 시리즈 삭제를 탄다. |
| 앱 진입: 연장 | `planIndefiniteExtension` → `buildExtensionCreates` (`startupMaintenance.ts`) | `recurrence != null`인 회차가 있는 시리즈만, **가장 늦은 회차의 규칙**으로 호라이즌까지 이어 생성. `untilDate`는 종료일까지. |
| 앱 진입: 지난 회차 숨김 | `planOverdueRecurringSweep` | 오늘 이전의 `todo` 반복 회차에 `overdueArchived: true`. |
| 앱 진입: 보관 | `planArchivedSweep` | 30일 지난 완료 루트 + 하위를 `archived: true`(하위가 전부 `done`일 때만). |
| 상태·필드 변경 | `updateTodo` 계열 | 회차 1개 수정. 반복 규칙은 여기서 바꾸지 않는다. |
| 캘린더 동기화 | `useSyncTodosToCalendar` (웹·앱) | `googleEventId`만 기록. 대상 판정은 core `calendarSync/plan.ts`. |
| 회원 탈퇴 | `deleteAccount` (웹·앱) | 사용자 문서 전체 삭제 + 구글 일정 정리. |

## 6. 불변식

| # | 규칙 | 지키는 곳 | 테스트 |
|---|---|---|---|
| I1 | `parentId != null`이면 `recurrence == null` (하위 할 일은 반복일 수 없다) | `createRecurringTodo`가 거부 | **없음** |
| I2 | `recurrence != null`인 회차에는 하위 할 일을 추가할 수 없다 | **UI만**(웹 `todoDetail.tsx`, 앱 `TodoDetailScreen.tsx`의 추가 버튼 비활성) | **없음** |
| I3 | 같은 `recurrenceId`의 남는 회차는 모두 같은 `recurrence`를 가진다 | `editRecurringSeries`가 남는 회차 전부에 기록 | `seriesApi.test.ts` |
| I4 | 반복을 끈 시리즈에는 `recurrence != null`인 회차가 남지 않는다 → 연장이 되살리지 않음 | `editRecurringSeries`(OFF 분기) | `seriesApi.test.ts`(끄기 후 실제 `planIndefiniteExtension` 결과 0개) |
| I5 | 회차를 새로 만들 때 회차 고유 값(3절 목록)을 복사하지 않는다 | `buildRecurringOccurrenceDoc` 단일 경로 | `seriesApi.test.ts`(생성·수정 경로), `startupMaintenance.test.ts`(연장 경로). 빌더 자체 단위 테스트는 없음 |
| I6 | 한 시리즈의 한 날짜(로컬)에는 회차 문서가 1개다 | `buildRecurringInstanceId` + `batch.set`(upsert) | `seriesApi.test.ts`, 웹 `recurringTodoApi.test.ts` |
| I7 | 문서를 지우는 모든 경로는 그 문서의 하위 할 일도 지운다 | `deleteTodo`, `deleteRecurringSeries` | `seriesApi.test.ts`(시리즈), 웹 `todoApiDataIntegrity.test.ts`(일반 삭제) |
| I8 | 회차의 내용이 바뀌는 쓰기는 `updatedAt`을 갱신한다 | 각 쓰기 함수 | — |
| I9 | `overdueArchived`·`archived`는 등호 쿼리로 거르지 않는다(필드 없는 옛 문서) | 메모리 판정(`!== true`) | `startupMaintenance.test.ts` |
| I10 | `todos` 조회는 항상 `userId == uid` 조건을 포함한다 | 각 조회 | — (규칙 위반은 운영에서 권한 거부로만 드러남) |

**서버(`firestore.rules`)는 이 중 소유권(`userId`)과 설명 길이만 강제한다.** I1~I9는 전부 클라이언트 코드의 정확성에 달려 있다. 테스트가 "없음"인 불변식은 새 테스트를 걸 후보다.

## 7. 알려진 구멍

- **G1 — core `deleteTodo`의 하위 조회에 `userId` 조건이 없다**(`packages/core/src/api/todoApi.ts`, I10 위반). `firestore.rules`의 read 조건을 쿼리가 보장하지 못해 권한 거부가 날 수 있다. 앱의 일반 할 일 삭제(`mobile/src/hooks/useDeleteTodo.ts`)가 이 함수를 쓴다. **실제 동작 확인 필요**(2026-11-21 발견).
- **G2 — 타입 이중 정의**: 웹과 core에 `Todo`가 따로 있다. 지금은 필드가 같지만 기준이 강제되지 않는다.
- **G3 — I2는 UI에서만 막는다.** 다른 경로(스크립트, 새 화면)가 반복 회차에 하위 할 일을 달 수 있다.
- **G4 — 과거 데이터**: #161 이전에 반복을 끈 시리즈(규칙이 남아 되살아남), #167 이전에 복사된 `googleEventId`, #200 이전에 생긴 고아 하위 할 일이 운영 데이터에 남아 있을 수 있다. 앞의 것은 **데이터로 정상 시리즈와 구별할 수 없어** 정리하지 않는다(사용자가 다시 끄면 이후로는 유지됨). 뒤의 두 개는 판별 가능하다.
- **G5 — 큰 시리즈의 batch 한도**: 규칙 변경 시 남는 회차 전부를 한 batch로 갱신한다. 아주 긴 시리즈는 Firestore batch 한도에 걸릴 수 있다(원자적이라 오류만 나고 반쯤 쓰이지는 않음).

## 8. 새 쓰기 경로 체크리스트

반복 회차나 그 하위 할 일을 **만들거나·바꾸거나·지우는** 코드를 추가할 때:

1. **core에 둔다.** 웹·앱에 따로 구현하지 않는다.
2. 회차를 새로 만들면 **`buildRecurringOccurrenceDoc`을 거친다**(직접 펼쳐 복사 금지, I5).
3. 회차 id는 **`buildRecurringInstanceId`**로 만든다(I6).
4. 규칙(`recurrence`)을 바꾸면 **같은 시리즈의 남는 회차 전부**를 같은 값으로 맞춘다(I3). 끄는 경우 전부 `null`(I4).
5. 문서를 지우면 **하위 할 일도** 지운다(I7).
6. 조회에 **`where("userId", "==", uid)`**를 넣는다(I10).
7. 내용이 바뀌면 **`updatedAt`**을 갱신한다(I8). 캘린더 동기화가 이 값을 본다.
8. 시리즈 단위 쓰기는 **`withRecurringSeriesLock`**으로 감싼다.
9. 이 문서의 5절(경로)과 6절(불변식)을 갱신하고, 불변식마다 테스트를 건다.

## 9. 구조 개선 방향 (기술 부채)

근본 원인은 "시리즈 사실이 회차마다 복사되고, 정합성을 서버가 지켜 주지 않는다"는 구조다. 반복 기능을 크게 손볼 때(예: 반복 할 일 알림) 함께 검토한다.

- 시리즈 문서 도입: `recurringSeries/{id} { rule, status: active | stopped, stoppedAt }`
- 회차는 `seriesId`만 가지고 규칙은 복사하지 않는다.
- 연장은 `status == active`인 시리즈 문서만 본다 → "끄기"는 문서 1개 변경, 되살아날 수 없음, 끈 기록이 남음.
- 비용: core·웹·앱 변경 + 운영 데이터 이주.
