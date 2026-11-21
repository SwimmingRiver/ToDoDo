import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { signInWithPopup, browserPopupRedirectResolver } from 'firebase/auth'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import LoginPage from '../loginPage'
import { AuthContext } from '../../context/authContext'
import type { User } from 'firebase/auth'

vi.mock('@/shared/lib/firebase', () => ({
  auth: {},
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  signInWithPopup: vi.fn().mockResolvedValue(undefined),
}))

const mockAuthContext = (user: User | null, loading = false) => ({
  user,
  loading,
  logout: vi.fn().mockResolvedValue(undefined),
})

const mockUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: '테스트 사용자',
} as User

describe('LoginPage 컴포넌트', () => {
  it('이미 로그인된 사용자는 /today로 리다이렉트되어야 한다', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthContext.Provider value={mockAuthContext(mockUser)}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/today" element={<div>투데이 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('투데이 페이지')).toBeInTheDocument()
    expect(screen.queryByText('Google로 로그인')).not.toBeInTheDocument()
  })

  it('비로그인 사용자는 로그인 화면을 볼 수 있어야 한다', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthContext.Provider value={mockAuthContext(null)}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/today" element={<div>투데이 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Google로 로그인')).toBeInTheDocument()
  })

  it('인증 로딩 중에는 아무것도 렌더링하지 않아야 한다', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthContext.Provider value={mockAuthContext(null, true)}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/today" element={<div>투데이 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(container.firstChild).toBeNull()
  })

  it('Google 로그인은 팝업 처리기를 함께 넘긴다(auth를 처리기 없이 초기화하므로 빠지면 auth/argument-error)', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthContext.Provider value={mockAuthContext(null)}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>홈</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Google로 로그인'))

    await waitFor(() => expect(signInWithPopup).toHaveBeenCalled())
    expect(vi.mocked(signInWithPopup).mock.calls[0][2]).toBe(browserPopupRedirectResolver)
  })
})
