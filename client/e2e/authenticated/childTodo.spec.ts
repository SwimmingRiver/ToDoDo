import { test, expect } from '@playwright/test'
import { loginAsTestUser } from '../utils/auth'
import { createTodo } from '../utils/todo'

/**
 * 하위 할 일 생성 골든 패스. parentId 계층은 데이터 모델의 핵심 축인데, 실제 폼
 * 입력 → Firestore 저장 → 화면 반영까지 브라우저로 검증된 적이 없어 추가한다.
 */
test.describe('하위 할 일 생성', () => {
  test('상세 페이지에서 첫 하위 할 일을 추가하면 계층으로 표시된다', async ({ page }) => {
    await loginAsTestUser(page)

    const parentTitle = `부모 할일 ${Date.now()}`
    await createTodo(page, { title: parentTitle })

    await page.getByText(parentTitle, { exact: true }).click()
    await expect(page).toHaveURL(/\/todo\/.+/)

    await page.getByText('+ 첫 하위 할 일 추가').click()

    const childTitleInput = page.getByPlaceholder('무엇을 해야 하나요?')
    await expect(childTitleInput).toBeVisible()
    const childTitle = `하위 할일 ${Date.now()}`
    await childTitleInput.fill(childTitle)
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(childTitleInput).not.toBeVisible({ timeout: 10000 })

    await expect(page.getByText(childTitle, { exact: true })).toBeVisible({ timeout: 10000 })
  })
})
