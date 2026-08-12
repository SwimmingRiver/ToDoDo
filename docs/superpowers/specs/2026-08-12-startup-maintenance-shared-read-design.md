# 앱 진입 스윕 — 읽기 공유 및 무효화 조건화 설계

- 대상 파일: `client/src/features/todo/api/todoApi.ts`, `client/src/features/todo/utils/startupMaintenance.ts`(신규), `client/src/features/todo/hooks/useTodo.ts`, `client/src/App.tsx`
- 작성일: 2026-08-12
- 상태: 사용자 검토 대기 (승인 시 `writing-plans` → 구현)

## 0. 배경

`App.tsx:36-50`은 인증 레이아웃 마운트 시 백그라운드 유지보수 mutation 3개를 각각 발사한다.

| 함수 | 위치 | 읽는 범위 |
| --- | --- | --- |
| `extendIndefiniteRecurringSeries` | `todoApi.ts:803` | `userId`만 — 전체(archived 포함) |
| `sweepArchivedTodos` | `todoApi.ts:293` | done 루트 + **자식마다 별도 쿼리(N+1)** |
| `sweepOverdueRecurringTodos` | `todoApi.ts:375` | `status == "todo"` 전체 |

여기에 화면이 쓰는 `getTodos()`(`archived == false` 전체)가 더해진다. 즉 앱 진입 한 번에 컬렉션 전체 스캔이 **3회 + N+1회** 발생한다.

### 무효화 연쇄

세 mutation의 `onSuccess`는 조건 없이 `invalidateQueries(["todos"])`를 호출한다(`useTodo.ts:217, 230, 243`). 그런데 세 스윕 모두 **대부분의 실행에서 아무것도 쓰지 않고 early return** 한다 — 30일 지난 완료 프로젝트가 없고, 지난 반복 인스턴스가 없고, 호라이즌이 이미 채워져 있는 상태가 정상이다.

쓰기가 없어도 mutation은 성공이므로 `onSuccess`가 돌고, `getTodos()`가 전체를 다시 읽는다. 셋이 서로 다른 시점에 끝나므로 재조회가 최대 3회 추가된다. **하는 일 없이 발생하는 전체 스캔이다.**

Firestore는 문서 읽기 건수로 과금한다. 할 일 500개 사용자 기준 앱 한 번 열 때 3,000건 이상이 나간다.

### 근본 원인

세 스윕이 각자 **읽기·판단·쓰기를 통째로** 안고 있다. 그래서 세 문제가 한 뿌리에서 나온다.

1. 같은 컬렉션을 각자의 쿼리로 세 번 읽는다
2. 판단 로직이 Firestore I/O와 얽혀 있어 에뮬레이터 없이는 테스트할 수 없다
3. "쓸 게 있었나"가 함수 내부에만 있어, 밖으로 빼내려면 신호를 따로 발명해야 한다

읽기·판단·쓰기를 분리하면 3번은 **판단 결과 그 자체**가 되어 별도 신호가 필요 없어진다.

## 1. 결정된 설계 개요

- 사용자의 Todo 전체를 **한 번만** 읽어 세 planner가 공유한다.
- 판단 로직을 순수 함수 3개로 분리해 `utils/startupMaintenance.ts`에 둔다. 이 함수들은 Firestore를 모른다.
- 커밋은 스윕별로 분리해서 유지한다. 각자의 청크 규칙과 정합성 제약이 지금 자리에 그대로 남는다.
- mutation 3개를 1개(`useRunStartupMaintenance`)로 합치고, 계획이 비어있지 않을 때만 `["todos"]`를 무효화한다.

### 명시적으로 채택하지 않은 것

- **단일 배치로 완전 통합**: 세 계획을 하나의 커밋 파이프라인으로 합치면 그룹 정합성 청크 분할기를 공통 레이어로 끌어올려야 한다. 얻는 것(쓰기 왕복 감소)보다 복잡도가 크다고 판단했다.
- **스윕 실행 빈도 제한(하루 1회 등)**: 별도 논의 대상. 이번 범위 아님.
- **쿼리 필터를 Firestore로 내리기**: 복합 색인 추가·배포가 필요해 이번 범위 아님.
- **무효화 합치기**: 커밋이 스윕별로 분리돼 있어도 무효화는 함수 종료 후 1회다. 별도 조율 불필요.

## 2. 모듈 구조

```
client/src/features/todo/
├── utils/startupMaintenance.ts   [신규] planner 3개 — 순수 함수
└── api/todoApi.ts                 읽기 1회 + 커밋. planner를 호출만 한다
```

planner는 `DocumentReference`를 다루지 않는다. 평범한 데이터만 주고받는다.

```ts
/** 기존 문서의 일부 필드를 갱신 */
type TodoFieldUpdate = { id: string; fields: Partial<TodoFields> };

/** 신규 문서 생성(결정론적 ID) */
type TodoCreate = { id: string; doc: TodoFields };

/**
 * 루트와 그 자식은 배치가 쪼개져도 반드시 같은 커밋에 들어가야 한다.
 * 이 제약을 주석이 아니라 타입으로 표현한다.
 */
type ArchiveGroup = { updates: TodoFieldUpdate[] };
```

시그니처:

```ts
planArchivedSweep(todos: Todo[], cutoffISO: string, now: string): ArchiveGroup[]
planOverdueRecurringSweep(todos: Todo[], todayStart: Date, now: string): TodoFieldUpdate[]
planIndefiniteExtension(todos: Todo[], horizonEnd: Date, now: string, nextOrder: number): TodoCreate[]
```

`api` 레이어가 `id`를 `doc(db, "todos", id)`로 바꿔 배치에 싣는다.

`planIndefiniteExtension`의 `nextOrder`가 인자인 이유: `getNextRootOrder`는 Firestore 조회라 순수 함수 안에 둘 수 없다. 다만 현재 코드는 **첫 쓰기가 필요해질 때만** 지연 조회한다(`todoApi.ts:831`). 이 최적화를 잃지 않으려면 planner를 두 단계로 나눈다 — 생성할 날짜 목록을 먼저 계산하고, 비어있지 않을 때만 `getNextRootOrder`를 호출한 뒤 order를 채운다.

## 3. 실행 흐름

```ts
export const runStartupMaintenance = async (
  cutoffDays: number = 30,
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<number> => {
  const userId = getUserId();

  // 1. 읽기 — 한 번
  const allTodos = await fetchAllUserTodos(userId);

  // 2. 판단 + 3. 쓰기 — 스윕별로 독립. 하나가 실패해도 나머지는 진행한다
  let written = 0;
  written += await runSweep("archived", () =>
    commitArchiveGroups(planArchivedSweep(allTodos, cutoffISO, now)),
  );
  written += await runSweep("overdue", () =>
    commitUpdates(planOverdueRecurringSweep(allTodos, todayStart, now)),
  );
  written += await runSweep("extension", () =>
    commitExtension(allTodos, horizonEnd, now, userId),
  );

  return written;
};
```

`runSweep`은 개별 스윕을 `try/catch`로 감싸 실패 시 스윕 이름과 함께 `console.error`로 남기고 `0`을 반환한다. **부분 실패여도 쓴 게 있으면 무효화한다.**

`commitExtension`만 계획이 아니라 `allTodos`를 받는 이유는 `getNextRootOrder` 지연 조회 때문이다(2절 참고). 내부에서 두 단계로 나뉜다 — `planIndefiniteExtension`의 날짜 계산 부분을 먼저 돌려 생성 대상이 있는지 확인하고, 있을 때만 `getNextRootOrder`를 조회한 뒤 order를 채워 커밋한다. 나머지 두 스윕은 계획을 그대로 받는다.

### 동시성

`extendIndefiniteRecurringSeries`는 `withRecurringSeriesLock`으로 보호되고 있다(`todoApi.ts:66-73`) — 읽고 판단한 뒤 쓰는 사이에 사용자의 `editRecurringSeries`가 끼어들면 stale 스냅샷 기준으로 커밋되어 중복 인스턴스가 생기기 때문이다.

공유 읽기로 바뀌어도 이 위험은 그대로다. 오히려 읽기와 쓰기 사이 간격이 길어진다(다른 두 스윕의 커밋이 사이에 낀다). 따라서 **`runStartupMaintenance` 전체를 `withRecurringSeriesLock`으로 감싼다.** 락은 제네릭 `<T>`라 반환 타입이 그대로 통과한다.

`buildRecurringInstanceId`의 결정론적 문서 ID가 2차 방어선으로 남아 있어(`todoApi.ts:52`), 락을 넘어선 멀티탭 경합에서도 중복 문서 대신 덮어쓰기로 수렴한다.

## 4. 읽기 범위

공유 스냅샷은 `where("userId", "==", userId)` 하나만 건다. 현재 `extendIndefiniteRecurringSeries`가 이미 하는 것과 동일하므로(`todoApi.ts:805`) 읽기량 회귀는 없다.

`archived == false`로 좁히지 않는 이유: 반복 시리즈의 마지막 인스턴스가 archived된 경우 그걸 제외하고 계산하면 `latest.dueAt`이 과거로 밀려, 이미 지난 날짜의 인스턴스를 다시 만들어낸다. 결정론적 ID 덕에 중복 문서는 안 생기지만 archived된 문서를 되살리게 된다.

## 5. 호출부 변경

`useTodo.ts` — mutation 3개 제거, 1개 추가:

```ts
const useRunStartupMaintenance = useMutation({
  mutationFn: () => runStartupMaintenance(),
  onSuccess: (written) => {
    if (written > 0) {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    }
  },
  onError: (error) => {
    console.error("앱 진입 유지보수 실패:", error);
  },
});
```

`App.tsx` — `.mutate()` 3번과 `hasXxxRef` 3개가 각각 1개로 줄어든다.

## 6. 테스트 전략

**신규 유닛 테스트** `utils/__tests__/startupMaintenance.test.ts` — planner 3개의 판단 로직. planner는 Firestore를 모르므로 `vi.mock("firebase/firestore")` 없이 배열을 넣고 배열을 받는 평범한 테스트가 된다.

- 컷오프 경계(정확히 30일, 29일, 31일)
- 호라이즌 경계(마지막 인스턴스가 호라이즌과 같은 날 / 하루 전)
- `overdueArchived` 필드가 **아예 없는** 기존 문서(백필 없이 안전해야 함 — `todoApi.ts:369` 주석의 계약)
- 루트+자식 그룹핑이 `parentId`로 정확한지 (N+1 제거의 핵심)
- 쓸 게 없을 때 빈 배열 반환

**기존 테스트 3개** (`sweepArchivedTodos.test.ts`, `sweepOverdueRecurringTodos.test.ts`, `recurringTodoApi.test.ts`) — 판단 케이스를 planner 유닛 테스트로 넘기고, 실제 커밋·청크 분할·그룹 정합성 검증으로 범위를 좁힌다.

이 테스트들은 에뮬레이터가 아니라 `vi.mock("firebase/firestore")`로 Firestore를 통째로 모킹한다. 그런데 **`getDocs` 호출 순서에 결합돼 있다** — `mockResolvedValueOnce`를 체인으로 걸어 "첫 번째 호출은 루트 조회, 두 번째는 자식 조회" 식으로 가정한다(`sweepArchivedTodos.test.ts:98-104`). 이번 변경이 읽기를 3회+N+1에서 1회로 줄이므로 **이 모의 설정은 반드시 깨진다.** 재작성은 선택이 아니라 필수다.

기존 테스트 중 반환값을 단언하는 곳은 0건이라 시그니처 변경 자체가 깨뜨리는 것은 없다.

**회귀 방지 테스트**: 쓸 게 없는 상태에서 `runStartupMaintenance()`가 `0`을 반환하는지. 이게 무효화가 안 도는 것을 보장하는 지점이다.

날짜는 절대값을 하드코딩하지 않고 시스템 시간을 mock으로 고정한다. CI가 UTC라 로컬에서만 통과하는 테스트가 나온 전례가 있다.

## 7. 기대 효과

앱 진입 1회당 컬렉션 조회 횟수:

| 조회 | 이전 | 이후 |
| --- | --- | --- |
| `getTodos()` (화면용) | 1 | 1 |
| 스윕용 읽기 | 3 (extend 전체 / overdue 전체 / archived 루트) | 1 (공유 스냅샷) |
| 자식 조회 | N+1 순차 | 0 (메모리 그룹핑) |
| 무효화로 인한 `getTodos()` 재조회 | 최대 3 | 쓴 게 있을 때만 1 |

- **정상 상태**(쓸 게 없는 대부분의 실행): `4 + N` → **2**
- **쓸 게 있는 실행**: `4 + N + 최대 3` → **3**

`onSuccess`가 조건 없이 도는 지금은 쓸 게 없어도 재조회 비용을 그대로 낸다. 그게 이번 변경으로 사라지는 가장 큰 몫이다.

테스트 측면에서는 판단 로직이 Firestore 모의(`getDocs` 호출 순서에 결합된 `mockResolvedValueOnce` 체인)에서 벗어나, 배열을 넣고 배열을 받는 순수 함수 테스트가 된다.

## 8. 범위 밖 (기록)

- **archived 문서 무한 누적**: `sweepArchivedTodos`는 플래그만 세우고 삭제하지 않아 컬렉션이 영구히 자란다. 공유 스냅샷이 매번 이걸 전부 읽는다. 이번 변경으로 읽기 횟수는 3회→1회로 줄지만, 그 1회의 무게는 계정 수명에 비례해 계속 커진다.
- **쿼리 필터 서버 이관**: 복합 색인 추가·배포 필요.
- **페이지네이션 부재**: 코드베이스 전체에 `limit()` 사용 0건.
