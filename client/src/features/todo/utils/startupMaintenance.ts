import type { Todo } from "../types/todo.type";

/** 기존 문서의 일부 필드를 갱신하는 계획 항목. */
export type TodoFieldUpdate = { id: string; fields: Partial<Omit<Todo, "id">> };

/**
 * 루트 하나와 그 자식 전체. 배치가 쪼개지더라도 한 그룹은 반드시 같은 커밋에
 * 들어가야 한다 — 그룹을 쪼개면 한 프로젝트의 자식 일부만 archived되고 나머지는
 * 안 되는 상태가 생긴다. 이 제약을 주석이 아니라 타입으로 표현한다.
 */
export type ArchiveGroup = { updates: TodoFieldUpdate[] };

/**
 * done된 지 cutoffISO보다 오래된 루트 프로젝트와 그 자식에 archived를 세울 계획을 만든다.
 *
 * 이전에는 루트를 Firestore 쿼리로 고르고 자식을 루트마다 별도 쿼리(N+1)로 가져왔다.
 * 이제 전체 스냅샷 하나를 받아 parentId로 메모리에서 그룹핑하므로 추가 왕복이 없다.
 *
 * archived 판정에 `!== true`를 쓰는 이유: 이전 Firestore 조건
 * `where("archived", "==", false)`는 필드가 아예 없는 레거시 문서를 매칭하지 않았다.
 * todo.type.ts가 명시한 "없으면 archived 아닌 것으로 취급" 의미를 따르며, 이 문서들은
 * getTodos()에서 이미 보이지 않으므로 archived를 세워도 화면 변화가 없다.
 */
export const planArchivedSweep = (
  todos: Todo[],
  cutoffISO: string,
  now: string,
): ArchiveGroup[] => {
  const childrenByParentId = new Map<string, Todo[]>();
  for (const todo of todos) {
    if (!todo.parentId) continue;
    const siblings = childrenByParentId.get(todo.parentId) ?? [];
    siblings.push(todo);
    childrenByParentId.set(todo.parentId, siblings);
  }

  const groups: ArchiveGroup[] = [];
  for (const todo of todos) {
    if (todo.parentId !== null) continue;
    if (todo.status !== "done") continue;
    if (todo.archived === true) continue;
    if (!todo.doneAt) continue;
    if (todo.doneAt >= cutoffISO) continue;

    const members = [todo, ...(childrenByParentId.get(todo.id) ?? [])];
    groups.push({
      updates: members.map((m) => ({ id: m.id, fields: { archived: true, updatedAt: now } })),
    });
  }

  return groups;
};
