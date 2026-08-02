import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import TodoDetail from '../todoDetail'
import type { Todo } from '../../../types/todo.type'
import { ToastProvider } from '@/shared/ui/toast/toastContext'

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  googleProvider: {},
}))

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'user-1',
  title: '테스트 할 일',
  description: '기존 설명 텍스트',
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

const todo = makeTodo()

vi.mock('../../../hooks', () => ({
  useTodoDetail: () => ({ todo }),
  useTodo: () => ({
    useUpdateTodo: { mutate: vi.fn() },
    useCreateRecurringTodo: { mutate: vi.fn() },
    useEditRecurringSeries: { mutate: vi.fn(), isPending: false },
    useDeleteTodo: { mutate: vi.fn(), isPending: false },
    useDeleteRecurringSeries: { mutate: vi.fn(), isPending: false },
    useGetTodos: { data: [] },
  }),
}))

describe('TodoDetail 컴포넌트', () => {
  it('기존 description이 설명 textarea에 표시되어야 한다', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/todo/todo-1']}>
          <Routes>
            <Route path="/todo/:id" element={<TodoDetail />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    )

    const descInput = screen.getByPlaceholderText('상세 설명을 입력하세요') as HTMLTextAreaElement
    expect(descInput.value).toBe('기존 설명 텍스트')
  })

  it('제목도 description과 함께 정상 표시되어야 한다', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/todo/todo-1']}>
          <Routes>
            <Route path="/todo/:id" element={<TodoDetail />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    )

    expect(screen.getByPlaceholderText('할 일 제목')).toHaveValue('테스트 할 일')
  })
})
