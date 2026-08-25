/**
 * 시작일시/마감일시의 선후 관계를 검사한다. 반복(recurrence) 여부와 무관하게 항상
 * 적용되는 일반 규칙이라 recurrenceValidation.ts와 분리했다 — 그쪽은 반복이 켜져
 * 있을 때만 날짜(일 단위)를 비교하지만, 이 함수는 비반복 할 일에도 항상 적용되고
 * 시각까지 비교한다.
 */
export function getTodoDateValidationError(
  startAt: string | null,
  dueAt: string | null,
): string | null {
  if (!startAt || !dueAt) return null;

  const start = new Date(startAt);
  const due = new Date(dueAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime())) return null;

  if (start.getTime() > due.getTime()) {
    return "시작일시는 마감일시보다 늦을 수 없습니다";
  }

  return null;
}
