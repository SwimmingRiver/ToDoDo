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

  // 가장 최근에 "의도한" 주소. react-router의 setSearchParams(prev => …)는 prev로 진짜
  // 대기 중인 값이 아니라 마지막 렌더의 searchParams를 주므로, 같은 틱에 두 번 부르면
  // 뒤 호출이 앞 호출을 덮어쓴다(예: resetFilter 직후 onClear의 setQuery("")가 p를 되살림).
  // 그래서 세터는 이 ref를 기준으로 다음 주소를 계산하고, URL이 실제로 바뀌면(뒤로 가기 등
  // 바깥 이동 포함) 렌더 때 다시 맞춘다. 세터 참조는 고정되지 않는다: react-router의
  // setSearchParams가 [navigate, searchParams]에 묶인 useCallback이라 location.search가
  // 바뀔 때마다 updateParams와 모든 세터도 새로 만들어진다. 디바운스 반복을 실제로 끊는 건
  // 아래 updateParams의 "주소가 그대로면 return" 가드다.
  const latestRef = useRef(searchParams);
  const seenRef = useRef(searchParams);
  if (seenRef.current !== searchParams) {
    seenRef.current = searchParams;
    latestRef.current = searchParams;
  }

  /**
   * 주소를 바꾼다. 결과가 지금 주소와 같으면 아무것도 하지 않는다: react-router는 같은
   * 주소로 replace해도 새 location을 만들어 구독 컴포넌트를 다시 렌더하므로, 디바운스
   * effect와 맞물리면 300ms마다 내비게이션이 끝없이 반복될 수 있다(어느 호출부든).
   */
  const updateParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const base = latestRef.current;
      const next = new URLSearchParams(base);
      mutate(next);
      if (next.toString() === base.toString()) return;
      latestRef.current = next;
      setSearchParams(next, { replace: true });
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
