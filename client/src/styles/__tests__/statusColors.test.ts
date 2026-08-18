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
      expect(statusColors.todo.main).toBe('#4b5563')
    })

    it('doing 상태는 파란색 계열 색상을 가져야 한다', () => {
      expect(statusColors.doing.main).toBe('#1d4ed8')
    })

    it('done 상태는 초록색 계열 색상을 가져야 한다', () => {
      // brand.fill(#1D9E75)은 텍스트로 쓸 수 없어(colors.ts, brandContrast.test.ts)
      // 할 일 상태 배지 텍스트로는 더 어두운 별도 값을 쓴다.
      expect(statusColors.done.main).toBe('#065f46')
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
