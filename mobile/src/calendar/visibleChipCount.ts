/**
 * 주간 하루 줄에 보일 칩 개수. chipBottoms는 칩 컨테이너 기준 각 칩의 아래 끝(y + height),
 * containerHeight는 컨테이너 높이다. 다 들어가면 전부, 넘치면 들어가는 개수에서 `+n` 자리
 * 1개를 뺀다. 줄이 아주 낮아도 칩 1개는 보인다(작은 기기에서 최소 1개 + `+n`).
 */
export function countVisibleChips(chipBottoms: number[], containerHeight: number): number {
  if (chipBottoms.length === 0) return 0;
  const fitting = chipBottoms.filter((bottom) => bottom <= containerHeight).length;
  if (fitting === chipBottoms.length) return fitting;
  return Math.max(1, fitting - 1);
}
