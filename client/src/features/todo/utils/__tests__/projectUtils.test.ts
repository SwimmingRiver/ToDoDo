import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getProjectOverdue } from '../projectUtils'
import type { Todo } from '../../types/todo.type'

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo-1',
  userId: 'user-1',
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

// 절대 날짜 하드코딩 대신, 고정된 시스템 시간(ANCHOR) 기준 상대 offset으로 dueAt을 만든다.
// 로컬 자정 기준 N일 전/후의 ISO 문자열을 반환한다 (due.ts / dueTodo 등 기존 컨벤션과 동일하게
// new Date(...).setHours(0,0,0,0) 로 로컬 자정 정규화 후 비교하는 로직과 짝을 맞추기 위함).
const ANCHOR = new Date('2026-06-14T09:00:00.000Z') // 임의의 앵커 시각 (TZ 무관하게 하루 중간)

const daysFromAnchor = (offsetDays: number): string => {
  const d = new Date(ANCHOR)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

describe('getProjectOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(ANCHOR)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('하위 투두가 없고 루트 자신의 dueAt이 과거이면 초과로 판정해야 한다', () => {
    const project = makeTodo({
      id: 'project-1',
      status: 'todo',
      dueAt: daysFromAnchor(-3),
    })

    const result = getProjectOverdue([project], project)

    expect(result).toEqual({ isOverdue: true, daysOver: 3 })
  })

  it('하위 투두가 없고 루트 자신의 dueAt이 미래이면 초과가 아니어야 한다', () => {
    const project = makeTodo({
      id: 'project-1',
      status: 'todo',
      dueAt: daysFromAnchor(2),
    })

    const result = getProjectOverdue([project], project)

    expect(result).toEqual({ isOverdue: false, daysOver: 0 })
  })

  it('루트와 하위 투두 모두 아직 초과되지 않았으면 초과가 아니어야 한다', () => {
    const project = makeTodo({ id: 'project-1', status: 'todo', dueAt: daysFromAnchor(1) })
    const subtask = makeTodo({
      id: 'sub-1',
      parentId: 'project-1',
      status: 'todo',
      dueAt: daysFromAnchor(2),
    })

    const result = getProjectOverdue([project, subtask], project)

    expect(result).toEqual({ isOverdue: false, daysOver: 0 })
  })

  it('루트는 초과되지 않았지만 하위 투두가 초과됐으면 하위 기준으로 초과 판정해야 한다 (기존 동작 유지)', () => {
    const project = makeTodo({ id: 'project-1', status: 'todo', dueAt: daysFromAnchor(5) })
    const subtask = makeTodo({
      id: 'sub-1',
      parentId: 'project-1',
      status: 'todo',
      dueAt: daysFromAnchor(-4),
    })

    const result = getProjectOverdue([project, subtask], project)

    expect(result).toEqual({ isOverdue: true, daysOver: 4 })
  })

  it('루트와 하위 투두 모두 초과됐으면 가장 오래 초과된 것(daysOver 최대) 기준으로 계산해야 한다', () => {
    const project = makeTodo({ id: 'project-1', status: 'todo', dueAt: daysFromAnchor(-2) })
    const olderSubtask = makeTodo({
      id: 'sub-1',
      parentId: 'project-1',
      status: 'todo',
      dueAt: daysFromAnchor(-10),
    })
    const newerSubtask = makeTodo({
      id: 'sub-2',
      parentId: 'project-1',
      status: 'todo',
      dueAt: daysFromAnchor(-1),
    })

    const result = getProjectOverdue([project, olderSubtask, newerSubtask], project)

    expect(result).toEqual({ isOverdue: true, daysOver: 10 })
  })

  it('루트 자신의 dueAt이 과거여도 status가 done이면 초과가 아니어야 한다', () => {
    const project = makeTodo({
      id: 'project-1',
      status: 'done',
      dueAt: daysFromAnchor(-3),
    })

    const result = getProjectOverdue([project], project)

    expect(result).toEqual({ isOverdue: false, daysOver: 0 })
  })

  it('루트 dueAt이 null이고 하위 투두도 없으면 초과가 아니어야 한다', () => {
    const project = makeTodo({ id: 'project-1', status: 'todo', dueAt: null })

    const result = getProjectOverdue([project], project)

    expect(result).toEqual({ isOverdue: false, daysOver: 0 })
  })
})
