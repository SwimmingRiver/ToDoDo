// client/src/styles/statusColors.ts 값을 그대로 복제한다.
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
    main: "#065f46", // 초록(틸) - 완료 (on light: 6.78:1)
    light: "#d1fae5", // 연한 배경
    border: "#34d399",
  },
} as const;

export type Status = keyof typeof statusColors;

export const getStatusColor = (status: Status) => statusColors[status];
