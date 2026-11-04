import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../protectedRoute'
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
  it('로그인돼 있다가 로그아웃되면(로그아웃·탈퇴·다른 탭) 랜딩(/)으로 보낸다', () => {
    const tree = (user: User | null) => (
      <MemoryRouter initialEntries={['/protected']}>
        <AuthContext.Provider value={mockAuthContext(user)}>
          <Routes>
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>보호된 콘텐츠</div>
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<div>랜딩 페이지</div>} />
            <Route path="/login" element={<div>로그인 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    )
    const { rerender } = render(tree(mockUser))
    expect(screen.getByText('보호된 콘텐츠')).toBeInTheDocument()

    rerender(tree(null))

    expect(screen.getByText('랜딩 페이지')).toBeInTheDocument()
    expect(screen.queryByText('로그인 페이지')).not.toBeInTheDocument()
  })

  it('인증 로딩이 끝났을 때 처음부터 비로그인이면 여전히 /login으로 보낸다', () => {
    const tree = (user: User | null, loading: boolean) => (
      <MemoryRouter initialEntries={['/protected']}>
        <AuthContext.Provider value={mockAuthContext(user, loading)}>
          <Routes>
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>보호된 콘텐츠</div>
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<div>랜딩 페이지</div>} />
            <Route path="/login" element={<div>로그인 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    )
    const { rerender } = render(tree(null, true))
    rerender(tree(null, false))

    expect(screen.getByText('로그인 페이지')).toBeInTheDocument()
  })
})
