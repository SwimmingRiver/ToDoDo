import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../protectedRoute'
import { AuthContext } from '../../context/authContext'
import type { User } from 'firebase/auth'

vi.mock('@/shared/lib/firebase', () => ({
  auth: {},
  googleProvider: {},
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

describe('ProtectedRoute 컴포넌트', () => {
  it('로그인된 사용자는 보호된 콘텐츠에 접근할 수 있어야 한다', () => {
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthContext.Provider value={mockAuthContext(mockUser)}>
          <Routes>
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>보호된 콘텐츠</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>로그인 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('보호된 콘텐츠')).toBeInTheDocument()
    expect(screen.queryByText('로그인 페이지')).not.toBeInTheDocument()
  })

  it('미인증 사용자는 /login으로 리다이렉트되어야 한다', () => {
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthContext.Provider value={mockAuthContext(null)}>
          <Routes>
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>보호된 콘텐츠</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>로그인 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('로그인 페이지')).toBeInTheDocument()
    expect(screen.queryByText('보호된 콘텐츠')).not.toBeInTheDocument()
  })

  it('로딩 중일 때 아무것도 렌더링하지 않아야 한다', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthContext.Provider value={mockAuthContext(null, true)}>
          <Routes>
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>보호된 콘텐츠</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>로그인 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.queryByText('보호된 콘텐츠')).not.toBeInTheDocument()
    expect(screen.queryByText('로그인 페이지')).not.toBeInTheDocument()
    // 로딩 중에는 null 반환
    expect(container.firstChild).toBeNull()
  })
})
