import { test, expect } from '@playwright/test'
import { loginAsTestUser } from '../utils/auth'
import { createTodo } from '../utils/todo'

/**
 * 인증 이후 핵심 골든 패스: 할 일 생성 → 완료 처리.
 *
 * Firebase Auth/Firestore 에뮬레이터에 실제로 로그인해(playwright.config.ts,
 * e2e/utils/auth.ts) Today 화면에서의 CRUD가 실제 SDK 경로를 그대로 타는지
 * 검증한다. 각 테스트는 별도 브라우저 컨텍스트 = 별도 익명 사용자라서 서로의
 * 데이터에 영향을 주지 않는다.
 */
test.describe('할 일 생성 → 완료 처리', () => {
  test('오늘 마감으로 만든 할 일이 Today 화면에 나타나고, 체크하면 완료로 표시된다', async ({
    page,
  }) => {
    await loginAsTestUser(page)

    const title = `E2E 할 일 ${Date.now()}`
    await createTodo(page, { title, dueToday: true })

    await page.goto('/today')

    const checkbox = page.getByRole('checkbox', { name: `${title} 완료 처리` })
    await expect(checkbox).toBeVisible({ timeout: 10000 })
    await expect(checkbox).toHaveAttribute('aria-checked', 'false')

    await checkbox.click()

    await expect(checkbox).toHaveAttribute('aria-checked', 'true', { timeout: 10000 })
  })
})
