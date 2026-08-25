/**
 * client/src/features/todo/utils/todoDateValidation.ts를 그대로 포팅한 순수 함수.
 * 시작일시/마감일시의 선후 관계를 검사한다.
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
