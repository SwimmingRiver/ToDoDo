import type { Todo } from "../types/todo.type";

/**
 * 상태 전환에 따른 doneAt(완료 시각) 규칙. 통계의 완료 추이·스트릭·기한 준수율은 doneAt으로 센다.
 *
 * 화면(칸반 드래그, 카드 상태 시트, 상세 폼 등)은 `{ ...todo, status }`만 넘기므로, 완료 시각은
 * 호출부가 아니라 저장 계층이 정한다. 예전엔 호출부마다 doneAt을 채워야 해서 오늘 화면 체크만
 * 기록하고 나머지 경로는 빠뜨렸다(11-23 운영 점검: done 117건 중 64건 doneAt 없음).
 *
 * - 완료가 아닌 상태 → null (완료 취소 후 다시 완료하면 새 시각으로 찍히게)
 * - 새로 완료 → now
 * - 이미 완료 → 처음 완료 시각 유지. doneAt이 없는 옛 문서는 지금 시각을 지어내지 않고 null
 *   (그 문서의 실제 완료일은 알 수 없다 — 백필 스크립트가 updatedAt으로 따로 채운다)
 */
export const resolveDoneAt = (
  previous: { status?: unknown; doneAt?: unknown } | undefined,
  nextStatus: Todo["status"],
  now: string,
): string | null => {
  if (nextStatus !== "done") return null;
  if (previous?.status !== "done") return now;
  return typeof previous.doneAt === "string" && previous.doneAt !== "" ? previous.doneAt : null;
};
