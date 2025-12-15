import { test, expect } from '@playwright/test'

test.describe('App E2E Tests', () => {
  test('페이지가 로드되어야 한다', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/tododo/i)
  })

  test('Todo/Kanban 탭 전환이 동작해야 한다', async ({ page }) => {
    await page.goto('/')

    // Todo 탭이 기본으로 선택되어 있어야 함
    const todoTab = page.getByRole('button', { name: 'Todo' })
    const kanbanTab = page.getByRole('button', { name: 'Kanban' })

    await expect(todoTab).toBeVisible()
    await expect(kanbanTab).toBeVisible()

    // Kanban 탭 클릭
    await kanbanTab.click()

    // Todo 탭 클릭
    await todoTab.click()
  })
})
