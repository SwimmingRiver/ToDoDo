import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
