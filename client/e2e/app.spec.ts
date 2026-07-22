import { test, expect } from '@playwright/test'

/**
 * App 기본 E2E 테스트
 *
 * 미인증 상태에서의 기본 동작을 검증합니다.
 */

test.describe('App E2E Tests', () => {
  test('페이지가 로드되어야 한다', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/tododo/i)
  })

  test('미인증 상태에서 루트 경로는 랜딩 페이지를 보여줘야 한다', async ({
    page,
  }) => {
    await page.goto('/')
    // RootGate가 Firebase Auth 로딩 완료 후 비로그인 상태면 랜딩 페이지를 노출
    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', { level: 1, name: /해야 할 일/ })
    ).toBeVisible({ timeout: 10000 })
  })

  test('로그인 페이지가 정상 로드되어야 한다', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('ToDoDo')).toBeVisible()
    await expect(page.getByRole('button', { name: /Google로 로그인/i })).toBeVisible()
  })
})
