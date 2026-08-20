import { test, expect } from '@playwright/test'
import { loginAsTestUser } from '../utils/auth'
import { createTodo } from '../utils/todo'

/**
 * 생성/완료 체크만 있던 기존 E2E에 빠져있던 수정·삭제 골든 패스.
 */
test.describe('할 일 수정 · 삭제', () => {
  test('상세 페이지에서 제목을 수정하면 목록에 반영된다', async ({ page }) => {
    await loginAsTestUser(page)

    const originalTitle = `수정 전 ${Date.now()}`
    await createTodo(page, { title: originalTitle })

    await page.getByText(originalTitle, { exact: true }).click()
    await expect(page).toHaveURL(/\/todo\/.+/)

    const titleField = page.getByPlaceholder('할 일 제목')
    await expect(titleField).toHaveValue(originalTitle)

    const updatedTitle = `수정 후 ${Date.now()}`
    await titleField.fill(updatedTitle)
    await page.getByRole('button', { name: '저장' }).click()

    // 저장 성공 시 handleClose()가 navigate(-1)로 /todo로 돌아간다(todoDetail.tsx).
    await expect(page).toHaveURL(/\/todo$/, { timeout: 10000 })
    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(originalTitle, { exact: true })).toHaveCount(0)
  })

  test('목록에서 삭제하면 카드가 사라진다', async ({ page }) => {
    await loginAsTestUser(page)

    const title = `삭제 대상 ${Date.now()}`
    await createTodo(page, { title })

    await page.goto('/todo')
    const card = page.getByText(title, { exact: true })
    await expect(card).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: '프로젝트 삭제' }).click()
    await page.getByRole('button', { name: '삭제', exact: true }).click()

    await expect(card).toHaveCount(0, { timeout: 10000 })
  })
})
