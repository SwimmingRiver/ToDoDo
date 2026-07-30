import { test, expect } from '@playwright/test'
import { loginAsTestUser } from '../utils/auth'
import { createTodo } from '../utils/todo'

test.describe('캘린더 뷰 진입 및 표시 확인', () => {
  test('캘린더 화면에 진입하면 월간 그리드가 보이고, 오늘 마감인 할 일이 표시된다', async ({
    page,
  }) => {
    await loginAsTestUser(page)

    const title = `캘린더 표시 ${Date.now()}`
    await createTodo(page, { title, dueToday: true })

    await page.goto('/calendar')

    // 뷰 전환 토글(월간/주간)이 보이면 FullCalendar가 정상 마운트된 것이다.
    await expect(page.getByRole('button', { name: '월간' })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole('button', { name: '주간' })).toBeVisible()

    // 오늘 마감으로 만든 할 일이 캘린더 그리드에 이벤트로 노출돼야 한다.
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 })
  })
})
