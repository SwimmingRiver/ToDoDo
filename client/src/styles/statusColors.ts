/* 주의: 아래 main 값들은 텍스트로 쓰일 때 WCAG AA(4.5:1)를 만족하지 못한다.
   현재 StatusBadge(todoDetail.styles.tsx), StatusPill(projectCard.styles.tsx)에서
   각자의 light 배경 위 12px 텍스트로 렌더링되며, 세 색 모두 기준 미달이다.
     - todo:  #6b7280 on #f3f4f6 = 4.39:1
     - doing: #3b82f6 on #dbeafe = 3.01:1
     - done:  #1D9E75 on #d1fae5 = 2.99:1
   done의 #1D9E75는 brand.fill과 값이 같은데, colors.ts와 brandContrast.test.ts는
   이 값을 "텍스트로 절대 쓰지 않는다"고 못박고 있다. 즉 여기 있는 건 브랜드 토큰
   체계에서 빠져나가 있어서 안전한 게 아니라, 아직 손대지 않은 위반이다.
   고치려면 main/light 조합을 함께 다시 잡는 별도 팔레트 작업이 필요하다.
   토큰 이름만 바꾸는 걸로는 해결되지 않아 이번 브랜드 토큰 재편 범위 밖으로 뒀다. */
export const statusColors = {
  todo: {
    main: "#6b7280", // 회색 - 대기 상태
    light: "#f3f4f6", // 연한 배경
    border: "#9ca3af",
  },
  doing: {
    main: "#3b82f6", // 파란 - 진행 중
    light: "#dbeafe", // 연한 배경
    border: "#60a5fa",
  },
  done: {
    main: "#1D9E75", // 초록(틸) - 완료, 리브랜딩 스펙 1-4 통일값
    light: "#d1fae5", // 연한 배경
    border: "#34d399",
  },
} as const;

export type Status = keyof typeof statusColors;

export const getStatusColor = (status: Status) => statusColors[status];
