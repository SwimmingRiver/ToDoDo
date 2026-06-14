import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useModal from '../useModal'

describe('useModal 훅', () => {
  it('초기 상태에서 isOpen은 false여야 한다', () => {
    const { result } = renderHook(() => useModal())
    expect(result.current.isOpen).toBe(false)
  })

  it('setIsOpen(true) 호출 시 모달이 열려야 한다', () => {
    const { result } = renderHook(() => useModal())

    act(() => {
      result.current.setIsOpen(true)
    })

    expect(result.current.isOpen).toBe(true)
  })

  it('setIsOpen(false) 호출 시 모달이 닫혀야 한다', () => {
    const { result } = renderHook(() => useModal())

    act(() => {
      result.current.setIsOpen(true)
    })

    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.setIsOpen(false)
    })

    expect(result.current.isOpen).toBe(false)
  })

  it('isOpen과 setIsOpen을 반환해야 한다', () => {
    const { result } = renderHook(() => useModal())

    expect(result.current).toHaveProperty('isOpen')
    expect(result.current).toHaveProperty('setIsOpen')
    expect(typeof result.current.setIsOpen).toBe('function')
  })
})
