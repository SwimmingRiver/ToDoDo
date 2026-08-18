/* main은 각자의 light 배경 위 텍스트(StatusBadge, StatusPill)로도 쓰이므로
   WCAG AA 텍스트 기준(4.5:1)을 만족해야 한다. light/border는 그대로 두고
   main만 한 단계씩 어둡게 잡아 세 상태 모두 기준을 넘긴다. 회귀 검증은
   statusColorsContrast.test.ts 참고. */
export const statusColors = {
  todo: {
    main: "#4b5563", // 회색 - 대기 상태 (on light: 6.87:1)
    light: "#f3f4f6", // 연한 배경
    border: "#9ca3af",
  },
  doing: {
    main: "#1d4ed8", // 파란 - 진행 중 (on light: 5.49:1)
    light: "#dbeafe", // 연한 배경
    border: "#60a5fa",
  },
  done: {
    main: "#065f46", // 초록(틸) - 완료 (on light: 6.78:1). brand.fill(#1D9E75)과는
    // 별개 값이다 — brand.fill은 텍스트로 쓸 수 없어(colors.ts 참고) 여기 재사용 불가.
    light: "#d1fae5", // 연한 배경
    border: "#34d399",
  },
} as const;

export type Status = keyof typeof statusColors;

export const getStatusColor = (status: Status) => statusColors[status];
