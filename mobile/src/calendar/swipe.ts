/** 이 거리(pt) 이상 가로로 밀어야 주를 넘긴다 — 줄 탭·세로 움직임과 구분한다. */
export const SWIPE_MIN_DISTANCE = 50;

/** 왼쪽으로 밀면 1(다음 주), 오른쪽이면 -1(이전 주), 짧거나 세로가 더 크면 0. */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}
