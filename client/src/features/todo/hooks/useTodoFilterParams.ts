import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { TodoFilter, TodoPriority } from "@tododo/core/dist/todoFilter/index.js";

export type ListTab = "active" | "done";

// URL에 기록할 때의 정규화 순서
const PRIORITY_ORDER: readonly TodoPriority[] = ["high", "medium", "low"];

const parsePriorities = (raw: string | null): TodoPriority[] => {
  const set = new Set((raw ?? "").split(","));
  return PRIORITY_ORDER.filter((p) => set.has(p));
};

/**
 * 목록 화면의 검색어·우선순위·탭을 URL 쿼리(q, p, tab)로 보관한다.
 * 상세로 갔다가 뒤로 와도 복원되고, 갱신은 항상 replace라 히스토리를 쌓지 않는다.
 */
export const useTodoFilterParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawQuery = searchParams.get("q") ?? "";
  const rawPriorities = searchParams.get("p");
  const tab: ListTab = searchParams.get("tab") === "done" ? "done" : "active";

  const priorities = useMemo(() => parsePriorities(rawPriorities), [rawPriorities]);
  const filter: TodoFilter = useMemo(
    () => ({ query: rawQuery, priorities }),
    [rawQuery, priorities],
  );

  const setQuery = useCallback(
    (q: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (q.trim()) next.set("q", q);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const togglePriority = useCallback(
    (p: TodoPriority) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const current = new Set(parsePriorities(next.get("p")));
          if (current.has(p)) current.delete(p);
          else current.add(p);
          const value = PRIORITY_ORDER.filter((x) => current.has(x)).join(",");
          if (value) next.set("p", value);
          else next.delete("p");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setTab = useCallback(
    (t: ListTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (t === "done") next.set("tab", "done");
          else next.delete("tab");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { filter, tab, setQuery, togglePriority, setTab };
};
