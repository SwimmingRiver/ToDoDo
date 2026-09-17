/* main은 각자의 light 배경 위 텍스트(StatusBadge, StatusPill)로도 쓰이므로
   WCAG AA 텍스트 기준(4.5:1)을 만족해야 한다. light/border는 그대로 두고
   main만 한 단계씩 어둡게 잡아 세 상태 모두 기준을 넘긴다. 회귀 검증은
   statusColorsContrast.test.ts 참고.

   doing은 브랜드 그린(brand.fill, hue160.9°)과 거의 같은 색상군(hue 160°대)으로
   맞춰 프로젝트 카드의 "진행중" 점과 통일했다. done은 "완료=초록"이라는 통념과
   충돌하지 않으면서 doing/todo와 뚜렷이 구분되도록 보라(violet) 계열로 잡았다. */
export const statusColors = {
  todo: {
    main: "#4b5563", // 회색 - 대기 상태 (on light: 6.87:1)
    light: "#f3f4f6", // 연한 배경
    border: "#9ca3af",
  },
  doing: {
    main: "#117453", // 초록(그린) - 진행 중. brand.fill(#1D9E75, hue160.9°)과
    // 거의 같은 색상군(hue 160°)이라 프로젝트 카드의 "진행중" 점과 통일된다.
    light: "#e5faf3", // 연한 배경
    border: "#5ae2b5",
  },
  done: {
    main: "#6d28d9", // 보라(바이올렛) - 완료 (on light: 5.98:1 / on white: 7.10:1).
    // doing(그린)·todo(회색)와 색상군이 뚜렷이 갈리면서도 브랜드 그린과는
    // 겹치지 않는 완료/종결 톤.
    light: "#ede9fe", // 연한 배경
    border: "#a78bfa",
  },
} as const;

export type Status = keyof typeof statusColors;

export const getStatusColor = (status: Status) => statusColors[status];
