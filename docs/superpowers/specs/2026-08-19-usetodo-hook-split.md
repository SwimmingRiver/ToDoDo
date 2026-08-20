# useTodo 훅 분리 스펙

## 문제

`client/src/features/todo/hooks/useTodo.ts`는 12개의 쿼리/뮤테이션(useGetTodos,
useCreateTodo, useReorderTodos, useUpdateToDone, useUpdateTodoDueAt,
useCreateChildTodo, useCreateRecurringTodo, useEditRecurringSeries,
useDeleteRecurringSeries, useRunStartupMaintenance — 여기에 이미 분리된
useUpdateTodo/useDeleteTodo를 재조합한 것까지 포함)를 하나의 `useTodo()` 훅으로
묶어 반환한다.

소비 컴포넌트 9곳을 조사한 결과, 모든 컴포넌트가 이 12개 중 1~7개만 실제로
사용한다:

| 파일 | 실제 사용 훅 수 |
| --- | --- |
| `App.tsx` | 1 (useRunStartupMaintenance) |
| `today/pages/todayPage.tsx` | 1 (useGetTodos) |
| `today/hooks/useTodayTodos.ts` | 2 (useGetTodos, useUpdateTodo) |
| `todo/pages/todoListPage.tsx` | 1 (useGetTodos) |
| `todo/components/todoList.tsx` | 2 (useDeleteTodo, useDeleteRecurringSeries) |
| `todo/components/todoForm/todoForm.tsx` | 7 |
| `todo/components/todoDetail/todoDetail.tsx` | 6 |
| `dashboard/components/calendar.tsx` | 2 (useGetTodos, useUpdateTodoDueAt) |
| `kanban/components/kanbanBoard.tsx` | 3 (useGetTodos, useUpdateTodo, useReorderTodos) |

`useTodo()`를 호출할 때마다 12개의 `useMutation`/`useQuery` 옵저버가 전부
인스턴스화된다. CLAUDE.md는 이미 리스트 행 컴포넌트(`todoListItem`,
`childTodoCard`, `projectCard`)에 대해 "`useTodo()` 전체를 호출하지 말고 실제로
쓰는 mutation만 독립 훅으로 가져다 쓰라"는 컨벤션을 두고 `useUpdateTodo`,
`useDeleteTodo`를 이미 분리해 두었다. 이번 스펙은 같은 원칙을 나머지 9개
쿼리/뮤테이션과 나머지 9개 소비 컴포넌트에도 적용한다.

## 목표

- `useTodo()` 배럴을 없애고, 12개 쿼리/뮤테이션을 각각 독립 파일·독립 훅으로
  분리한다(이미 분리된 `useUpdateTodo`, `useDeleteTodo`와 동일한 패턴).
- 모든 소비 컴포넌트가 실제로 쓰는 훅만 개별 import해서 호출하도록 바꾼다.
- 기존 동작(쿼리 키, 무효화 범위, optimistic update, 에러 롤백, Sentry 리포팅)은
  전부 그대로 유지한다 — 이번 작업은 순수 구조 추출이며 새 기능이나 동작 변경은
  없다.
- 기존 `useTodo.test.tsx`가 커버하던 테스트 시나리오는 전부 새 훅별 테스트
  파일로 옮기고, 소비 컴포넌트 테스트의 `vi.mock` 대상도 함께 갱신한다.

## 범위 밖

- `useUpdateTodo`, `useDeleteTodo`, `useSearchTodo`는 이미 분리되어 있으므로
  변경하지 않는다.
- 쿼리 무효화 전략이나 optimistic update 로직 자체의 개선은 하지 않는다(별도
  기술부채로 남겨둔다).
- `server/`, `docker-compose.yml`은 건드리지 않는다.

## 대상 파일 인벤토리

**새로 생성**(`client/src/features/todo/hooks/`):
`useGetTodos.ts`, `useTodoDetail.ts`, `useCreateTodo.ts`, `useUpdateToDone.ts`,
`useUpdateTodoDueAt.ts`, `useCreateChildTodo.ts`, `useCreateRecurringTodo.ts`,
`useEditRecurringSeries.ts`, `useDeleteRecurringSeries.ts`,
`useReorderTodos.ts`, `useRunStartupMaintenance.ts` (+ 각각의
`__tests__/*.test.tsx`)

**삭제**: `hooks/useTodo.ts`, `hooks/__tests__/useTodo.test.tsx`

**수정**: `hooks/index.ts`, `features/todo/index.ts`, 그리고 9개 소비
컴포넌트/훅과 그 테스트 파일(`App.tsx`, `today/pages/todayPage.tsx`,
`today/hooks/useTodayTodos.ts`, `todo/pages/todoListPage.tsx`,
`todo/components/todoList.tsx`(+test), `todoForm.tsx`(+test),
`todoDetail.tsx`(+test), `calendar.tsx`(+test), `kanbanBoard.tsx`(+test))
