import { test, expect } from '@playwright/test'
import { loginAsTestUser } from '../utils/auth'
import { grantPremiumInEmulator } from '../utils/premium'

const AI_PROXY = 'http://ai-proxy.e2e.test'

/**
 * AI 플랜 골든 패스: 목표 입력 → AI 결과 편집(하나 제외) → 추가 → 목록에 상위·하위 반영.
 * ai-proxy는 가로채서 고정 응답을 준다. 실제 Anthropic 호출은 없다.
 */
test.describe('AI 할 일 플랜', () => {
  test('편집한 계획을 추가하면 목록에 상위와 체크한 하위만 생긴다', async ({ page, request }) => {
    await loginAsTestUser(page)
    await grantPremiumInEmulator(page, request)

    const suffix = Date.now()
    const parentTitle = `이사 준비 ${suffix}`
    await page.route(`${AI_PROXY}/plan`, async (route) => {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors })
        return
      }
      await route.fulfill({
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: {
            title: parentTitle,
            dueDate: null,
            items: [
              { title: `견적 받기 ${suffix}`, dueDate: null, priority: 'high' },
              { title: `짐 정리 ${suffix}`, dueDate: null, priority: 'low' },
            ],
          },
          usage: { used: 1, limit: 20 },
        }),
      })
    })

    await page.goto('/todo')
    await page.getByRole('button', { name: 'AI로 계획' }).click()
    await page.getByLabel('목표').fill('다음 달 이사 준비')
    await page.getByRole('button', { name: '계획 만들기' }).click()

    await expect(page.getByText('오늘 1/20회')).toBeVisible()
    await page.getByRole('checkbox', { name: `짐 정리 ${suffix} 포함` }).uncheck()
    await page.getByLabel(`견적 받기 ${suffix} 제목`).fill(`견적 5곳 받기 ${suffix}`)
    await page.getByRole('button', { name: '1개 추가' }).click()

    await expect(page.getByRole('dialog', { name: 'AI로 계획' })).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText(parentTitle, { exact: true })).toBeVisible({ timeout: 10000 })

    await page.getByText(parentTitle, { exact: true }).click()
    await expect(page.getByText(`견적 5곳 받기 ${suffix}`, { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(`짐 정리 ${suffix}`, { exact: true })).toHaveCount(0)
  })
})
