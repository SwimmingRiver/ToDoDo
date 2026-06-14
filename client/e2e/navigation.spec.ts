import { test, expect } from '@playwright/test'

/**
 * 네비게이션 및 레이아웃 E2E 테스트
 *
 * 미인증 상태에서 접근 가능한 /login 페이지를 기준으로 테스트합니다.
 * 인증이 필요한 라우트는 리다이렉트 동작을 검증합니다.
 */

test.describe('네비게이션 및 라우팅', () => {
  test('루트 하위 보호된 경로에 미인증 접근 시 /login으로 리다이렉트되어야 한다', async ({
    page,
  }) => {
    // /todo 경로는 ProtectedRoute로 감싸져 있으므로 /login으로 리다이렉트
    await page.goto('/todo')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('/login 경로는 직접 접근 가능해야 한다', async ({ page }) => {
    const response = await page.goto('/login')
    // 200 응답 (SPA이므로 index.html 반환)
    expect(response?.status()).toBe(200)
    await expect(page.getByText('ToDoDo')).toBeVisible()
  })

  test('여러 보호된 라우트가 순서대로 모두 /login으로 리다이렉트되어야 한다', async ({
    page,
  }) => {
    const protectedRoutes = ['/todo', '/kanban', '/calendar', '/pie-chart']

    for (const route of protectedRoutes) {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
    }
  })
})

test.describe('로그인 페이지 반응형 레이아웃', () => {
  test('데스크톱 화면에서 로그인 페이지가 올바르게 렌더링되어야 한다', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/login')

    await expect(page.getByText('ToDoDo')).toBeVisible()
    await expect(page.getByRole('button', { name: /Google로 로그인/i })).toBeVisible()
  })

  test('모바일 화면에서 로그인 페이지가 올바르게 렌더링되어야 한다', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/login')

    await expect(page.getByText('ToDoDo')).toBeVisible()
    await expect(page.getByRole('button', { name: /Google로 로그인/i })).toBeVisible()
  })

  test('태블릿 화면에서 로그인 페이지가 올바르게 렌더링되어야 한다', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/login')

    await expect(page.getByText('ToDoDo')).toBeVisible()
    await expect(page.getByRole('button', { name: /Google로 로그인/i })).toBeVisible()
  })
})
