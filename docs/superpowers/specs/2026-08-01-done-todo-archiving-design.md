# done 할 일 아카이빙 — 쿼리 최적화 설계

- 대상 파일: `client/src/features/todo/api/todoApi.ts`, `client/src/features/todo/hooks/useTodo.ts`, `client/src/App.tsx`, `firestore.rules`(필요 시), 신규 1회성 마이그레이션 스크립트
- 작성일: 2026-08-01
- 상태: 사용자 검토 대기 (승인 시 `writing-plans` → `frontend-developer`가 구현)

## 0. 배경

`getTodos()`(`client/src/features/todo/api/todoApi.ts:93-100`)는 `userId`로만 필터링해 사용자의 모든 Todo 문서(todo/doing/done 전체)를 한 번에 가져온다. 이 결과 하나(TanStack Query 키 `["todos"]`)를 목록/칸반/캘린더/오늘/검색 화면이 전부 공유한다(`useTodo.ts` 확인). done이 삭제되지 않고 계속 쌓이면, 활성 작업량과 무관하게 앱 진입 시마다 다운로드/파싱/정렬해야 하는 문서 수가 계속 늘어난다.

당초 "삭제" 여부를 논의했으나, 프로젝트 진행률(`getProjectProgress`) 같은 UI가 완료 이력에 의존하고 있어 원본 데이터를 지우지 않기로 했다. 대신 **기본 조회에서 오래된 done을 제외(아카이빙)**하는 쪽으로 방향을 잡았다.

### 핵심 제약 (설계 과정에서 발견)

`getProjectProgress`/`getProjectSubtaskInfo`(`client/src/features/todo/utils/projectUtils.ts`)는 `parentId`로 형제 서브태스크를 찾아 done 비율을 계산한다. 목록 페이지는 이미 done인 **루트** 프로젝트만 화면에서 제외하므로(`todoList.tsx:57,78` `filter(todo => todo.status !== "done")`), 진행 중인 프로젝트(루트가 아직 done 아님)는 서브태스크가 아무리 오래전에 done됐어도 계속 화면에 필요하다.

따라서 **개별 항목의 `doneAt` 단독 기준으로 시간창 필터를 걸면 안 된다.** 형제 서브태스크 중 하나가 먼저 오래전에 끝나고 나머지는 진행 중인 프로젝트가 있으면, 그 항목이 쿼리에서 빠지는 순간 진행률 계산(`total`, `doneCount`)이 조용히 틀어진다. 아카이빙 판단은 **루트 프로젝트 전체 단위**(루트+그 자식들)로 묶어서, 루트 자신이 done이 된 시점(=`calcParentStatus`가 이미 계산해주는, 모든 자식이 done이 된 바로 그 시점) 기준으로만 해야 한다.

## 1. 결정된 설계 개요

- Todo 문서에 `archived: boolean` 필드를 추가한다.
- `getTodos()`에 `where("archived", "==", false)` 조건을 추가한다. 이 함수 하나가 모든 화면의 데이터 소스이므로, 여기 한 곳만 고치면 전체에 자동 반영된다.
- 신규 함수 `sweepArchivedTodos()`: 앱 진입 시 1회, 루트가 done된 지 30일 지난 항목을 찾아 루트+그 자식 전체에 `archived: true`를 batch write한다.
- 서버/크론이 없는 프로젝트 구조상, 기존 `extendIndefiniteRecurringSeries`(App.tsx 마운트 시 1회 호출, 실패해도 조용히 넘어가고 콘솔에만 로그, 다음 접속 때 재시도)와 완전히 같은 패턴을 그대로 따른다.
- 완료 이력을 다시 조회하는 "완료 보관함" 화면은 **이번 스코프에 포함하지 않는다.** 이번 작업은 쿼리 구조 개선까지만 다루고, 조회 UI는 별도 백로그로 남긴다.

## 2. 데이터 모델 변경

```ts
interface Todo {
  // ...기존 필드 동일
  archived: boolean; // 신규. 기본값 false. true면 기본 조회(getTodos)에서 제외됨
}
```

- `archived`는 "완료됨"과 별개 개념이다. `status`는 사용자가 보는 작업 상태(todo/doing/done)를 뜻하고, `archived`는 순수하게 "기본 목록 쿼리에 포함할지"를 뜻하는 내부 최적화용 플래그다. `archived: true`인 문서는 항상 `status: "done"`이지만 역은 성립하지 않는다(done이어도 30일 안 지났으면 archived는 false).

## 3. 쿼리 변경

```ts
export const getTodos = async () => {
  const userId = getUserId();
  const q = query(
    todosRef,
    where("userId", "==", userId),
    where("archived", "==", false),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => mapDocToTodo(doc.id, doc.data()))
    .sort((a, b) => normalizeOrder(a.order) - normalizeOrder(b.order));
};
```

`getSearchTodoList`는 내부적으로 `getTodos()`를 호출하므로 자동으로 같이 적용된다. `getTodoDetail`(단건 조회, id로 직접 조회)은 아카이빙 여부와 무관하게 항상 조회 가능해야 하므로 필터를 추가하지 않는다 — 아카이빙된 항목의 상세 페이지 직링크 등은 계속 열려야 한다.

`createTodo`/`getNextRootOrder`의 order 계산용 쿼리(`parentId == null`)는 `archived` 필터를 추가하지 않는다. 아카이빙된 done 루트가 order 계산에 섞여도(둘 다 `Math.max`로만 쓰임) 정확성에 영향이 없다.

## 4. 스윕 메커니즘

```ts
export const sweepArchivedTodos = async (
  cutoffDays: number = 30,
): Promise<void> => {
  const userId = getUserId();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);
  const cutoffISO = cutoff.toISOString();

  const rootsSnapshot = await getDocs(
    query(
      todosRef,
      where("userId", "==", userId),
      where("parentId", "==", null),
      where("status", "==", "done"),
      where("archived", "==", false),
      where("doneAt", "<", cutoffISO),
    ),
  );

  if (rootsSnapshot.empty) return;

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  for (const rootDoc of rootsSnapshot.docs) {
    batch.update(rootDoc.ref, { archived: true, updatedAt: now });

    const childrenSnapshot = await getDocs(
      query(
        todosRef,
        where("userId", "==", userId),
        where("parentId", "==", rootDoc.id),
      ),
    );
    childrenSnapshot.docs.forEach((childDoc) => {
      batch.update(childDoc.ref, { archived: true, updatedAt: now });
    });
  }

  await batch.commit();
};
```

- 자식 조회 시 `status`/`archived` 조건을 걸지 않는다 — 루트가 done이라는 것은 `calcParentStatus` 불변식상 모든 자식이 이미 done이라는 뜻이므로, 자식의 현재 상태를 다시 확인할 필요 없이 전부 archived 처리한다.
- `useTodo.ts`에 `useSweepArchivedTodos` 훅을 `useExtendIndefiniteRecurringSeries`와 동일한 형태(성공 시 `["todos"]` invalidate, 실패 시 `console.error`)로 추가하고, `App.tsx`에서 마운트 시 같이 호출한다.

## 5. 신규 문서 생성 시 `archived` 필드

다음 4개 생성 경로 모두 문서 생성 시 `archived: false`를 명시적으로 채운다: `createTodo`, `createChildTodo`, `createRecurringTodoImpl`(인스턴스 batch.set), `editRecurringSeriesImpl`(재생성 batch.set). 필드를 빠뜨리면 해당 문서가 `getTodos()`의 `archived == false` 필터에 걸려 화면에서 영원히 안 보이게 되므로, 이 4곳 전부 빠짐없이 확인해야 한다.

## 6. 마이그레이션/롤아웃

- **문제**: Firestore의 `where("archived", "==", false)`는 `archived` 필드가 아예 없는 기존 문서를 결과에서 제외한다. 필터부터 배포하면 지금까지 쌓인 데이터가 전부(done 여부 무관) 화면에서 사라진다.
- **백필**: Firebase Admin SDK로 1회성 스크립트를 작성해 `todos` 컬렉션 전체를 순회, `archived` 필드가 없는 문서에만 batch로 `archived: false`를 채운다. 이미 필드가 있는 문서는 건드리지 않아 재실행해도 안전(멱등)하다.
- **배포 순서**: ① 백필 스크립트 실행 및 완료 확인 → ② `getTodos()` 필터 배포. 순서를 반드시 지킨다.
- **Firestore 복합 인덱스**: `sweepArchivedTodos()`의 쿼리(`userId` + `parentId` + `status` + `archived` + `doneAt` 범위)에 새 복합 인덱스가 필요하다. 이 저장소는 `firestore.indexes.json`을 관리하지 않고 콘솔 기반으로 보이므로(`firebase.json`엔 `rules`만 등록), 첫 배포 후 Firestore 콘솔 에러에 뜨는 인덱스 생성 링크를 사용하거나 배포 전 콘솔에서 미리 생성해둔다.

## 7. 엣지케이스

- 자식 없는 단독 투두, done 30일+ 경과 → archived
- 프로젝트(자식 있음), 모든 자식 done & 루트 done 30일+ 경과 → 루트+자식 전부 archived
- 프로젝트 진행 중(자식 하나가 40일 전 done, 형제는 아직 todo/doing이라 루트는 done 아님) → **아무것도 archived 안 됨**
- 새로 만든 투두는 `archived: false`가 명시적으로 찍혀 있어야 함(5절 4곳)
- 마이그레이션 스크립트 재실행 시 이미 필드 있는 문서는 스킵(멱등성)
- `deleteTodo`는 `archived` 여부와 무관하게 항상 동작해야 함(현재 코드는 필터 없이 id로 직접 삭제하므로 영향 없음 — 회귀 없는지만 확인)
- 반복 시리즈 인스턴스는 항상 `parentId: null`(루트)이므로 별도 처리 없이 루트 규칙을 그대로 적용받음

## 8. 테스트

- `sweepArchivedTodos` 유닛 테스트: 위 엣지케이스를 모두 커버. **시스템 날짜를 절대값으로 하드코딩하지 말고 `vi.setSystemTime` 등으로 mock**해서 고정한다(이 프로젝트 기존 테스트 컨벤션 — CI가 UTC 환경이라 타임존도 함께 고려).
- `getTodos` 유닛 테스트: `archived: true` 문서가 결과에서 빠지는지 확인하는 케이스 추가.
- 신규 문서 생성 4곳 각각에 `archived: false`가 찍히는지 확인하는 케이스 추가(기존 테스트에 필드 하나 추가하는 정도).

## 9. 범위

### 변경 대상

- `client/src/features/todo/types/todo.type.ts` — `Todo`에 `archived: boolean` 추가
- `client/src/features/todo/api/todoApi.ts` — `getTodos` 필터 추가, `sweepArchivedTodos` 신규, `createTodo`/`createChildTodo`/`createRecurringTodoImpl`/`editRecurringSeriesImpl`에 `archived: false` 추가
- `client/src/features/todo/hooks/useTodo.ts` — `useSweepArchivedTodos` 훅 추가
- `client/src/App.tsx` — 마운트 시 `useSweepArchivedTodos` 호출 추가
- 신규 1회성 마이그레이션 스크립트(리포지토리 내 위치는 구현 단계에서 결정 — 예: `scripts/backfill-archived-field.ts`)

### 범위 밖 (변경하지 않음)

- "완료 보관함" 등 archived 항목을 다시 조회하는 UI — 백로그
- `server/`, `docker-compose.yml` — CLAUDE.md 정책상 무관
- 삭제(하드 delete) 정책 — 이번 설계는 보관을 전제로 하며 삭제 기능을 추가하지 않는다
- 아카이빙 기준 기간(30일)을 사용자가 설정에서 바꾸는 기능 — 하지 않는다(YAGNI)

## 10. 다음 담당자(frontend-developer)에게 전달할 사항

- **배포 순서를 반드시 지킬 것**: 마이그레이션 백필 → `getTodos()` 필터 배포. 순서가 바뀌면 기존 데이터가 전부 사라지는 사고가 난다(6절).
- 아카이빙 판단은 개별 항목의 `doneAt`이 아니라 **루트의 `doneAt`**을 기준으로 한다 — 형제 서브태스크가 있는 프로젝트의 진행률 계산이 깨지지 않으려면 이 규칙을 반드시 지켜야 한다(0절 핵심 제약).
- 신규 문서 생성 경로 4곳(5절) 중 하나라도 `archived: false`를 빠뜨리면 그 문서는 영원히 목록에 안 보이는 조용한 버그가 된다 — 구현 후 전체 테스트와 함께 실제로 새 할 일을 만들어 목록에 뜨는지 육안 확인 권장.
- `sweepArchivedTodos()`의 신규 복합 인덱스(userId+parentId+status+archived+doneAt)는 로컬 개발 중 Firestore 콘솔 에러로 나타날 수 있다 — 에러 메시지의 인덱스 생성 링크를 그대로 따라가면 된다.
