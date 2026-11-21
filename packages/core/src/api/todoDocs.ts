import { collection, getDocs, query, where, type Firestore } from "firebase/firestore";
import type { Todo } from "../types/todo";

// todos 컬렉션 문서를 다루는 core 내부 공용 헬퍼. 예전에는 todoApi·seriesApi·
// startupMaintenanceApi·planTodoApi에 같은 코드가 각각 복사돼 있었다 — 한쪽만 고치면
// 경로마다 order 계산이나 문서 해석이 달라질 수 있어 한 곳으로 모았다.
// 패키지 공개 API(index.ts)에는 내보내지 않는다.

/** Firestore 문서를 Todo로 바꾼다(문서 id를 id 필드로). */
export const mapDocToTodo = (id: string, data: Record<string, unknown>): Todo =>
  ({ id, ...data }) as Todo;

/** 사용자의 루트(parentId === null) 할 일 중 다음에 쓸 order 값을 계산한다. */
export const getNextRootOrder = async (db: Firestore, userId: string): Promise<number> => {
  const rootTodosSnapshot = await getDocs(
    query(collection(db, "todos"), where("userId", "==", userId), where("parentId", "==", null)),
  );
  const maxOrder = rootTodosSnapshot.docs.reduce(
    (max, d) => Math.max(max, (d.data().order as number) ?? 0),
    -1,
  );
  return maxOrder + 1;
};
