// 웹 todoForm/todoListItem에서 실제 쓰인 값을 8px 그리드로 정리한 것.
// design/spec.md "간격 · 반경 · 타이포그래피" 절 참고.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
} as const;

/** 모든 Pressable의 최소 터치 타겟 (client/CLAUDE.md 기준과 동일). */
export const MIN_TOUCH_TARGET = 44;
