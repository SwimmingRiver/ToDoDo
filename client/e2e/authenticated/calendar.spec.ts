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

// 상세로 갔다가 뒤로 오면 캘린더가 다시 마운트된다 — 보던 달·뷰·열린 날짜 시트가
// URL(search params)에서 복원돼야 모바일 기본 흐름(시트 → 상세 → 뒤로)이 끊기지 않는다.
test.describe('캘린더 상태 보존(상세 → 뒤로가기)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  const localKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  test('열린 날짜 시트와 넘긴 달이 뒤로가기 후 복원되고, 히스토리는 쌓이지 않는다', async ({ page }) => {
    await loginAsTestUser(page)
    const title = `상태 보존 ${Date.now()}`
    await createTodo(page, { title, dueToday: true })

    await page.goto('/calendar')
    const todayKey = await page.evaluate(() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })

    // 1) 시트 → 상세 → 뒤로: 시트가 다시 열려 있어야 한다
    await page.locator(`.fc-daygrid-day[data-date="${todayKey}"] .fc-daygrid-day-number`).click()
    const addButton = page.getByRole('button', { name: `${todayKey} 날짜에 새 할 일 추가` })
    await expect(addButton).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`[?&]sheet=${todayKey}`))
    await page.getByRole('button', { name: new RegExp(`${title}.*상세 보기`) }).click()
    await expect(page).toHaveURL(/\/todo\/[^/?]+$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/calendar/)
    await expect(addButton).toBeVisible()

    // 2) 시트를 닫고 두 달 넘긴 뒤 다른 페이지 갔다 뒤로: 그 달이어야 한다
    await page.keyboard.press('Escape')
    await expect(page).not.toHaveURL(/sheet=/)
    await page.locator('.fc-next-button').click()
    await page.locator('.fc-next-button').click()
    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth() + 2, 1)
    const targetTitle = await page.locator('.fc-toolbar-title').textContent()
    await expect(page).toHaveURL(new RegExp(`[?&]date=${localKey(target)}`))
    await page.goto('/today')
    await page.goBack()
    await expect(page.locator('.fc-toolbar-title')).toHaveText(targetTitle!)

    // 3) 달 이동·시트 여닫기는 replace — 뒤로 한 번이면 캘린더에 들어오기 직전 페이지
    //    (createTodo가 머문 /todo 목록)다. 상세(/todo/:id)는 /today 이동 때 앞쪽 기록이 잘렸다.
    await page.goBack()
    await expect(page).toHaveURL(/\/todo$/)
  })
})
