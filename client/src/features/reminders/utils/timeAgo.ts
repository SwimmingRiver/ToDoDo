const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 알림 기록용 상대 시각. 기록은 최대 7일이라 주·월 단위는 필요 없다. */
export const formatTimeAgo = (sentAt: number, now: number): string => {
  const ago = now - sentAt;
  if (ago < MINUTE) return "방금";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}분 전`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}시간 전`;
  return `${Math.floor(ago / DAY)}일 전`;
};
