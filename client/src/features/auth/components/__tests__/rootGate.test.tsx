import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RootGate from '../rootGate'
import { AuthContext } from '../../context/authContext'
import type { User } from 'firebase/auth'

vi.mock('@/shared/lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
}))

vi.mock('@/features/landing/pages/landingPage', () => ({
  default: () => <div>랜딩 페이지</div>,
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

describe('RootGate 컴포넌트', () => {
  it('로그인된 사용자는 /today로 리다이렉트되어야 한다', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthContext.Provider value={mockAuthContext(mockUser)}>
          <Routes>
            <Route path="/" element={<RootGate />} />
            <Route path="/today" element={<div>투데이 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('투데이 페이지')).toBeInTheDocument()
    expect(screen.queryByText('랜딩 페이지')).not.toBeInTheDocument()
  })

  it('비로그인 사용자는 랜딩 페이지를 볼 수 있어야 한다', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthContext.Provider value={mockAuthContext(null)}>
          <Routes>
            <Route path="/" element={<RootGate />} />
            <Route path="/today" element={<div>투데이 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('랜딩 페이지')).toBeInTheDocument()
    expect(screen.queryByText('투데이 페이지')).not.toBeInTheDocument()
  })

  it('로딩 중일 때 아무것도 렌더링하지 않아야 한다', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <AuthContext.Provider value={mockAuthContext(null, true)}>
          <Routes>
            <Route path="/" element={<RootGate />} />
            <Route path="/today" element={<div>투데이 페이지</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.queryByText('랜딩 페이지')).not.toBeInTheDocument()
    expect(screen.queryByText('투데이 페이지')).not.toBeInTheDocument()
    // 로딩 중에는 null 반환
    expect(container.firstChild).toBeNull()
  })
})
