import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** 오늘 날짜의 datetime-local 입력값("YYYY-MM-DDTHH:mm"). 정오로 고정해
 *  자정 근처 타임존 반올림으로 날짜가 하루 밀리는 경우를 피한다. */
export function todayDateTimeLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}T12:00`
}

interface CreateTodoOptions {
  title: string
  /** true면 "더보기"를 펼쳐 만료일시를 오늘 정오로 채운다(Today/캘린더 화면 노출용). */
  dueToday?: boolean
}

/**
 * /todo 페이지에서 "새 할일" 버튼으로 폼을 열고 할 일을 하나 생성한다.
 * 이 페이지의 생성 폼은 다른 화면(Today, 칸반, 캘린더)에서 쓰는 TodoForm과
 * 동일한 컴포넌트라서, 여기서 만든 할 일이 그대로 다른 화면 테스트의 시드 데이터가 된다.
 */
export async function createTodo(page: Page, { title, dueToday }: CreateTodoOptions) {
  await page.goto('/todo')
  await page.getByRole('button', { name: '새 할일', exact: true }).click()

  const titleInput = page.getByPlaceholder('무엇을 해야 하나요?')
  await expect(titleInput).toBeVisible()
  await titleInput.fill(title)

  if (dueToday) {
    await page.getByRole('button', { name: '더보기' }).click()
    // 폼 순서상 시작일시(0) 다음이 만료일시(1)인 datetime-local 입력이다.
    const dueAtInput = page.locator('input[type="datetime-local"]').nth(1)
    await dueAtInput.fill(todayDateTimeLocal())
  }

  await page.getByRole('button', { name: 'Submit' }).click()

  // 모달이 닫히면(=폼이 사라지면) 생성이 완료된 것으로 본다.
  await expect(titleInput).not.toBeVisible({ timeout: 10000 })
}
