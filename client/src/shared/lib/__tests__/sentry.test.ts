import { describe, it, expect } from 'vitest'
import type { ErrorEvent as SentryErrorEvent } from '@sentry/react'
import { isWebViewBridgeNoise, scrubEvent } from '../sentry'

const BRIDGE_MESSAGE = 'Error invoking postMessage: Java object is gone'
const OWN_FRAME = { filename: `${window.location.origin}/assets/index-abc123.js`, function: 'onClick' }
const ANONYMOUS_FRAME = { filename: '<anonymous>', function: '?' }

const exceptionEvent = (value: string, frames?: object[]) =>
  ({
    type: undefined,
    exception: {
      values: [{ type: 'Error', value, stacktrace: frames ? { frames } : undefined }],
    },
  }) as unknown as SentryErrorEvent

describe('isWebViewBridgeNoise', () => {
  // 카카오톡·인스타그램 등 안드로이드 인앱 WebView가 주입한 스크립트가 창이 닫힌 뒤 브릿지를 호출해 나는
  // 에러(TODODO-CLIENT-9). 메시지만으로 버리면 나중에 우리 앱이 WebView 브릿지를 쓸 때 진짜 에러까지
  // 사라지므로, "우리 번들 프레임이 스택에 없을 때"만 노이즈로 본다.
  it('브릿지 에러이고 스택이 <anonymous>뿐이면 노이즈다', () => {
    expect(isWebViewBridgeNoise(exceptionEvent(BRIDGE_MESSAGE, [ANONYMOUS_FRAME]))).toBe(true)
  })

  it('브릿지 에러이고 스택 프레임이 아예 없어도 노이즈다', () => {
    expect(isWebViewBridgeNoise(exceptionEvent(BRIDGE_MESSAGE))).toBe(true)
  })

  it('브릿지 에러라도 스택에 우리 번들 프레임이 있으면 노이즈가 아니다', () => {
    expect(
      isWebViewBridgeNoise(exceptionEvent(BRIDGE_MESSAGE, [ANONYMOUS_FRAME, OWN_FRAME])),
    ).toBe(false)
  })

  it('브릿지 에러가 아니면 우리 번들 프레임이 없어도 노이즈가 아니다', () => {
    expect(
      isWebViewBridgeNoise(
        exceptionEvent("Cannot read properties of undefined (reading 'id')", [ANONYMOUS_FRAME]),
      ),
    ).toBe(false)
  })

  it('exception이 없는 이벤트는 노이즈가 아니다', () => {
    expect(isWebViewBridgeNoise({ type: undefined } as unknown as SentryErrorEvent)).toBe(false)
  })
})

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

  it('request.headers 중 User-Agent만 남기고 나머지 헤더는 제거한다', () => {
    // Sentry 서버는 User-Agent 헤더로 browser/os를 파싱한다. 헤더를 통째로 지우면
    // 모든 이벤트의 브라우저·OS 정보가 비어 인앱 브라우저 노이즈 같은 판단을 할 수 없다.
    const event = {
      type: undefined,
      request: {
        url: 'https://tododo.app/todos',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14; wv) KAKAOTALK',
          Referer: 'https://tododo.app/todos?search=민감검색어',
          Cookie: 'session=secret',
        },
      },
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.request).toEqual({
      url: 'https://tododo.app/todos',
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; wv) KAKAOTALK' },
    })
    expect(JSON.stringify(result)).not.toContain('민감검색어')
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('User-Agent 헤더가 없으면 request에 headers 필드를 만들지 않는다', () => {
    const event = {
      type: undefined,
      request: {
        url: 'https://tododo.app/todos',
        headers: { Referer: 'https://tododo.app/' },
      },
    } as unknown as SentryErrorEvent

    const result = scrubEvent(event)

    expect(result.request).toEqual({ url: 'https://tododo.app/todos' })
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
