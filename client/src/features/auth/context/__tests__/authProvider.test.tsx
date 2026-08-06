import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import type { User } from 'firebase/auth'
import * as Sentry from '@sentry/react'
import { AuthProvider } from '../authProvider'
import { useAuth } from '../useAuth'

let authStateCallback: ((user: User | null) => void) | null = null

vi.mock('@/shared/lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    authStateCallback = callback
    return vi.fn()
  }),
  signOut: vi.fn(),
}))

vi.mock('@sentry/react', () => ({
  setUser: vi.fn(),
}))

const mockUser = {
  uid: 'test-user-id',
  email: 'user@example.com',
  displayName: '테스트 사용자',
} as User

const Consumer = () => {
  const { user, loading } = useAuth()
  if (loading) return <div>로딩 중</div>
  return <div>{user ? `로그인: ${user.uid}` : '비로그인'}</div>
}

describe('AuthProvider', () => {
  beforeEach(() => {
    authStateCallback = null
    vi.mocked(Sentry.setUser).mockClear()
  })

  it('로그인 상태가 되면 Sentry.setUser에 uid만 전달하고 email은 전달하지 않는다', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    act(() => {
      authStateCallback?.(mockUser)
    })

    await waitFor(() => {
      expect(screen.getByText('로그인: test-user-id')).toBeInTheDocument()
    })

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'test-user-id' })
    const calledArg = vi.mocked(Sentry.setUser).mock.calls[0][0]
    expect(calledArg).not.toHaveProperty('email')
  })

  it('로그아웃 상태가 되면 Sentry.setUser에 null을 전달해 사용자 태그를 지운다', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    act(() => {
      authStateCallback?.(null)
    })

    await waitFor(() => {
      expect(screen.getByText('비로그인')).toBeInTheDocument()
    })

    expect(Sentry.setUser).toHaveBeenCalledWith(null)
  })
})
