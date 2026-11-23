import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInitialize = vi.fn()
const mockGetInstance = vi.fn((_cls: unknown) => ({ _initialize: mockInitialize }))

vi.mock('@firebase/auth/internal', () => ({
  _getInstance: (cls: unknown) => mockGetInstance(cls),
}))
vi.mock('firebase/auth', () => ({ browserPopupRedirectResolver: 'resolver-class' }))
vi.mock('@/shared/lib/firebase', () => ({ auth: { name: 'fake-auth' } }))

import { warmUpPopupResolver } from '../warmUpPopup'

describe('warmUpPopupResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInitialize.mockResolvedValue({})
  })

  it('팝업 호출과 같은 처리기 인스턴스를 auth로 미리 초기화한다', () => {
    warmUpPopupResolver()
    expect(mockGetInstance).toHaveBeenCalledWith('resolver-class')
    expect(mockInitialize).toHaveBeenCalledWith({ name: 'fake-auth' })
  })

  it('초기화가 실패해도 예외를 밖으로 내지 않는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockInitialize.mockRejectedValue(new Error('iframe 실패'))
    expect(() => warmUpPopupResolver()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('내부 API 모양이 바뀌어 동기 예외가 나도 삼킨다', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetInstance.mockImplementationOnce(() => {
      throw new Error('모양 바뀜')
    })
    expect(() => warmUpPopupResolver()).not.toThrow()
    error.mockRestore()
  })
})
