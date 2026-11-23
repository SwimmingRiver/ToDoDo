import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import LoginPage from '../loginPage'
import { AuthContext } from '../../context/authContext'
import { signInWithGoogle, signInWithApple, consumeLinkedNotice } from '../../api/signIn'
import type { User } from 'firebase/auth'

vi.mock('../../api/signIn', () => ({
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
  consumeLinkedNotice: vi.fn(),
}))

const toastInfo = vi.fn()
vi.mock('@/shared', () => ({
  useToast: () => ({ info: toastInfo }),
}))

const refreshUser = vi.fn()
const mockAuthContext = (user: User | null, loading = false) => ({
  user,
  loading,
  logout: vi.fn().mockResolvedValue(undefined),
  refreshUser,
})

const mockUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: '테스트 사용자',
} as User

const AFTER_OPEN = new Date('2026-12-28T00:00:00+09:00')
const BEFORE_OPEN = new Date('2026-12-27T23:59:59+09:00')

const renderLogin = (user: User | null = null, loading = false) =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthContext.Provider value={mockAuthContext(user, loading)}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/today" element={<div>투데이 페이지</div>} />
          <Route path="/" element={<div>홈</div>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )

const credential = { user: mockUser }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AFTER_OPEN)
  vi.mocked(signInWithGoogle).mockResolvedValue(credential as never)
  vi.mocked(signInWithApple).mockResolvedValue(credential as never)
  vi.mocked(consumeLinkedNotice).mockReturnValue(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('LoginPage 컴포넌트', () => {
  it('이미 로그인된 사용자는 /today로 리다이렉트되어야 한다', () => {
    renderLogin(mockUser)
    expect(screen.getByText('투데이 페이지')).toBeInTheDocument()
    expect(screen.queryByText('Google로 로그인')).not.toBeInTheDocument()
  })

  it('비로그인 사용자는 로그인 화면을 볼 수 있어야 한다', () => {
    renderLogin()
    expect(screen.getByText('Google로 로그인')).toBeInTheDocument()
  })

  it('인증 로딩 중에는 아무것도 렌더링하지 않아야 한다', () => {
    const { container } = renderLogin(null, true)
    expect(container.firstChild).toBeNull()
  })

  it('Google 로그인 클릭 시 signInWithGoogle을 호출하고 홈으로 이동한다', async () => {
    renderLogin()
    fireEvent.click(screen.getByText('Google로 로그인'))
    await waitFor(() => expect(screen.getByText('홈')).toBeInTheDocument())
    expect(signInWithGoogle).toHaveBeenCalled()
    expect(refreshUser).not.toHaveBeenCalled()
  })

  describe('Apple 로그인', () => {
    it('공개 전에는 Apple 버튼과 이메일 가리기 안내가 없다', () => {
      vi.setSystemTime(BEFORE_OPEN)
      renderLogin()
      expect(screen.queryByText('Apple로 로그인')).not.toBeInTheDocument()
      expect(screen.queryByText('전에 Google로 가입했다면 Google로 로그인해 주세요.')).not.toBeInTheDocument()
    })

    it('공개 후에는 버튼과 안내가 보이고 클릭 시 signInWithApple을 호출한다', async () => {
      renderLogin()
      expect(screen.getByText('전에 Google로 가입했다면 Google로 로그인해 주세요.')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Apple로 로그인'))
      await waitFor(() => expect(signInWithApple).toHaveBeenCalled())
    })

    it('Apple 로그인 성공 시 refreshUser를 호출한다', async () => {
      renderLogin()
      fireEvent.click(screen.getByText('Apple로 로그인'))
      await waitFor(() => expect(refreshUser).toHaveBeenCalled())
    })

    it('다른 방법으로 가입된 이메일이면 충돌 문구를 보여준다', async () => {
      vi.mocked(signInWithApple).mockRejectedValue({ code: 'auth/account-exists-with-different-credential' })
      renderLogin()
      fireEvent.click(screen.getByText('Apple로 로그인'))
      expect(
        await screen.findByText('이미 다른 방법으로 가입된 이메일이에요. 그 방법으로 로그인해 주세요.'),
      ).toBeInTheDocument()
    })

    it('사용자가 팝업을 닫으면 오류 문구를 보여주지 않는다', async () => {
      vi.mocked(signInWithApple).mockRejectedValue({ code: 'auth/popup-closed-by-user' })
      renderLogin()
      fireEvent.click(screen.getByText('Apple로 로그인'))
      await waitFor(() => expect(signInWithApple).toHaveBeenCalled())
      await waitFor(() => expect(screen.getByText('Apple로 로그인')).not.toBeDisabled())
      expect(screen.queryByText(/오류가 발생했습니다|이미 다른 방법/)).not.toBeInTheDocument()
    })

    it('그 밖의 실패는 기존 오류 문구를 보여준다', async () => {
      vi.mocked(signInWithApple).mockRejectedValue({ code: 'auth/network-request-failed' })
      renderLogin()
      fireEvent.click(screen.getByText('Apple로 로그인'))
      expect(await screen.findByText('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')).toBeInTheDocument()
    })
  })

  it('연결 안내 대상이면 토스트를 한 번 띄운다', async () => {
    vi.mocked(consumeLinkedNotice).mockReturnValue(true)
    renderLogin()
    fireEvent.click(screen.getByText('Google로 로그인'))
    await waitFor(() => expect(screen.getByText('홈')).toBeInTheDocument())
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo).toHaveBeenCalledWith('이제 Google·Apple 둘 다로 로그인할 수 있어요')
  })
})
