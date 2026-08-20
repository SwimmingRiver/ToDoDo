# useTodo 훅 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `useTodo()` 12개 쿼리/뮤테이션 배럴을 제거하고, 이미 확립된
`useUpdateTodo`/`useDeleteTodo` 패턴대로 각각 독립 훅 파일로 분리해서 9개 소비
컴포넌트가 실제로 쓰는 훅만 import하게 만든다.

**Architecture:** `hooks/useTodo.ts` 안의 각 `useMutation`/`useQuery` 블록을
그대로(동작 변경 없이) 개별 파일로 옮긴다. `hooks/index.ts`와
`features/todo/index.ts` 배럴에 새 훅들을 추가 export 하고, 소비
컴포넌트들이 새 훅으로 갈아탄 뒤에야 `useTodo.ts`와 그 테스트, 배럴의
`useTodo` export를 제거한다. 각 단계에서 앱은 항상 빌드/테스트 가능한 상태를
유지한다.

**Tech Stack:** React, TanStack Query (`useMutation`/`useQuery`), Vitest +
Testing Library(`renderHook`), TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-19-usetodo-hook-split.md`

## Global Constraints

- 모든 명령은 `client/` 디렉토리에서 실행한다.
- 기존 쿼리 키(`["todos"]`, `["todoDetail", id]`), 무효화 범위, optimistic
  update/롤백, Sentry 리포팅 로직은 한 글자도 바꾸지 않는다 — 순수 추출이다.
- 새 훅 이름은 기존 `useTodo()`가 반환하던 프로퍼티 이름과 동일하게 유지한다
  (`useUpdateTodo`, `useDeleteTodo`가 이미 그렇듯).
- 파일명 컨벤션은 `camelCase.tsx`/`.ts`.
- 각 태스크 종료 시 해당 파일 범위의 테스트가 통과해야 한다. 마지막 태스크에서
  전체 테스트(`npm run test`), 린트(`npm run lint`), 빌드(`npm run build`)를
  한 번에 검증한다.

---

## Task 1: useGetTodos, useTodoDetail 추출

**Files:**
- Create: `client/src/features/todo/hooks/useGetTodos.ts`
- Create: `client/src/features/todo/hooks/useTodoDetail.ts`
- Test: `client/src/features/todo/hooks/__tests__/useGetTodos.test.tsx`
- Test: `client/src/features/todo/hooks/__tests__/useTodoDetail.test.tsx`
- Modify: `client/src/features/todo/hooks/index.ts`

**Interfaces:**
- Produces: `useGetTodos(): UseQueryResult<Todo[]>`, `useTodoDetail({ id: string }): { todo: Todo | undefined }`

- [ ] **Step 1: useGetTodos.ts 작성**

```ts
import { useQuery } from "@tanstack/react-query";
import { getTodos } from "../api";

export const useGetTodos = () =>
  useQuery({
    queryKey: ["todos"],
    queryFn: getTodos,
  });
```

- [ ] **Step 2: useTodoDetail.ts 작성**

```ts
import { useQuery } from "@tanstack/react-query";
import { getTodoDetail } from "../api";

export const useTodoDetail = ({ id }: { id: string }) => {
  const { data: todo } = useQuery({
    queryKey: ["todoDetail", id],
    queryFn: () => getTodoDetail(id),
  });
  return { todo };
};
```

- [ ] **Step 3: useGetTodos.test.tsx 작성**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useGetTodos } from '../useGetTodos'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ getTodos: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'test-user-id',
  title: '테스트 할 일',
  status: 'todo',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useGetTodos 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('할 일 목록을 성공적으로 가져와야 한다', async () => {
    const { getTodos } = await import('../../api')
    const mockTodos = [
      makeTodo({ id: 'todo-1', title: '첫 번째 할 일' }),
      makeTodo({ id: 'todo-2', title: '두 번째 할 일', order: 1 }),
    ]
    vi.mocked(getTodos).mockResolvedValueOnce(mockTodos)

    const { result } = renderHook(() => useGetTodos(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].title).toBe('첫 번째 할 일')
  })

  it('API 호출 실패 시 에러 상태를 반환해야 한다', async () => {
    const { getTodos } = await import('../../api')
    vi.mocked(getTodos).mockRejectedValueOnce(new Error('Firestore 오류'))

    const { result } = renderHook(() => useGetTodos(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})
```

- [ ] **Step 4: useTodoDetail.test.tsx 작성**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTodoDetail } from '../useTodoDetail'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ getTodoDetail: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-detail-1',
  userId: 'test-user-id',
  title: '상세 할 일',
  status: 'todo',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useTodoDetail 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('특정 ID의 할 일 상세 정보를 가져와야 한다', async () => {
    const { getTodoDetail } = await import('../../api')
    vi.mocked(getTodoDetail).mockResolvedValueOnce(makeTodo())

    const { result } = renderHook(() => useTodoDetail({ id: 'todo-detail-1' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.todo).toBeDefined()
    })

    expect(result.current.todo?.title).toBe('상세 할 일')
    expect(vi.mocked(getTodoDetail)).toHaveBeenCalledWith('todo-detail-1')
  })

  it('초기 상태에서 todo는 undefined여야 한다', async () => {
    const { getTodoDetail } = await import('../../api')
    vi.mocked(getTodoDetail).mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useTodoDetail({ id: 'any-id' }), {
      wrapper: createWrapper(),
    })

    expect(result.current.todo).toBeUndefined()
  })
})
```

- [ ] **Step 5: 테스트 실행**

Run: `cd client && npm run test -- useGetTodos useTodoDetail`
Expected: 두 파일 모두 PASS

- [ ] **Step 6: hooks/index.ts에 export 추가**

`export { useTodo, useTodoDetail } from "./useTodo";` 줄은 그대로 두고
(아직 소비처가 옮겨가지 않았으므로 삭제하지 않는다), 아래 줄을 추가한다:

```ts
export { useGetTodos } from "./useGetTodos";
```

`useTodoDetail`은 기존에 이미 `useTodo.ts`에서 export되고 있으므로,
이 태스크에서는 export 소스만 바꾼다 — `export { useTodo, useTodoDetail } from "./useTodo"` 를
`export { useTodo } from "./useTodo"` + `export { useTodoDetail } from "./useTodoDetail"` 로 나눈다.

최종 `hooks/index.ts`:

```ts
export { useTodo } from "./useTodo";
export { useTodoDetail } from "./useTodoDetail";
export { useGetTodos } from "./useGetTodos";
export { useSearchTodo } from "./useSearchTodo";
export { useDeleteTodo } from "./useDeleteTodo";
export { useUpdateTodo } from "./useUpdateTodo";
```

- [ ] **Step 7: 기존 useTodo.ts에서 중복 정의된 useTodoDetail 제거 확인**

`useTodo.ts` 파일의 `useTodoDetail` export(옛 190번째 줄 근방)는 아직 지우지
않는다 — `useTodo.ts`가 지금 이 시점에는 여전히 다른 파일에서 참조되는
`useTodo()`(umbrella)를 담고 있는 채로 남아야 하기 때문이다. `useTodoDetail`
중복 정의만 문제이므로, `useTodo.ts`에서 `export const useTodoDetail = ...`
블록 전체를 삭제하고 파일 맨 위에 `export { useTodoDetail } from "./useTodoDetail";`
재export를 추가해 하위 호환을 유지한다:

```ts
export { useTodoDetail } from "./useTodoDetail";
```

- [ ] **Step 8: 전체 테스트 실행으로 회귀 확인**

Run: `cd client && npm run test -- useTodo`
Expected: 기존 `useTodo.test.tsx`(아직 손대지 않음)도 계속 PASS

- [ ] **Step 9: 커밋**

```bash
git add client/src/features/todo/hooks/useGetTodos.ts \
  client/src/features/todo/hooks/useTodoDetail.ts \
  client/src/features/todo/hooks/__tests__/useGetTodos.test.tsx \
  client/src/features/todo/hooks/__tests__/useTodoDetail.test.tsx \
  client/src/features/todo/hooks/index.ts \
  client/src/features/todo/hooks/useTodo.ts
git commit -m "refactor: useGetTodos, useTodoDetail을 useTodo에서 분리"
```

---

## Task 2: useCreateTodo 추출

**Files:**
- Create: `client/src/features/todo/hooks/useCreateTodo.ts`
- Test: `client/src/features/todo/hooks/__tests__/useCreateTodo.test.tsx`
- Modify: `client/src/features/todo/hooks/index.ts`

- [ ] **Step 1: useCreateTodo.ts 작성**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import { createTodo } from "../api";

export const useCreateTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (todo: Todo) => createTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
};
```

- [ ] **Step 2: useCreateTodo.test.tsx 작성**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCreateTodo } from '../useCreateTodo'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ createTodo: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'new-todo',
  userId: 'test-user-id',
  title: '새 할 일',
  status: 'todo',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useCreateTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('할 일 생성 mutation이 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useCreateTodo(), { wrapper: createWrapper() })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('할 일 생성 성공 시 createTodo를 호출해야 한다', async () => {
    const { createTodo } = await import('../../api')
    const newTodo = makeTodo()
    vi.mocked(createTodo).mockResolvedValueOnce(newTodo)

    const { result } = renderHook(() => useCreateTodo(), { wrapper: createWrapper() })

    result.current.mutate(newTodo)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(createTodo)).toHaveBeenCalledWith(newTodo)
  })
})
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- useCreateTodo`
Expected: PASS

- [ ] **Step 4: hooks/index.ts에 export 추가**

```ts
export { useCreateTodo } from "./useCreateTodo";
```

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/hooks/useCreateTodo.ts \
  client/src/features/todo/hooks/__tests__/useCreateTodo.test.tsx \
  client/src/features/todo/hooks/index.ts
git commit -m "refactor: useCreateTodo를 useTodo에서 분리"
```

---

## Task 3: useUpdateToDone 추출

**Files:**
- Create: `client/src/features/todo/hooks/useUpdateToDone.ts`
- Test: `client/src/features/todo/hooks/__tests__/useUpdateToDone.test.tsx`
- Modify: `client/src/features/todo/hooks/index.ts`

- [ ] **Step 1: useUpdateToDone.ts 작성**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateToDone } from "../api";

export const useUpdateToDone = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => updateToDone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};
```

- [ ] **Step 2: useUpdateToDone.test.tsx 작성**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useUpdateToDone } from '../useUpdateToDone'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ updateToDone: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

describe('useUpdateToDone 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('완료 처리 mutation이 정의되어 있어야 한다', () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useUpdateToDone(), { wrapper: Wrapper })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('성공 시 todos, todoDetail 쿼리를 무효화해야 한다', async () => {
    const { updateToDone } = await import('../../api')
    vi.mocked(updateToDone).mockResolvedValueOnce(undefined)

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateToDone(), { wrapper: Wrapper })

    result.current.mutate('todo-1')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(updateToDone)).toHaveBeenCalledWith('todo-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todoDetail'] })
  })
})
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- useUpdateToDone`
Expected: PASS

- [ ] **Step 4: hooks/index.ts에 export 추가**

```ts
export { useUpdateToDone } from "./useUpdateToDone";
```

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/hooks/useUpdateToDone.ts \
  client/src/features/todo/hooks/__tests__/useUpdateToDone.test.tsx \
  client/src/features/todo/hooks/index.ts
git commit -m "refactor: useUpdateToDone을 useTodo에서 분리"
```

---

## Task 4: useUpdateTodoDueAt 추출

**Files:**
- Create: `client/src/features/todo/hooks/useUpdateTodoDueAt.ts`
- Test: `client/src/features/todo/hooks/__tests__/useUpdateTodoDueAt.test.tsx`
- Modify: `client/src/features/todo/hooks/index.ts`

- [ ] **Step 1: useUpdateTodoDueAt.ts 작성**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodoDueAt } from "../api";

export const useUpdateTodoDueAt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      dueAt,
      startAt,
    }: {
      id: string;
      dueAt: string | null;
      startAt?: string | null;
    }) => updateTodoDueAt(id, dueAt, startAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};
```

- [ ] **Step 2: useUpdateTodoDueAt.test.tsx 작성**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useUpdateTodoDueAt } from '../useUpdateTodoDueAt'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ updateTodoDueAt: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useUpdateTodoDueAt 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('마감일 변경 mutation이 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useUpdateTodoDueAt(), { wrapper: createWrapper() })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('id, dueAt, startAt을 그대로 전달해야 한다', async () => {
    const { updateTodoDueAt } = await import('../../api')
    vi.mocked(updateTodoDueAt).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useUpdateTodoDueAt(), { wrapper: createWrapper() })

    result.current.mutate({ id: 'todo-1', dueAt: '2026-08-20T00:00:00.000Z', startAt: null })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(updateTodoDueAt)).toHaveBeenCalledWith(
      'todo-1',
      '2026-08-20T00:00:00.000Z',
      null,
    )
  })
})
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- useUpdateTodoDueAt`
Expected: PASS

- [ ] **Step 4: hooks/index.ts에 export 추가**

```ts
export { useUpdateTodoDueAt } from "./useUpdateTodoDueAt";
```

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/hooks/useUpdateTodoDueAt.ts \
  client/src/features/todo/hooks/__tests__/useUpdateTodoDueAt.test.tsx \
  client/src/features/todo/hooks/index.ts
git commit -m "refactor: useUpdateTodoDueAt을 useTodo에서 분리"
```

---

## Task 5: useCreateChildTodo 추출

**Files:**
- Create: `client/src/features/todo/hooks/useCreateChildTodo.ts`
- Test: `client/src/features/todo/hooks/__tests__/useCreateChildTodo.test.tsx`
- Modify: `client/src/features/todo/hooks/index.ts`

- [ ] **Step 1: useCreateChildTodo.ts 작성**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import { createChildTodo } from "../api";

export const useCreateChildTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      parentId,
      todo,
    }: {
      parentId: string;
      todo: Partial<Todo>;
    }) => {
      const allTodos = queryClient.getQueryData<Todo[]>(["todos"]) ?? [];
      return createChildTodo(parentId, todo, allTodos);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      // 자식 생성은 부모의 status/doneAt도 재계산해 갱신하므로(createChildTodo),
      // 부모가 상세 페이지에 열려 있다면 그 캐시도 함께 무효화해야 한다.
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};
```

- [ ] **Step 2: useCreateChildTodo.test.tsx 작성**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCreateChildTodo } from '../useCreateChildTodo'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ createChildTodo: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'parent-1',
  userId: 'test-user-id',
  title: '부모 할 일',
  status: 'todo',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  queryClient.setQueryData(['todos'], [makeTodo()])
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useCreateChildTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('하위 할 일 생성 mutation이 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useCreateChildTodo(), { wrapper: createWrapper() })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('캐시된 전체 목록을 함께 넘겨 createChildTodo를 호출해야 한다', async () => {
    const { createChildTodo } = await import('../../api')
    vi.mocked(createChildTodo).mockResolvedValueOnce(makeTodo({ id: 'child-1', parentId: 'parent-1' }))

    const { result } = renderHook(() => useCreateChildTodo(), { wrapper: createWrapper() })

    result.current.mutate({ parentId: 'parent-1', todo: { title: '자식 할 일' } })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(createChildTodo)).toHaveBeenCalledWith(
      'parent-1',
      { title: '자식 할 일' },
      [makeTodo()],
    )
  })
})
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- useCreateChildTodo`
Expected: PASS

- [ ] **Step 4: hooks/index.ts에 export 추가**

```ts
export { useCreateChildTodo } from "./useCreateChildTodo";
```

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/hooks/useCreateChildTodo.ts \
  client/src/features/todo/hooks/__tests__/useCreateChildTodo.test.tsx \
  client/src/features/todo/hooks/index.ts
git commit -m "refactor: useCreateChildTodo를 useTodo에서 분리"
```

---

## Task 6: useCreateRecurringTodo, useEditRecurringSeries, useDeleteRecurringSeries 추출

세 훅 모두 반복(recurrence) 시리즈를 다루고 같은 소비처(`todoForm`,
`todoDetail`)에서 함께 쓰이므로 한 태스크로 묶는다.

**Files:**
- Create: `client/src/features/todo/hooks/useCreateRecurringTodo.ts`
- Create: `client/src/features/todo/hooks/useEditRecurringSeries.ts`
- Create: `client/src/features/todo/hooks/useDeleteRecurringSeries.ts`
- Test: `client/src/features/todo/hooks/__tests__/useCreateRecurringTodo.test.tsx`
- Test: `client/src/features/todo/hooks/__tests__/useEditRecurringSeries.test.tsx`
- Test: `client/src/features/todo/hooks/__tests__/useDeleteRecurringSeries.test.tsx`
- Modify: `client/src/features/todo/hooks/index.ts`

- [ ] **Step 1: useCreateRecurringTodo.ts 작성**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import { createRecurringTodo } from "../api";

// 반복(recurrence)이 설정된 할 일 생성은 useCreateTodo와 별도 훅으로 분리했다.
// 생성 시점에 이미 N개의 Todo 문서를 batch로 만들어야 해서 성공/무효화 흐름이
// 단일 문서 생성(useCreateTodo)과 다르고, 폼(todoForm)에서 recurrence 유무에 따라
// 호출할 훅을 명시적으로 분기하는 편이 "이 저장은 여러 문서를 만든다"는 것을
// 호출부에서 더 명확히 드러낸다고 판단했다.
export const useCreateRecurringTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (todo: Todo) => createRecurringTodo(todo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};
```

- [ ] **Step 2: useEditRecurringSeries.ts 작성**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "../types";
import { editRecurringSeries } from "../api";

// 반복 시리즈 전체 수정(반복 OFF 전환 포함). 입력은 시리즈 대표 todo(수정 폼에서
// 편집 중인 인스턴스)의 새 필드값 + 새 recurrence 규칙.
export const useEditRecurringSeries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seriesTodo: Todo) => editRecurringSeries(seriesTodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};
```

- [ ] **Step 3: useDeleteRecurringSeries.ts 작성**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteRecurringSeries } from "../api";

// 반복 시리즈 전체 삭제(할 일 목록에서 반복 할 일 카드 삭제 시 사용). 단일 문서만
// 지우는 useDeleteTodo와 달리 같은 recurrenceId의 모든 인스턴스를 지운다.
export const useDeleteRecurringSeries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recurrenceId: string) => deleteRecurringSeries(recurrenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["todoDetail"] });
    },
  });
};
```

- [ ] **Step 4: 세 훅의 테스트 파일 작성**

`useCreateRecurringTodo.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCreateRecurringTodo } from '../useCreateRecurringTodo'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ createRecurringTodo: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'new-todo',
  userId: 'test-user-id',
  title: '반복 할 일',
  status: 'todo',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: { type: 'daily', endType: 'indefinite' },
  recurrenceId: 'series-1',
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useCreateRecurringTodo 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('반복 할 일 생성 성공 시 createRecurringTodo를 호출해야 한다', async () => {
    const { createRecurringTodo } = await import('../../api')
    const newTodo = makeTodo()
    vi.mocked(createRecurringTodo).mockResolvedValueOnce([newTodo])

    const { result } = renderHook(() => useCreateRecurringTodo(), { wrapper: createWrapper() })

    result.current.mutate(newTodo)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(createRecurringTodo)).toHaveBeenCalledWith(newTodo)
  })
})
```

`useEditRecurringSeries.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEditRecurringSeries } from '../useEditRecurringSeries'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ editRecurringSeries: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'test-user-id',
  title: '반복 할 일',
  status: 'todo',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: { type: 'daily', endType: 'indefinite' },
  recurrenceId: 'series-1',
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useEditRecurringSeries 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('수정 성공 시 editRecurringSeries를 호출해야 한다', async () => {
    const { editRecurringSeries } = await import('../../api')
    const seriesTodo = makeTodo()
    vi.mocked(editRecurringSeries).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useEditRecurringSeries(), { wrapper: createWrapper() })

    result.current.mutate(seriesTodo)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(editRecurringSeries)).toHaveBeenCalledWith(seriesTodo)
  })
})
```

`useDeleteRecurringSeries.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useDeleteRecurringSeries } from '../useDeleteRecurringSeries'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ deleteRecurringSeries: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useDeleteRecurringSeries 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('삭제 성공 시 deleteRecurringSeries를 호출해야 한다', async () => {
    const { deleteRecurringSeries } = await import('../../api')
    vi.mocked(deleteRecurringSeries).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useDeleteRecurringSeries(), { wrapper: createWrapper() })

    result.current.mutate('series-1')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(deleteRecurringSeries)).toHaveBeenCalledWith('series-1')
  })
})
```

- [ ] **Step 5: 테스트 실행**

Run: `cd client && npm run test -- useCreateRecurringTodo useEditRecurringSeries useDeleteRecurringSeries`
Expected: 세 파일 모두 PASS

- [ ] **Step 6: hooks/index.ts에 export 추가**

```ts
export { useCreateRecurringTodo } from "./useCreateRecurringTodo";
export { useEditRecurringSeries } from "./useEditRecurringSeries";
export { useDeleteRecurringSeries } from "./useDeleteRecurringSeries";
```

- [ ] **Step 7: 커밋**

```bash
git add client/src/features/todo/hooks/useCreateRecurringTodo.ts \
  client/src/features/todo/hooks/useEditRecurringSeries.ts \
  client/src/features/todo/hooks/useDeleteRecurringSeries.ts \
  client/src/features/todo/hooks/__tests__/useCreateRecurringTodo.test.tsx \
  client/src/features/todo/hooks/__tests__/useEditRecurringSeries.test.tsx \
  client/src/features/todo/hooks/__tests__/useDeleteRecurringSeries.test.tsx \
  client/src/features/todo/hooks/index.ts
git commit -m "refactor: 반복 시리즈 관련 훅 3종을 useTodo에서 분리"
```

---

## Task 7: useReorderTodos 추출

optimistic update + 롤백이 있는 가장 복잡한 훅이라 별도 태스크로 분리한다.

**Files:**
- Create: `client/src/features/todo/hooks/useReorderTodos.ts`
- Test: `client/src/features/todo/hooks/__tests__/useReorderTodos.test.tsx`
- Modify: `client/src/features/todo/hooks/index.ts`

- [ ] **Step 1: useReorderTodos.ts 작성**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Todo, TodoReorderUpdate } from "../types";
import { reorderTodos } from "../api";

// 칸반 보드 같은 컬럼 내 드래그 재정렬(useKanbanDrag)에서 사용. 여러 문서의 order를
// 한 번에 bulk write하는 reorderTodos를 감싼다. useUpdateTodo와 동일한 이유로
// optimistic update를 적용한다 — 그러지 않으면 batch.commit()이 끝날 때까지 드래그로
// 옮긴 카드가 캐시상 원래 자리로 순간적으로 스냅백되는 것처럼 보인다.
export const useReorderTodos = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: TodoReorderUpdate[]) => reorderTodos(updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["todos"] });
      const previous = queryClient.getQueryData<Todo[]>(["todos"]);

      queryClient.setQueryData<Todo[]>(["todos"], (old = []) => {
        const orderById = new Map(updates.map((u) => [u.id, u.order]));
        return old.map((t) =>
          orderById.has(t.id) ? { ...t, order: orderById.get(t.id)! } : t,
        );
      });

      return { previous };
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["todos"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
};
```

- [ ] **Step 2: useReorderTodos.test.tsx 작성**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useReorderTodos } from '../useReorderTodos'
import type { Todo } from '../../types/todo.type'

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ reorderTodos: vi.fn() }))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'test-user-id',
  title: '할 일',
  status: 'todo',
  priority: 'medium',
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
  ...overrides,
})

const createWrapperWithClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  queryClient.setQueryData(['todos'], [
    makeTodo({ id: 'todo-1', order: 0 }),
    makeTodo({ id: 'todo-2', order: 1 }),
  ])
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

describe('useReorderTodos 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('성공 시 reorderTodos를 호출하고 todos 쿼리를 무효화해야 한다', async () => {
    const { reorderTodos } = await import('../../api')
    vi.mocked(reorderTodos).mockResolvedValueOnce(undefined)

    const { Wrapper } = createWrapperWithClient()
    const { result } = renderHook(() => useReorderTodos(), { wrapper: Wrapper })

    const updates = [
      { id: 'todo-1', order: 1 },
      { id: 'todo-2', order: 0 },
    ]
    result.current.mutate(updates)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(reorderTodos)).toHaveBeenCalledWith(updates)
  })

  it('mutate 호출 즉시(서버 응답 전) 캐시에 새 order를 낙관적으로 반영해야 한다', async () => {
    const { reorderTodos } = await import('../../api')
    let resolveReorder: () => void = () => {}
    vi.mocked(reorderTodos).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReorder = () => resolve(undefined)
        }),
    )

    const { Wrapper, queryClient } = createWrapperWithClient()
    const { result } = renderHook(() => useReorderTodos(), { wrapper: Wrapper })

    result.current.mutate([
      { id: 'todo-1', order: 1 },
      { id: 'todo-2', order: 0 },
    ])

    await waitFor(() => {
      const cached = queryClient.getQueryData<Todo[]>(['todos'])
      expect(cached?.find((t) => t.id === 'todo-1')?.order).toBe(1)
      expect(cached?.find((t) => t.id === 'todo-2')?.order).toBe(0)
    })

    resolveReorder()
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
  })

  it('실패 시 재정렬 이전 캐시 상태로 롤백해야 한다', async () => {
    const { reorderTodos } = await import('../../api')
    vi.mocked(reorderTodos).mockRejectedValueOnce(new Error('네트워크 오류'))

    const { Wrapper, queryClient } = createWrapperWithClient()
    const { result } = renderHook(() => useReorderTodos(), { wrapper: Wrapper })

    result.current.mutate([
      { id: 'todo-1', order: 1 },
      { id: 'todo-2', order: 0 },
    ])

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    const cached = queryClient.getQueryData<Todo[]>(['todos'])
    expect(cached?.find((t) => t.id === 'todo-1')?.order).toBe(0)
    expect(cached?.find((t) => t.id === 'todo-2')?.order).toBe(1)
  })
})
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- useReorderTodos`
Expected: PASS

- [ ] **Step 4: hooks/index.ts에 export 추가**

```ts
export { useReorderTodos } from "./useReorderTodos";
```

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/hooks/useReorderTodos.ts \
  client/src/features/todo/hooks/__tests__/useReorderTodos.test.tsx \
  client/src/features/todo/hooks/index.ts
git commit -m "refactor: useReorderTodos를 useTodo에서 분리"
```

---

## Task 8: useRunStartupMaintenance 추출

**Files:**
- Create: `client/src/features/todo/hooks/useRunStartupMaintenance.ts`
- Test: `client/src/features/todo/hooks/__tests__/useRunStartupMaintenance.test.tsx`
- Modify: `client/src/features/todo/hooks/index.ts`

- [ ] **Step 1: useRunStartupMaintenance.ts 작성**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { runStartupMaintenance } from "../api";

// 앱 진입 시 1회 호출하는 백그라운드 유지보수(App.tsx). 완료 프로젝트 아카이빙,
// 지난 반복 인스턴스 아카이빙, 무기한 반복 시리즈 확장을 한 번의 읽기로 처리한다.
// 사용자 액션이 아니라 유지보수 성격이라 사용자에게는 조용히 넘어가고(다음 접속 때
// 다시 시도됨), 실패 자체를 아무도 모르면 운영 중 문제를 감지할 수 없으므로 최소한
// 콘솔에는 남긴다.
//
// 무효화를 written > 0으로 거는 이유: 세 정책 모두 대부분의 실행에서 쓸 것이 없다.
// 무조건 무효화하면 하는 일 없이 getTodos() 전체 재조회를 유발한다. 쓴 것이 없으면
// 서버 데이터가 이 유지보수 때문에 바뀐 게 없으므로 캐시는 이미 최신이다.
export const useRunStartupMaintenance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => runStartupMaintenance(),
    onSuccess: (written) => {
      if (written > 0) {
        queryClient.invalidateQueries({ queryKey: ["todos"] });
      }
    },
    onError: (error) => {
      console.error("앱 진입 유지보수 실패:", error);
      Sentry.captureException(error);
    },
  });
};
```

- [ ] **Step 2: useRunStartupMaintenance.test.tsx 작성**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { useRunStartupMaintenance } from '../useRunStartupMaintenance'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))
vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  googleProvider: {},
}))
vi.mock('@/shared/lib/firestore', () => ({ db: {} }))
vi.mock('../../api', () => ({ runStartupMaintenance: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

describe('useRunStartupMaintenance 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('쓴 문서가 있으면 todos 쿼리를 무효화해야 한다', async () => {
    const { runStartupMaintenance } = await import('../../api')
    vi.mocked(runStartupMaintenance).mockResolvedValueOnce(3)

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRunStartupMaintenance(), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(runStartupMaintenance)).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
  })

  it('쓴 문서가 없으면 todos 쿼리를 무효화하지 않아야 한다', async () => {
    const { runStartupMaintenance } = await import('../../api')
    vi.mocked(runStartupMaintenance).mockResolvedValueOnce(0)

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRunStartupMaintenance(), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('실패 시 사용자에게는 알리지 않되 콘솔에는 에러를 남겨야 한다', async () => {
    const { runStartupMaintenance } = await import('../../api')
    const error = new Error('permission-denied')
    vi.mocked(runStartupMaintenance).mockRejectedValueOnce(error)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRunStartupMaintenance(), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('앱 진입 유지보수 실패'),
      error,
    )
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(error)

    consoleErrorSpy.mockRestore()
  })
})
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- useRunStartupMaintenance`
Expected: PASS

- [ ] **Step 4: hooks/index.ts에 export 추가**

```ts
export { useRunStartupMaintenance } from "./useRunStartupMaintenance";
```

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/hooks/useRunStartupMaintenance.ts \
  client/src/features/todo/hooks/__tests__/useRunStartupMaintenance.test.tsx \
  client/src/features/todo/hooks/index.ts
git commit -m "refactor: useRunStartupMaintenance를 useTodo에서 분리"
```

---

## Task 9: features/todo/index.ts 배럴 갱신

**Files:**
- Modify: `client/src/features/todo/index.ts`

Task 1~8을 마치면 `hooks/index.ts`는 12개 훅을 전부 개별 export하면서도 여전히
`useTodo`(umbrella)도 export하는 상태다. 이제 `features/todo/index.ts`가
외부(`calendar.tsx`, `kanbanBoard.tsx`)에 노출하는 이름을 개별 훅으로
바꾼다 — 이 시점에는 아직 `useTodo` export를 지우지 않는다(소비처 마이그레이션은
Task 10~18에서 진행).

- [ ] **Step 1: features/todo/index.ts 수정**

`client/src/features/todo/index.ts:1`의
`export { useTodo, useTodoDetail } from "./hooks";`를 아래로 교체:

```ts
export { useTodo, useTodoDetail } from "./hooks";
export { useGetTodos } from "./hooks";
export { useUpdateTodo } from "./hooks";
export { useUpdateTodoDueAt } from "./hooks";
export { useReorderTodos } from "./hooks";
```

- [ ] **Step 2: 타입체크**

Run: `cd client && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add client/src/features/todo/index.ts
git commit -m "refactor: features/todo 배럴에 개별 훅 export 추가"
```

---

## Task 10: App.tsx 마이그레이션

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: import와 호출부 교체**

`client/src/App.tsx:18`:

```ts
// 변경 전
import { useTodo } from "@/features/todo/hooks";
// 변경 후
import { useRunStartupMaintenance } from "@/features/todo/hooks";
```

`client/src/App.tsx:24`:

```ts
// 변경 전
const { useRunStartupMaintenance } = useTodo();
// 변경 후
const runStartupMaintenance = useRunStartupMaintenance();
```

`client/src/App.tsx:32`의 `useRunStartupMaintenance.mutate();`를
`runStartupMaintenance.mutate();`로 변경.

- [ ] **Step 2: 앱 빌드로 회귀 확인**

Run: `cd client && npx tsc --noEmit`
Expected: 에러 없음(App.tsx에 전용 테스트 파일 없음)

- [ ] **Step 3: 커밋**

```bash
git add client/src/App.tsx
git commit -m "refactor: App.tsx가 useRunStartupMaintenance를 직접 사용하도록 변경"
```

---

## Task 11: todayPage.tsx 마이그레이션

**Files:**
- Modify: `client/src/features/today/pages/todayPage.tsx`
- Modify: `client/src/features/today/pages/__tests__/todayPage.test.tsx`

- [ ] **Step 1: todayPage.tsx import/호출부 교체**

`client/src/features/today/pages/todayPage.tsx:4`:

```ts
// 변경 전
import { useTodo } from "@/features/todo/hooks";
// 변경 후
import { useGetTodos } from "@/features/todo/hooks";
```

`client/src/features/today/pages/todayPage.tsx:44`:

```ts
// 변경 전
const { useGetTodos } = useTodo();
// 변경 후
const getTodos = useGetTodos();
```

74번째 줄 `onAction={() => useGetTodos.refetch()}`를
`onAction={() => getTodos.refetch()}`로 변경.

- [ ] **Step 2: todayPage.test.tsx mock 교체**

`features/today/pages/__tests__/todayPage.test.tsx:6`:

```ts
// 변경 전
import { useTodo } from '@/features/todo/hooks'
// 변경 후
import { useGetTodos } from '@/features/todo/hooks'
```

23~25번째 줄:

```ts
// 변경 전
vi.mock('@/features/todo/hooks', () => ({
  useTodo: vi.fn(),
}))
// 변경 후
vi.mock('@/features/todo/hooks', () => ({
  useGetTodos: vi.fn(),
}))
```

87~90번째 줄(`beforeEach` 안):

```ts
// 변경 전
vi.mocked(useTodo).mockReturnValue({
  useGetTodos: { refetch } as unknown as ReturnType<typeof useTodo>['useGetTodos'],
} as ReturnType<typeof useTodo>)
// 변경 후
vi.mocked(useGetTodos).mockReturnValue({
  refetch,
} as unknown as ReturnType<typeof useGetTodos>)
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- todayPage`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add client/src/features/today/pages/todayPage.tsx \
  client/src/features/today/pages/__tests__/todayPage.test.tsx
git commit -m "refactor: todayPage가 useGetTodos를 직접 사용하도록 변경"
```

---

## Task 12: useTodayTodos.ts 마이그레이션

**Files:**
- Modify: `client/src/features/today/hooks/useTodayTodos.ts`

`useTodayTodos.test.tsx`는 `@/features/todo/api`를 직접 모킹하므로(useTodo를
모킹하지 않음) 이 태스크에서는 테스트 파일 변경이 필요 없다.

- [ ] **Step 1: import/호출부 교체**

`client/src/features/today/hooks/useTodayTodos.ts:2`:

```ts
// 변경 전
import { useTodo } from "@/features/todo/hooks";
// 변경 후
import { useGetTodos, useUpdateTodo } from "@/features/todo/hooks";
```

`client/src/features/today/hooks/useTodayTodos.ts:27-29`:

```ts
// 변경 전
const { useGetTodos, useUpdateTodo } = useTodo();
const { data: todos, isLoading, isError } = useGetTodos;
const { mutate: updateTodo } = useUpdateTodo;
// 변경 후
const { data: todos, isLoading, isError } = useGetTodos();
const { mutate: updateTodo } = useUpdateTodo();
```

- [ ] **Step 2: 테스트 실행**

Run: `cd client && npm run test -- useTodayTodos`
Expected: PASS (기존 테스트 그대로 통과해야 함 — api 레벨 모킹이라 훅 분리와 무관)

- [ ] **Step 3: 커밋**

```bash
git add client/src/features/today/hooks/useTodayTodos.ts
git commit -m "refactor: useTodayTodos가 useGetTodos/useUpdateTodo를 직접 사용하도록 변경"
```

---

## Task 13: todoListPage.tsx 마이그레이션

**Files:**
- Modify: `client/src/features/todo/pages/todoListPage.tsx`

테스트 파일 없음.

- [ ] **Step 1: import/호출부 교체**

`client/src/features/todo/pages/todoListPage.tsx` 전체를 아래로 교체:

```tsx
import TodoList from "@/features/todo/components/todoList";
import { useGetTodos } from "@/features/todo/hooks";
import { CheckboxSkeleton, EmptyState } from "@/shared";
import { AlertCircle } from "lucide-react";

export default function TodoListPage() {
  const { data: todos, isLoading, isError } = useGetTodos();

  if (isLoading) {
    return <CheckboxSkeleton count={5} />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="데이터를 불러오지 못했습니다"
        description="네트워크 연결을 확인하고 다시 시도해주세요"
      />
    );
  }

  return <TodoList todos={todos ?? []} />;
}
```

- [ ] **Step 2: 타입체크**

Run: `cd client && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add client/src/features/todo/pages/todoListPage.tsx
git commit -m "refactor: todoListPage가 useGetTodos를 직접 사용하도록 변경"
```

---

## Task 14: todoList.tsx 마이그레이션

**Files:**
- Modify: `client/src/features/todo/components/todoList.tsx`
- Modify: `client/src/features/todo/components/__tests__/todoList.test.tsx`

- [ ] **Step 1: todoList.tsx import/호출부 교체**

`client/src/features/todo/components/todoList.tsx:18`:

```ts
// 변경 전
import { useTodo } from "../hooks";
// 변경 후
import { useDeleteTodo, useDeleteRecurringSeries } from "../hooks";
```

`client/src/features/todo/components/todoList.tsx:47`:

```ts
// 변경 전
const { useDeleteTodo, useDeleteRecurringSeries } = useTodo();
// 변경 후
const deleteTodo = useDeleteTodo();
const deleteRecurringSeries = useDeleteRecurringSeries();
```

184번째 줄 `useDeleteRecurringSeries.mutate(...)`를
`deleteRecurringSeries.mutate(...)`로, 189번째 줄
`useDeleteTodo.mutate(...)`를 `deleteTodo.mutate(...)`로 변경.

- [ ] **Step 2: todoList.test.tsx mock 교체**

`features/todo/components/__tests__/todoList.test.tsx:18-23`:

```ts
// 변경 전
vi.mock('../../hooks', () => ({
  useTodo: () => ({
    useDeleteTodo: { mutate: vi.fn(), isPending: false },
    useDeleteRecurringSeries: { mutate: vi.fn(), isPending: false },
  }),
  useSearchTodo: () => ({ data: undefined, isLoading: false }),
}))
// 변경 후
vi.mock('../../hooks', () => ({
  useDeleteTodo: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRecurringSeries: () => ({ mutate: vi.fn(), isPending: false }),
  useSearchTodo: () => ({ data: undefined, isLoading: false }),
}))
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- todoList`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add client/src/features/todo/components/todoList.tsx \
  client/src/features/todo/components/__tests__/todoList.test.tsx
git commit -m "refactor: todoList가 useDeleteTodo/useDeleteRecurringSeries를 직접 사용하도록 변경"
```

---

## Task 15: todoForm.tsx 마이그레이션

가장 많은 훅(7개)을 쓰는 컴포넌트.

**Files:**
- Modify: `client/src/features/todo/components/todoForm/todoForm.tsx`
- Modify: `client/src/features/todo/components/todoForm/__tests__/todoForm.test.tsx`

- [ ] **Step 1: todoForm.tsx import/호출부 교체**

`client/src/features/todo/components/todoForm/todoForm.tsx:4`:

```ts
// 변경 전
import { useTodo } from "../../hooks";
// 변경 후
import {
  useCreateTodo,
  useUpdateTodo,
  useCreateChildTodo,
  useCreateRecurringTodo,
  useEditRecurringSeries,
  useDeleteTodo,
  useGetTodos,
} from "../../hooks";
```

`client/src/features/todo/components/todoForm/todoForm.tsx:65-74`:

```ts
// 변경 전
const {
  useCreateTodo,
  useUpdateTodo,
  useCreateChildTodo,
  useCreateRecurringTodo,
  useEditRecurringSeries,
  useDeleteTodo,
  useGetTodos,
} = useTodo();
const { data: allTodos } = useGetTodos;
// 변경 후
const createTodo = useCreateTodo();
const updateTodo = useUpdateTodo();
const createChildTodo = useCreateChildTodo();
const createRecurringTodo = useCreateRecurringTodo();
const editRecurringSeries = useEditRecurringSeries();
const deleteTodo = useDeleteTodo();
const { data: allTodos } = useGetTodos();
```

이어서 파일 안의 모든 호출부를 아래와 같이 이름만 바꾼다(로직은 동일):

- 135번째 줄, 387번째 줄: `useEditRecurringSeries.` → `editRecurringSeries.`
- 196번째 줄: `useCreateRecurringTodo.mutate` → `createRecurringTodo.mutate`
- 198번째 줄: `useDeleteTodo.mutate` → `deleteTodo.mutate`
- 223번째 줄: `useUpdateTodo.mutate` → `updateTodo.mutate`
- 236번째 줄: `useCreateChildTodo.mutate` → `createChildTodo.mutate`
- 258번째 줄: `useCreateRecurringTodo.mutate` → `createRecurringTodo.mutate`
- 277번째 줄: `useCreateTodo.mutate` → `createTodo.mutate`

- [ ] **Step 2: todoForm.test.tsx mock 교체**

`features/todo/components/todoForm/__tests__/todoForm.test.tsx:24-36`:

```ts
// 변경 전
const mockTodo = vi.hoisted(() => ({
  useCreateTodo: { mutate: vi.fn() },
  useUpdateTodo: { mutate: vi.fn() },
  useCreateChildTodo: { mutate: vi.fn() },
  useCreateRecurringTodo: { mutate: vi.fn() },
  useEditRecurringSeries: { mutate: vi.fn(), isPending: false },
  useDeleteTodo: { mutate: vi.fn() },
  useGetTodos: { data: [] as Todo[] },
}));

vi.mock("../../../hooks", () => ({
  useTodo: () => mockTodo,
}));
// 변경 후
const mockTodo = vi.hoisted(() => ({
  useCreateTodo: { mutate: vi.fn() },
  useUpdateTodo: { mutate: vi.fn() },
  useCreateChildTodo: { mutate: vi.fn() },
  useCreateRecurringTodo: { mutate: vi.fn() },
  useEditRecurringSeries: { mutate: vi.fn(), isPending: false },
  useDeleteTodo: { mutate: vi.fn() },
  useGetTodos: { data: [] as Todo[] },
}));

vi.mock("../../../hooks", () => ({
  useCreateTodo: () => mockTodo.useCreateTodo,
  useUpdateTodo: () => mockTodo.useUpdateTodo,
  useCreateChildTodo: () => mockTodo.useCreateChildTodo,
  useCreateRecurringTodo: () => mockTodo.useCreateRecurringTodo,
  useEditRecurringSeries: () => mockTodo.useEditRecurringSeries,
  useDeleteTodo: () => mockTodo.useDeleteTodo,
  useGetTodos: () => mockTodo.useGetTodos,
}));
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- todoForm`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add client/src/features/todo/components/todoForm/todoForm.tsx \
  client/src/features/todo/components/todoForm/__tests__/todoForm.test.tsx
git commit -m "refactor: todoForm이 개별 todo 훅을 직접 사용하도록 변경"
```

---

## Task 16: todoDetail.tsx 마이그레이션

**Files:**
- Modify: `client/src/features/todo/components/todoDetail/todoDetail.tsx`
- Modify: `client/src/features/todo/components/todoDetail/__tests__/todoDetail.test.tsx`

- [ ] **Step 1: todoDetail.tsx import/호출부 교체**

`client/src/features/todo/components/todoDetail/todoDetail.tsx:4`:

```ts
// 변경 전
import { useTodoDetail, useTodo } from "../../hooks";
// 변경 후
import {
  useTodoDetail,
  useUpdateTodo,
  useCreateRecurringTodo,
  useEditRecurringSeries,
  useDeleteTodo,
  useDeleteRecurringSeries,
  useGetTodos,
} from "../../hooks";
```

`client/src/features/todo/components/todoDetail/todoDetail.tsx:86-94`:

```ts
// 변경 전
const {
  useUpdateTodo,
  useCreateRecurringTodo,
  useEditRecurringSeries,
  useDeleteTodo,
  useDeleteRecurringSeries,
  useGetTodos,
} = useTodo();
const { data: allTodos } = useGetTodos;
// 변경 후
const updateTodo = useUpdateTodo();
const createRecurringTodo = useCreateRecurringTodo();
const editRecurringSeries = useEditRecurringSeries();
const deleteTodo = useDeleteTodo();
const deleteRecurringSeries = useDeleteRecurringSeries();
const { data: allTodos } = useGetTodos();
```

이어서 이름만 바꾼다(로직 동일):

- 244번째 줄: `useDeleteRecurringSeries.mutate` → `deleteRecurringSeries.mutate`
- 258번째 줄, 324번째 줄: `useDeleteTodo.mutate` → `deleteTodo.mutate`
- 273번째 줄, 613번째 줄: `useEditRecurringSeries.` → `editRecurringSeries.`
- 322번째 줄: `useCreateRecurringTodo.mutate` → `createRecurringTodo.mutate`
- 345번째 줄: `useUpdateTodo.mutate` → `updateTodo.mutate`
- 628번째 줄: `useDeleteTodo.isPending || useDeleteRecurringSeries.isPending` →
  `deleteTodo.isPending || deleteRecurringSeries.isPending`

- [ ] **Step 2: todoDetail.test.tsx mock 교체**

`features/todo/components/todoDetail/__tests__/todoDetail.test.tsx:46-77`:

```ts
// 변경 전
vi.mock('../../../hooks', () => ({
  useTodoDetail: ({ id }: { id: string }) => ({ /* ... 기존 그대로 ... */ }),
  useTodo: () => ({
    useUpdateTodo: { mutate: vi.fn() },
    useCreateRecurringTodo: { mutate: vi.fn() },
    useEditRecurringSeries: { mutate: vi.fn(), isPending: false },
    useDeleteTodo: { mutate: vi.fn(), isPending: false },
    useDeleteRecurringSeries: { mutate: vi.fn(), isPending: false },
    useGetTodos: { data: [] },
  }),
  useUpdateTodo: () => ({ mutate: vi.fn() }),
  useDeleteTodo: () => ({ mutate: vi.fn(), isPending: false }),
}))
// 변경 후
vi.mock('../../../hooks', () => ({
  useTodoDetail: ({ id }: { id: string }) => ({ /* ... 기존 그대로 ... */ }),
  useUpdateTodo: () => ({ mutate: vi.fn() }),
  useCreateRecurringTodo: () => ({ mutate: vi.fn() }),
  useEditRecurringSeries: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTodo: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRecurringSeries: () => ({ mutate: vi.fn(), isPending: false }),
  useGetTodos: () => ({ data: [] }),
}))
```

`useTodo: () => (...)`가 사라지면서 `useUpdateTodo`/`useDeleteTodo`가 두 번
정의되던 것도 자연스럽게 하나로 합쳐진다(기존에는 ChildTodoCard용으로
별도 재정의하는 주석이 있었는데, 이제 todoDetail 자신도 같은 모킹을 쓰므로
그 주석은 제거한다).

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- todoDetail`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add client/src/features/todo/components/todoDetail/todoDetail.tsx \
  client/src/features/todo/components/todoDetail/__tests__/todoDetail.test.tsx
git commit -m "refactor: todoDetail이 개별 todo 훅을 직접 사용하도록 변경"
```

---

## Task 17: calendar.tsx 마이그레이션

**Files:**
- Modify: `client/src/features/dashboard/components/calendar.tsx`
- Modify: `client/src/features/dashboard/components/__tests__/calendar.test.tsx`

- [ ] **Step 1: calendar.tsx import/호출부 교체**

`client/src/features/dashboard/components/calendar.tsx:6`:

```ts
// 변경 전
import { useTodo, TodoForm } from "@/features/todo";
// 변경 후
import { useGetTodos, useUpdateTodoDueAt, TodoForm } from "@/features/todo";
```

`client/src/features/dashboard/components/calendar.tsx:45-46`:

```ts
// 변경 전
const { useGetTodos, useUpdateTodoDueAt } = useTodo();
const { data: todos, isLoading, isError } = useGetTodos;
// 변경 후
const updateTodoDueAt = useUpdateTodoDueAt();
const { data: todos, isLoading, isError } = useGetTodos();
```

155번째 줄 `useUpdateTodoDueAt.mutate(...)`를 `updateTodoDueAt.mutate(...)`로,
164번째 줄 의존성 배열의 `useUpdateTodoDueAt`을 `updateTodoDueAt`으로 변경.

- [ ] **Step 2: calendar.test.tsx mock 교체**

`features/dashboard/components/__tests__/calendar.test.tsx:39-43`:

```ts
// 변경 전
vi.mock('@/features/todo', () => ({
  useTodo: () => ({
    useGetTodos: { data: mockTodos, isLoading: false, isError: false },
    useUpdateTodoDueAt: { mutate: vi.fn() },
  }),
  TodoForm: () => null,
}))
// 변경 후
vi.mock('@/features/todo', () => ({
  useGetTodos: () => ({ data: mockTodos, isLoading: false, isError: false }),
  useUpdateTodoDueAt: () => ({ mutate: vi.fn() }),
  TodoForm: () => null,
}))
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- calendar`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add client/src/features/dashboard/components/calendar.tsx \
  client/src/features/dashboard/components/__tests__/calendar.test.tsx
git commit -m "refactor: calendar가 useGetTodos/useUpdateTodoDueAt을 직접 사용하도록 변경"
```

---

## Task 18: kanbanBoard.tsx 마이그레이션

**Files:**
- Modify: `client/src/features/kanban/components/kanbanBoard.tsx`
- Modify: `client/src/features/kanban/components/__tests__/kanbanBoard.test.tsx`

- [ ] **Step 1: kanbanBoard.tsx import/호출부 교체**

`client/src/features/kanban/components/kanbanBoard.tsx:4`:

```ts
// 변경 전
import { useTodo, type Todo } from "@/features/todo";
// 변경 후
import { useGetTodos, useUpdateTodo, useReorderTodos, type Todo } from "@/features/todo";
```

`client/src/features/kanban/components/kanbanBoard.tsx:25-26`:

```ts
// 변경 전
const { useGetTodos, useUpdateTodo, useReorderTodos } = useTodo();
const { data: todos, isLoading, isError } = useGetTodos;
// 변경 후
const updateTodo = useUpdateTodo();
const reorderTodos = useReorderTodos();
const { data: todos, isLoading, isError } = useGetTodos();
```

38번째 줄 `useUpdateTodo.mutate(...)`를 `updateTodo.mutate(...)`로, 40번째 줄
`useReorderTodos.mutate(...)`를 `reorderTodos.mutate(...)`로, 88번째 줄
`useUpdateTodo.mutate(...)`를 `updateTodo.mutate(...)`로 변경.

- [ ] **Step 2: kanbanBoard.test.tsx mock 교체**

`features/kanban/components/__tests__/kanbanBoard.test.tsx:50-62`:

```ts
// 변경 전
vi.mock("@/features/todo", async () => {
  const { collapseRecurringInstances } = await import(
    "../../../todo/utils/projectUtils"
  );
  return {
    collapseRecurringInstances,
    useTodo: () => ({
      useGetTodos: { data: [makeTodo()], isLoading: false, isError: false },
      useUpdateTodo: { mutate: updateMutate },
      useReorderTodos: { mutate: reorderMutate },
    }),
  };
});
// 변경 후
vi.mock("@/features/todo", async () => {
  const { collapseRecurringInstances } = await import(
    "../../../todo/utils/projectUtils"
  );
  return {
    collapseRecurringInstances,
    useGetTodos: () => ({ data: [makeTodo()], isLoading: false, isError: false }),
    useUpdateTodo: () => ({ mutate: updateMutate }),
    useReorderTodos: () => ({ mutate: reorderMutate }),
  };
});
```

- [ ] **Step 3: 테스트 실행**

Run: `cd client && npm run test -- kanbanBoard`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add client/src/features/kanban/components/kanbanBoard.tsx \
  client/src/features/kanban/components/__tests__/kanbanBoard.test.tsx
git commit -m "refactor: kanbanBoard가 개별 todo 훅을 직접 사용하도록 변경"
```

---

## Task 19: useTodo 배럴 제거 및 최종 검증

이제 모든 소비처가 개별 훅으로 옮겨갔으므로, umbrella `useTodo()`와 옛
테스트 파일, 배럴의 관련 export를 제거한다.

**Files:**
- Delete: `client/src/features/todo/hooks/useTodo.ts`
- Delete: `client/src/features/todo/hooks/__tests__/useTodo.test.tsx`
- Modify: `client/src/features/todo/hooks/index.ts`
- Modify: `client/src/features/todo/index.ts`

- [ ] **Step 1: 잔여 참조 확인**

Run: `cd client && grep -rn "useTodo()" src --include="*.ts" --include="*.tsx"`
Expected: 결과 없음(있다면 해당 파일을 먼저 정리)

- [ ] **Step 2: hooks/index.ts에서 useTodo export 제거**

```ts
// 변경 전
export { useTodo } from "./useTodo";
export { useTodoDetail } from "./useTodoDetail";
// 변경 후
export { useTodoDetail } from "./useTodoDetail";
```

(나머지 `useGetTodos`, `useCreateTodo`, `useUpdateTodo`, `useDeleteTodo`,
`useUpdateToDone`, `useUpdateTodoDueAt`, `useCreateChildTodo`,
`useCreateRecurringTodo`, `useEditRecurringSeries`,
`useDeleteRecurringSeries`, `useReorderTodos`, `useRunStartupMaintenance`,
`useSearchTodo` export 줄은 그대로 둔다.)

- [ ] **Step 3: features/todo/index.ts에서 useTodo export 제거**

```ts
// 변경 전
export { useTodo, useTodoDetail } from "./hooks";
export { useGetTodos } from "./hooks";
export { useUpdateTodo } from "./hooks";
export { useUpdateTodoDueAt } from "./hooks";
export { useReorderTodos } from "./hooks";
// 변경 후
export { useTodoDetail } from "./hooks";
export { useGetTodos } from "./hooks";
export { useUpdateTodo } from "./hooks";
export { useUpdateTodoDueAt } from "./hooks";
export { useReorderTodos } from "./hooks";
```

- [ ] **Step 4: useTodo.ts, useTodo.test.tsx 삭제**

```bash
rm client/src/features/todo/hooks/useTodo.ts
rm client/src/features/todo/hooks/__tests__/useTodo.test.tsx
```

- [ ] **Step 5: 전체 검증**

Run: `cd client && npm run lint`
Expected: 에러 없음

Run: `cd client && npx tsc --noEmit`
Expected: 에러 없음

Run: `cd client && npm run test`
Expected: 전체 PASS

Run: `cd client && npm run build`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add client/src/features/todo/hooks/index.ts \
  client/src/features/todo/index.ts
git rm client/src/features/todo/hooks/useTodo.ts \
  client/src/features/todo/hooks/__tests__/useTodo.test.tsx
git commit -m "refactor: useTodo umbrella 훅 제거, 개별 훅으로 완전 이전"
```

---

## Self-Review 체크리스트 (계획 작성자용, 참고)

- **스펙 커버리지**: 스펙의 12개 훅 전부 Task 1~8에서 추출됨. 9개 소비 컴포넌트
  전부 Task 10~18에서 마이그레이션됨. 배럴 정리(Task 9, 19)로 export 표면도
  스펙과 일치.
- **플레이스홀더 없음**: 모든 훅 코드와 테스트 코드, 소비처 diff는 원본 파일에서
  그대로 옮기거나(동작 불변) 실제 변경 라인 번호까지 명시함.
- **타입/이름 일관성**: 모든 새 훅 이름은 기존 `useTodo()` 반환 프로퍼티 이름과
  동일 — `useUpdateTodo`/`useDeleteTodo`가 이미 그렇듯 소비처 코드가 "훅 이름
  변경" 없이 "호출 방식만" 바뀐다.
