import {
  isTodoFilterActive,
  matchesTodoFilter,
  type TodoFilter,
} from "@tododo/core/dist/todoFilter/index.js";
import type { Todo } from "../types";
import { collapseRecurringInstances } from "./projectUtils";

export interface ActiveSearchResult {
  /** 화면에 낼 루트(프로젝트 카드) — 원래 순서 유지 */
  roots: Todo[];
  /** 필터에 걸린 하위 할 일 id */
  matchedChildIds: ReadonlySet<string>;
  /** 루트는 안 걸리고 하위만 걸려서 자동으로 펼칠 루트 id */
  autoExpandIds: ReadonlySet<string>;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * `진행 중` 목록의 검색·우선순위 필터 결과를 이미 받아온 todos에서 만든다
 * (Firestore를 다시 읽지 않는다).
 *
 * 루트 후보는 지금 목록과 같은 규칙(루트 && 미완료 → 반복 시리즈당 대표 1건)이고,
 * 판정은 할 일 단위지만 표시는 카드 단위다: 루트가 걸렸거나 그 하위가 하나라도
 * 걸리면 카드를 낸다. 하위를 따로 카드로 내지 않으므로 중복 표시가 없다.
 */
export function buildActiveSearchResult(
  todos: Todo[],
  filter: TodoFilter,
): ActiveSearchResult {
  const candidates = collapseRecurringInstances(
    todos.filter((todo) => todo.parentId === null && todo.status !== "done"),
  );

  if (!isTodoFilterActive(filter)) {
    return { roots: candidates, matchedChildIds: EMPTY_SET, autoExpandIds: EMPTY_SET };
  }

  const childrenByParent = new Map<string, Todo[]>();
  for (const todo of todos) {
    if (todo.parentId === null) continue;
    const list = childrenByParent.get(todo.parentId);
    if (list) list.push(todo);
    else childrenByParent.set(todo.parentId, [todo]);
  }

  const roots: Todo[] = [];
  const matchedChildIds = new Set<string>();
  const autoExpandIds = new Set<string>();

  for (const root of candidates) {
    const rootMatched = matchesTodoFilter(root, filter);
    let childMatched = false;
    for (const child of childrenByParent.get(root.id) ?? []) {
      if (matchesTodoFilter(child, filter)) {
        matchedChildIds.add(child.id);
        childMatched = true;
      }
    }
    if (!rootMatched && !childMatched) continue;
    roots.push(root);
    if (!rootMatched) autoExpandIds.add(root.id);
  }

  return { roots, matchedChildIds, autoExpandIds };
}
