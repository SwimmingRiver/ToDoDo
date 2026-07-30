import { test, expect, type Page } from '@playwright/test'
import { loginAsTestUser } from '../utils/auth'
import { createTodo } from '../utils/todo'

/**
 * dnd-kit PointerSensor는 activationConstraint.distance: 8(useKanbanDrag.ts)이라
 * pointerdown 직후 최소 8px 이상 움직여야 드래그가 시작된다. 단일 mouse.move로
 * 목표 지점까지 점프하면 중간 pointermove가 생략돼 dnd-kit의 충돌 감지가 대상
 * 컬럼을 인식하지 못할 수 있으므로, steps로 나눠 여러 pointermove를 발생시킨다.
 */
async function dragCardToColumn(page: Page, cardName: string, targetTestId: string) {
  const card = page.getByRole('button', { name: cardName })
  const target = page.getByTestId(targetTestId)

  const source = await card.boundingBox()
  const dest = await target.boundingBox()
  if (!source || !dest) throw new Error('드래그 대상 요소의 위치를 찾을 수 없습니다')

  const startX = source.x + source.width / 2
  const startY = source.y + source.height / 2
  const endX = dest.x + dest.width / 2
  const endY = dest.y + dest.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // 활성화 거리(8px)를 확실히 넘기는 첫 이동
  await page.mouse.move(startX + 20, startY + 20, { steps: 5 })
  await page.mouse.move(endX, endY, { steps: 15 })
  await page.mouse.move(endX, endY, { steps: 2 })
  await page.mouse.up()
}

test.describe('칸반 보드 드래그앤드롭으로 상태 변경', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('To Do 카드를 Doing 컬럼으로 드래그하면 상태가 바뀐다', async ({ page }) => {
    await loginAsTestUser(page)

    const title = `칸반 드래그 ${Date.now()}`
    await createTodo(page, { title })

    await page.goto('/kanban')

    const todoColumn = page.getByTestId('kanban-column-todo')
    const doingColumn = page.getByTestId('kanban-column-doing')

    await expect(todoColumn.getByRole('button', { name: title })).toBeVisible({
      timeout: 10000,
    })
    await expect(doingColumn.getByRole('button', { name: title })).toHaveCount(0)

    await dragCardToColumn(page, title, 'kanban-column-doing')

    // 드래그 종료 시 useUpdateTodo mutation → TanStack Query 재조회를 기다린다.
    await expect(doingColumn.getByRole('button', { name: title })).toBeVisible({
      timeout: 10000,
    })
    await expect(todoColumn.getByRole('button', { name: title })).toHaveCount(0)
  })
})
