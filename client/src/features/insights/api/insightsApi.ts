import { auth } from "@/shared/lib/firebase";
import { fetchAllUserTodos } from "@/features/todo/api";

/**
 * 통계용으로는 getTodos()와 달리 archived 필터를 걸지 않는다 — archived/
 * overdueArchived 문서는 삭제되지 않고 남아있으므로(startupMaintenance 참고)
 * 이 전체 이력이 있어야 완료율/스트릭 같은 지표를 제대로 계산할 수 있다.
 * 쿼리/매핑 자체는 todoApi.ts의 fetchAllUserTodos를 그대로 재사용한다 —
 * startupMaintenance가 쓰는 것과 동일한 로직을 여기서 다시 구현하면 한쪽만
 * 고쳐질 드리프트 위험이 있다.
 */
export const getAllTodosForStats = async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");

  return fetchAllUserTodos(uid);
};
