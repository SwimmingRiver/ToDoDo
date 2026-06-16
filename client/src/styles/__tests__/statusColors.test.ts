import { describe, it, expect } from 'vitest'
import { statusColors, getStatusColor } from '../statusColors'

describe('statusColors', () => {
  describe('statusColors 객체', () => {
    it('todo, doing, done 세 가지 상태를 모두 가져야 한다', () => {
      expect(statusColors).toHaveProperty('todo')
      expect(statusColors).toHaveProperty('doing')
      expect(statusColors).toHaveProperty('done')
    })

    it('각 상태는 main, light, border 색상을 가져야 한다', () => {
      const states = ['todo', 'doing', 'done'] as const
      states.forEach((state) => {
        expect(statusColors[state]).toHaveProperty('main')
        expect(statusColors[state]).toHaveProperty('light')
        expect(statusColors[state]).toHaveProperty('border')
      })
    })

    it('todo 상태는 회색 계열 색상을 가져야 한다', () => {
      expect(statusColors.todo.main).toBe('#6b7280')
    })

    it('doing 상태는 파란색 계열 색상을 가져야 한다', () => {
      expect(statusColors.doing.main).toBe('#3b82f6')
    })

    it('done 상태는 초록색 계열 색상을 가져야 한다', () => {
      // 리브랜딩 스펙(1-4) 기준 브랜드 secondary 틸 색상으로 통일됨
      expect(statusColors.done.main).toBe('#1D9E75')
    })
  })

  describe('getStatusColor', () => {
    it('todo 상태의 색상 객체를 반환해야 한다', () => {
      const color = getStatusColor('todo')
      expect(color).toEqual(statusColors.todo)
    })

    it('doing 상태의 색상 객체를 반환해야 한다', () => {
      const color = getStatusColor('doing')
      expect(color).toEqual(statusColors.doing)
    })

    it('done 상태의 색상 객체를 반환해야 한다', () => {
      const color = getStatusColor('done')
      expect(color).toEqual(statusColors.done)
    })
  })
})
