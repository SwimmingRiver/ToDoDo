import { describe, it, expect } from 'vitest'
import type { ErrorEvent as SentryErrorEvent } from '@sentry/react'
import { scrubEvent } from '../sentry'

describe('scrubEvent', () => {
  it('extra에 담긴 title/description 등 사용자 입력 텍스트를 결과 이벤트에서 완전히 제거한다', () => {
    const event = {
      type: undefined,
      message: 'TypeError: something failed',
      extra: {
        title: '민감한 할 일 제목',
        description: '민감한 상세 설명',
      },
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.extra).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('민감한')
  })

  it('contexts에 담긴 커스텀 컨텍스트(todo 등)의 title/description을 결과 이벤트에서 완전히 제거한다', () => {
    const event = {
      type: undefined,
      contexts: {
        browser: { name: 'Chrome' },
        os: { name: 'macOS' },
        todo: {
          title: '민감한 할 일 제목',
          description: '민감한 상세 설명',
        },
      },
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.contexts).toEqual({
      browser: { name: 'Chrome' },
      os: { name: 'macOS' },
      react: undefined,
    })
    expect(JSON.stringify(result)).not.toContain('민감한')
  })

  it('user.email이 담긴 이벤트에서 email은 사라지고 id만 남는다', () => {
    const event = {
      type: undefined,
      user: { id: 'uid-123', email: 'user@example.com', username: 'user123' },
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.user).toEqual({ id: 'uid-123' })
    expect(JSON.stringify(result)).not.toContain('user@example.com')
    expect(JSON.stringify(result)).not.toContain('user123')
  })

  it('user 필드가 없으면 결과에도 user 필드가 없다', () => {
    const event = { type: undefined } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.user).toBeUndefined()
  })

  it('request.url에서 쿼리스트링을 제거한다', () => {
    const event = {
      type: undefined,
      request: {
        url: 'https://tododo.app/todos?search=민감검색어&foo=bar',
      },
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.request?.url).toBe('https://tododo.app/todos')
    expect(result.request?.url).not.toContain('search')
    expect(JSON.stringify(result)).not.toContain('민감검색어')
  })

  it('request.data 등 쿼리스트링 제거 대상이 아닌 request 필드는 결과에 남기지 않는다', () => {
    const event = {
      type: undefined,
      request: {
        url: 'https://tododo.app/todos',
        data: { title: '민감한 폼 입력값' },
      },
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.request).toEqual({ url: 'https://tododo.app/todos' })
    expect(JSON.stringify(result)).not.toContain('민감한 폼 입력값')
  })

  it('사용자 입력과 무관한 breadcrumb 카테고리(navigation)는 통과시킨다', () => {
    const event = {
      type: undefined,
      breadcrumbs: [
        {
          type: 'navigation',
          category: 'navigation',
          level: 'info',
          timestamp: 1234,
          data: { from: '/today', to: '/kanban' },
        },
      ],
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.breadcrumbs).toHaveLength(1)
    expect(result.breadcrumbs?.[0]).toEqual({
      type: 'navigation',
      category: 'navigation',
      level: 'info',
      timestamp: 1234,
      data: { from: '/today', to: '/kanban' },
    })
  })

  it('사용자 입력이 섞일 수 있는 breadcrumb 카테고리(ui.input)는 걸러낸다', () => {
    const event = {
      type: undefined,
      breadcrumbs: [
        {
          type: 'default',
          category: 'ui.input',
          level: 'info',
          timestamp: 1234,
          message: '민감한 입력값',
        },
        {
          type: 'default',
          category: 'ui.click',
          level: 'info',
          timestamp: 1235,
        },
        {
          type: 'default',
          category: 'console',
          level: 'log',
          timestamp: 1236,
          message: '민감한 콘솔 로그',
        },
      ],
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.breadcrumbs).toHaveLength(0)
  })

  it('navigation과 ui.input이 섞여 있으면 navigation만 남기고 ui.input은 제거한다', () => {
    const event = {
      type: undefined,
      breadcrumbs: [
        { type: 'navigation', category: 'navigation', timestamp: 1 },
        {
          type: 'default',
          category: 'ui.input',
          timestamp: 2,
          message: '민감한 입력값',
        },
      ],
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.breadcrumbs).toHaveLength(1)
    expect(result.breadcrumbs?.[0].category).toBe('navigation')
  })

  it('breadcrumb.message는 허용된 카테고리(navigation)여도 항상 제거한다', () => {
    const event = {
      type: undefined,
      breadcrumbs: [
        {
          type: 'navigation',
          category: 'navigation',
          timestamp: 1,
          message: '혹시 모를 사용자 입력',
        },
      ],
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.breadcrumbs?.[0].message).toBeUndefined()
  })

  it('exception, message 등 에러 진단에 필요한 필드는 그대로 유지한다', () => {
    const event = {
      type: undefined,
      message: 'TypeError: cannot read property of undefined',
      exception: {
        values: [{ type: 'TypeError', value: 'cannot read property of undefined' }],
      },
      level: 'error',
      environment: 'production',
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.message).toBe('TypeError: cannot read property of undefined')
    expect(result.exception).toEqual(event.exception)
    expect(result.level).toBe('error')
    expect(result.environment).toBe('production')
  })
})
