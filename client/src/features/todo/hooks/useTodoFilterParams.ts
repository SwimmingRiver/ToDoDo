import { useCallback, useMemo, useRef } from "react";
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

  // 세터 참조를 고정한 채로 지금 주소를 읽기 위한 ref(세터는 TodoSearch의 디바운스
  // effect 의존성으로 들어가므로 URL이 바뀔 때마다 새로 만들면 안 된다).
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  /**
   * 주소를 바꾼다. 결과가 지금 주소와 같으면 아무것도 하지 않는다: react-router는 같은
   * 주소로 replace해도 새 location을 만들어 구독 컴포넌트를 다시 렌더하므로, 디바운스
   * effect와 맞물리면 300ms마다 내비게이션이 끝없이 반복될 수 있다(어느 호출부든).
   */
  const updateParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const current = new URLSearchParams(searchParamsRef.current);
      mutate(current);
      if (current.toString() === searchParamsRef.current.toString()) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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
      updateParams((next) => {
        if (q.trim()) next.set("q", q);
        else next.delete("q");
      });
    },
    [updateParams],
  );

  const togglePriority = useCallback(
    (p: TodoPriority) => {
      updateParams((next) => {
        const current = new Set(parsePriorities(next.get("p")));
        if (current.has(p)) current.delete(p);
        else current.add(p);
        const value = PRIORITY_ORDER.filter((x) => current.has(x)).join(",");
        if (value) next.set("p", value);
        else next.delete("p");
      });
    },
    [updateParams],
  );

  const setTab = useCallback(
    (t: ListTab) => {
      updateParams((next) => {
        if (t === "done") next.set("tab", "done");
        else next.delete("tab");
      });
    },
    [updateParams],
  );

  /** 검색어와 우선순위를 한 번에 지운다(탭과 다른 키는 그대로). */
  const resetFilter = useCallback(() => {
    updateParams((next) => {
      next.delete("q");
      next.delete("p");
    });
  }, [updateParams]);

  return { filter, tab, setQuery, togglePriority, setTab, resetFilter };
};
