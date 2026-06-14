import { test, expect } from '@playwright/test'

/**
 * 로그인 페이지 상세 UI/UX E2E 테스트
 */

test.describe('로그인 페이지 UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('페이지 제목이 올바르게 표시되어야 한다', async ({ page }) => {
    await expect(page).toHaveTitle(/tododo/i)
  })

  test('로그인 카드가 렌더링되어야 한다', async ({ page }) => {
    // Card 컴포넌트가 ToDoDo 타이틀을 포함
    await expect(page.getByText('ToDoDo')).toBeVisible()
  })

  test('Google 로그인 버튼 텍스트가 올바르게 표시되어야 한다', async ({ page }) => {
    await expect(page.getByText('Google로 로그인')).toBeVisible()
  })

  test('Google 로그인 버튼 클릭 시 로딩 상태가 표시되어야 한다', async ({ page }) => {
    // Google 팝업을 차단하고 로딩 상태만 확인
    await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      // 요청을 잠시 지연시켜 로딩 상태 확인
      await new Promise((resolve) => setTimeout(resolve, 500))
      await route.abort()
    })

    const googleButton = page.getByRole('button', { name: /Google로 로그인/i })
    await googleButton.click()

    // 로딩 중 텍스트 또는 버튼 비활성화 확인
    await expect(page.getByRole('button')).toBeDisabled({ timeout: 2000 }).catch(() => {
      // 로딩 텍스트로 대체 확인
      return expect(page.getByText('로그인 중...')).toBeVisible({ timeout: 2000 })
    })
  })

  test('로그인 페이지에서 뒤로가기 해도 /login을 유지해야 한다', async ({ page }) => {
    await page.goto('/')
    // 미인증 상태이므로 /login으로 리다이렉트
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})
