import { test, expect } from '@playwright/test'
import { loginAsTestUser } from '../utils/auth'
import { todayDateTimeLocal } from '../utils/todo'

/**
 * 반복 할 일 생성 골든 패스. 유닛/API 레벨(recurrenceFields, recurringTodoApi)
 * 테스트는 두텁지만, 실제 반복 폼 UI를 통해 생성하는 흐름이 브라우저로 검증된
 * 적이 없어 추가한다. 반복 토글은 시작일시가 있어야 활성화되므로(recurrenceFields.tsx)
 * "더보기"로 시작일시를 먼저 채운다.
 */
test.describe('반복 할 일 생성', () => {
  test('시작일시를 채우고 반복을 켜면 매일 반복 할 일이 생성되고 반복 배지가 보인다', async ({
    page,
  }) => {
    await loginAsTestUser(page)

    const title = `반복 할일 ${Date.now()}`
    await page.goto('/todo')
    await page.getByRole('button', { name: '새 할일', exact: true }).click()

    const titleInput = page.getByPlaceholder('무엇을 해야 하나요?')
    await expect(titleInput).toBeVisible()
    await titleInput.fill(title)

    await page.getByRole('button', { name: '더보기' }).click()
    // 폼 순서상 시작일시(0) 다음이 만료일시(1)인 datetime-local 입력이다.
    const startAtInput = page.locator('input[type="datetime-local"]').nth(0)
    await startAtInput.fill(todayDateTimeLocal())

    const recurrenceCheckbox = page.getByRole('checkbox', { name: '이 할 일을 반복합니다' })
    await expect(recurrenceCheckbox).toBeEnabled()
    await recurrenceCheckbox.check()

    // 반복 주기는 기본값(매일)을 그대로 사용한다.
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(titleInput).not.toBeVisible({ timeout: 10000 })

    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('반복', { exact: true })).toBeVisible()
  })
})
