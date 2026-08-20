import { test, expect } from '@playwright/test'
import { loginAsTestUser } from '../utils/auth'
import { createTodo } from '../utils/todo'

/**
 * 모바일(태블릿 이하, 768px)에서는 컬럼이 1개만 렌더링되어 dnd-kit 드래그로 상태를
 * 옮길 수 없다(kanbanBoard.tsx). 대신 카드의 "..." 액션시트로 상태를 바꾸는데,
 * 기존 E2E(kanban.spec.ts)는 데스크톱 드래그 경로만 커버해 이 경로는 검증된 적이
 * 없어 추가한다.
 */
test.describe('칸반 카드 메뉴로 상태 변경 (모바일)', () => {
  test.use({ viewport: { width: 767, height: 800 } })

  test('카드의 상태 변경 메뉴에서 진행 중을 선택하면 Doing 탭에서 보인다', async ({ page }) => {
    await loginAsTestUser(page)

    const title = `모바일 상태변경 ${Date.now()}`
    await createTodo(page, { title })

    await page.goto('/kanban')

    const card = page.getByRole('button', { name: title, exact: false })
    await expect(card).toBeVisible({ timeout: 10000 })

    await card.getByRole('button', { name: '상태 변경 메뉴 열기' }).click()
    await page.getByText('진행 중', { exact: true }).click()

    // useUpdateTodo mutation → 재조회 후 To Do 탭에서 사라진다.
    await expect(card).toHaveCount(0, { timeout: 10000 })

    await page.getByRole('button', { name: /^Doing/ }).click()
    await expect(page.getByRole('button', { name: title, exact: false })).toBeVisible({
      timeout: 10000,
    })
  })
})
