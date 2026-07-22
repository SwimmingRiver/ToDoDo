import { useCallback, useMemo, useState } from "react";
import type { Todo } from "@/features/todo/types";

/**
 * 게스트 체험용 시드 데이터. 모두 dueAt: null이라 배지/시간 표시 없이 깔끔하게 렌더된다.
 * 이 훅은 완전히 독립된 로컬 상태로, 실제 useTodo/useTodayTodos(Firebase 의존)를
 * 절대 import하지 않는다 — 실 서비스 데이터 경로와 섞이지 않아야 한다는 요구사항.
 */
const seedGuestTodos = (): Todo[] => {
  const now = new Date().toISOString();

  const base: Omit<Todo, "id" | "title" | "status" | "order" | "doneAt"> = {
    userId: "guest",
    priority: "medium",
    startAt: null,
    dueAt: null,
    parentId: null,
    recurrence: null,
    recurrenceId: null,
    createdAt: now,
    updatedAt: now,
  };

  return [
    { ...base, id: "guest-0", title: "ToDoDo 둘러보기", status: "done", order: 0, doneAt: now },
    { ...base, id: "guest-1", title: "할 일 추가해보기", status: "todo", order: 1, doneAt: null },
    { ...base, id: "guest-2", title: "완료 체크해보기", status: "todo", order: 2, doneAt: null },
  ];
};

interface UseGuestTodosResult {
  todos: Todo[];
  inProgressTodos: Todo[];
  doneTodos: Todo[];
  doneCount: number;
  totalCount: number;
  addTodo: (title: string) => void;
  toggleDone: (todo: Todo) => void;
  deleteTodo: (todo: Todo) => void;
}

/**
 * 게스트 체험 모드용 순수 로컬 상태 훅. useState로만 관리하며 localStorage/sessionStorage
 * 등 영속화 로직을 절대 추가하지 않는다 — 새로고침 시 완전 초기화가 요구사항이다.
 */
export const useGuestTodos = (): UseGuestTodosResult => {
  const [todos, setTodos] = useState<Todo[]>(() => seedGuestTodos());

  const addTodo = useCallback((title: string) => {
    const trimmed = title.trim();
    if (trimmed === "") return;

    const now = new Date().toISOString();
    setTodos((prev) => [
      {
        id: `guest-${crypto.randomUUID()}`,
        userId: "guest",
        title: trimmed,
        status: "todo",
        priority: "medium",
        startAt: null,
        dueAt: null,
        doneAt: null,
        parentId: null,
        order: prev.length,
        recurrence: null,
        recurrenceId: null,
        createdAt: now,
        updatedAt: now,
      },
      ...prev,
    ]);
  }, []);

  // 기존 useTodayTodos.toggleDone과 동일한 로직(상태 토글 + doneAt 세팅/해제)을 로컬 배열에 적용.
  const toggleDone = useCallback((todo: Todo) => {
    setTodos((prev) =>
      prev.map((item) => {
        if (item.id !== todo.id) return item;
        const isDone = item.status === "done";
        return {
          ...item,
          status: isDone ? "todo" : "done",
          doneAt: isDone ? null : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }, []);

  const deleteTodo = useCallback((todo: Todo) => {
    setTodos((prev) => prev.filter((item) => item.id !== todo.id));
  }, []);

  const inProgressTodos = useMemo(
    () => todos.filter((todo) => todo.status !== "done"),
    [todos],
  );

  const doneTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.status === "done")
        .sort((a, b) => {
          const aTime = a.doneAt ? new Date(a.doneAt).getTime() : 0;
          const bTime = b.doneAt ? new Date(b.doneAt).getTime() : 0;
          return bTime - aTime;
        }),
    [todos],
  );

  return {
    todos,
    inProgressTodos,
    doneTodos,
    doneCount: doneTodos.length,
    totalCount: todos.length,
    addTodo,
    toggleDone,
    deleteTodo,
  };
};

export type { UseGuestTodosResult };
