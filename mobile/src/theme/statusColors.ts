// packages/core/src/theme/light.ts의 status 값을 그대로 복제한다(웹 client는 이 값을
// CSS 변수로 참조한다). 원본이 바뀌면 이 파일도 함께 갱신해야 한다.
export const statusColors = {
  todo: {
    main: "#4b5563", // 회색 - 대기 상태 (on light: 6.87:1)
    light: "#f3f4f6", // 연한 배경
    border: "#9ca3af",
  },
  doing: {
    main: "#117453", // 초록 - 진행 중, brand.fill과 같은 hue
    light: "#e5faf3", // 연한 배경
    border: "#5ae2b5",
  },
  done: {
    main: "#6d28d9", // 보라 - 완료, doing/todo와 뚜렷이 구분
    light: "#ede9fe", // 연한 배경
    border: "#a78bfa",
  },
} as const;

export type Status = keyof typeof statusColors;

export const getStatusColor = (status: Status) => statusColors[status];
