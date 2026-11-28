/**
 * 주간 하루 줄에 보일 칩 개수. chipBottoms는 칩 컨테이너 기준 각 칩의 아래 끝(y + height),
 * containerHeight는 컨테이너 높이다. 들어가는 만큼 보인다. `+n`은 칩 흐름 밖, 오른쪽에 비워 둔
 * 자리에 고정되므로 칩 자리를 빼지 않는다(전엔 1개를 빼서 +n을 흐름에 넣었는데, 큰 글씨로
 * 한 줄에 칩 하나만 들어가면 +n이 다음 줄로 감겨 잘렸다). 줄이 아주 낮아도 칩 1개는 보인다.
 */
export function countVisibleChips(chipBottoms: number[], containerHeight: number): number {
  if (chipBottoms.length === 0) return 0;
  const fitting = chipBottoms.filter((bottom) => bottom <= containerHeight).length;
  return Math.max(1, fitting);
}
