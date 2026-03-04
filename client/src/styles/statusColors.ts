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
    main: "#10b981", // 초록 - 완료
    light: "#d1fae5", // 연한 배경
    border: "#34d399",
  },
} as const;

export type Status = keyof typeof statusColors;

export const getStatusColor = (status: Status) => statusColors[status];
