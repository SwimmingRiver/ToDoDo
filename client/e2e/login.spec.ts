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

  test('로그인 페이지에서 뒤로가기 하면 랜딩 페이지로 이동해야 한다', async ({
    page,
  }) => {
    // 랜딩 페이지 → 로그인 페이지로 이동한 이력을 만든다
    await page.goto('/')
    await expect(
      page.getByRole('heading', { level: 1, name: /해야 할 일/ })
    ).toBeVisible({ timeout: 10000 })

    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)

    // 브라우저 뒤로가기 시 이전 히스토리인 랜딩 페이지로 돌아가야 한다
    await page.goBack()
    await expect(page).not.toHaveURL(/\/login/)
    await expect(
      page.getByRole('heading', { level: 1, name: /해야 할 일/ })
    ).toBeVisible({ timeout: 10000 })
  })
})
