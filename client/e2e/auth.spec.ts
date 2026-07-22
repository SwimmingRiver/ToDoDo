import { test, expect } from '@playwright/test'

/**
 * 인증 플로우 E2E 테스트
 *
 * 실제 Firebase Auth는 연결하지 않고, 라우팅 및 UI 동작을 검증합니다.
 * - 미인증 사용자의 루트 경로 접근 시 랜딩 페이지 노출
 * - 미인증 사용자의 보호된 라우트 접근 시 /login 리다이렉션
 * - 로그인 페이지 UI 요소 확인
 */

test.describe('인증 플로우', () => {
  test('미인증 사용자는 루트 경로에서 랜딩 페이지를 볼 수 있어야 한다', async ({
    page,
  }) => {
    // 쿠키/세션 없이 루트 경로에 접근
    await page.goto('/')

    // RootGate는 비로그인 상태면 /login으로 보내지 않고 랜딩 페이지를 노출한다
    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', { level: 1, name: /해야 할 일/ })
    ).toBeVisible({ timeout: 10000 })
  })

  test('로그인 페이지에 ToDoDo 타이틀이 표시되어야 한다', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByText('ToDoDo')).toBeVisible()
  })

  test('로그인 페이지에 Google 로그인 버튼이 표시되어야 한다', async ({ page }) => {
    await page.goto('/login')

    const googleButton = page.getByRole('button', { name: /Google로 로그인/i })
    await expect(googleButton).toBeVisible()
  })

  test('Google 로그인 버튼은 클릭 가능해야 한다', async ({ page }) => {
    await page.goto('/login')

    const googleButton = page.getByRole('button', { name: /Google로 로그인/i })
    await expect(googleButton).toBeEnabled()
  })

  test('/todo 경로도 미인증 시 /login으로 리다이렉트되어야 한다', async ({ page }) => {
    await page.goto('/todo')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('/kanban 경로도 미인증 시 /login으로 리다이렉트되어야 한다', async ({ page }) => {
    await page.goto('/kanban')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('/calendar 경로도 미인증 시 /login으로 리다이렉트되어야 한다', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})
