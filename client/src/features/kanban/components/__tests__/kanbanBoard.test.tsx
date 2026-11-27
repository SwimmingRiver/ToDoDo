import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import KanbanBoard from "../kanbanBoard";
import type { Todo, TodoReorderUpdate } from "@/features/todo";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: null },
  googleProvider: {},
}));

vi.mock("@/shared/lib/firestore", () => ({
  db: {},
}));

type MutateOptions = { onError?: () => void };

const updateMutate = vi.fn((_payload: Todo, options?: MutateOptions) => {
  options?.onError?.();
});
const reorderMutate = vi.fn(
  (_payload: TodoReorderUpdate[], options?: MutateOptions) => {
    options?.onError?.();
  },
);

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "test-user-id",
  title: "테스트 할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

let todosData: Todo[] = [makeTodo()];

// 실제 "@/features/todo" 배럴을 importOriginal로 가져오면 todoApi.ts의 모듈
// 최상단 `collection(db, "todos")` 호출까지 딸려와 mock db 객체로 인해 깨진다.
// collapseRecurringInstances는 firebase 의존 없는 순수 유틸이라 그 파일만 직접
// 가져와 재사용한다.
vi.mock("@/features/todo", async () => {
  const { collapseRecurringInstances } = await import(
    "../../../todo/utils/projectUtils"
  );
  return {
    collapseRecurringInstances,
    useGetTodos: () => ({ data: todosData, isLoading: false, isError: false }),
    useUpdateTodo: () => ({ mutate: updateMutate }),
    useReorderTodos: () => ({ mutate: reorderMutate }),
  };
});

let capturedDragProps: {
  isReorderLocked?: boolean;
  onUpdateTodo: (todo: Todo) => void;
  onReorderTodos: (updates: TodoReorderUpdate[]) => void;
} | null = null;

vi.mock("../../hooks/useKanbanDrag", () => ({
  useKanbanDrag: (props: {
    isReorderLocked?: boolean;
    onUpdateTodo: (todo: Todo) => void;
    onReorderTodos: (updates: TodoReorderUpdate[]) => void;
  }) => {
    capturedDragProps = props;
    return {
      sensors: [],
      activeId: null,
      activeTodo: undefined,
      handleDragStart: vi.fn(),
      handleDragEnd: vi.fn(),
    };
  },
}));

const isTabletMock = vi.fn(() => false);
vi.mock("@/shared/hooks/useMediaQuery", () => ({
  default: () => isTabletMock(),
}));

const columnCalls: Array<Record<string, unknown>> = [];
vi.mock("../kanbanColumn", () => ({
  default: (props: Record<string, unknown>) => {
    columnCalls.push(props);
    return null;
  },
}));

const renderKanbanBoard = (url = "/kanban") =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[url]}>
        <KanbanBoard />
      </MemoryRouter>
    </ToastProvider>,
  );

describe("KanbanBoard 뮤테이션 실패 토스트", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedDragProps = null;
    columnCalls.length = 0;
    isTabletMock.mockReturnValue(false);
    todosData = [makeTodo()];
  });

  it("컬럼 간 드래그로 상태 변경이 실패하면 에러 토스트를 보여준다", () => {
    renderKanbanBoard();

    act(() => {
      capturedDragProps!.onUpdateTodo(makeTodo({ status: "doing" }));
    });

    expect(updateMutate).toHaveBeenCalled();
    expect(screen.getByText("상태 변경 실패")).toBeInTheDocument();
    expect(
      screen.getByText("할 일 상태 변경 중 오류가 발생했습니다"),
    ).toBeInTheDocument();
  });

  it("같은 컬럼 내 재정렬이 실패하면 에러 토스트를 보여준다", () => {
    renderKanbanBoard();

    act(() => {
      capturedDragProps!.onReorderTodos([{ id: "todo-1", order: 1 }]);
    });

    expect(reorderMutate).toHaveBeenCalled();
    expect(screen.getByText("순서 변경 실패")).toBeInTheDocument();
    expect(
      screen.getByText("할 일 순서 변경 중 오류가 발생했습니다"),
    ).toBeInTheDocument();
  });

  it("모바일 액션시트에서 상태 변경이 실패하면 에러 토스트를 보여준다", () => {
    isTabletMock.mockReturnValue(true);
    renderKanbanBoard();

    const onStatusChange = columnCalls[columnCalls.length - 1]
      .onStatusChange as (todo: Todo, status: Todo["status"]) => void;

    act(() => {
      onStatusChange(makeTodo(), "doing");
    });

    expect(updateMutate).toHaveBeenCalled();
    expect(screen.getByText("상태 변경 실패")).toBeInTheDocument();
    expect(
      screen.getByText("할 일 상태 변경 중 오류가 발생했습니다"),
    ).toBeInTheDocument();
  });
});

describe("KanbanBoard 검색·우선순위 필터", () => {
  const titlesOf = (status: string) => {
    const call = [...columnCalls].reverse().find((c) => c.status === status);
    return (call?.todos as Todo[]).map((t) => t.title);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedDragProps = null;
    columnCalls.length = 0;
    isTabletMock.mockReturnValue(false);
    todosData = [
      makeTodo({ id: "a", title: "보고서 작성", status: "todo", priority: "high", order: 0 }),
      makeTodo({ id: "b", title: "장보기", status: "todo", priority: "low", order: 1 }),
      makeTodo({ id: "c", title: "보고서 검토", status: "doing", priority: "medium", order: 0 }),
      makeTodo({ id: "d", title: "청소", status: "doing", priority: "high", order: 1 }),
      makeTodo({ id: "e", title: "월간 보고서", status: "done", priority: "low", order: 0, doneAt: "2026-06-14T00:00:00.000Z" }),
    ];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 14, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("필터가 꺼져 있으면 모든 카드가 보이고 재정렬 잠금이 꺼져 있다", () => {
    renderKanbanBoard();
    expect(titlesOf("todo")).toEqual(["보고서 작성", "장보기"]);
    expect(titlesOf("doing")).toEqual(["보고서 검토", "청소"]);
    expect(titlesOf("done")).toEqual(["월간 보고서"]);
    expect(capturedDragProps!.isReorderLocked).toBe(false);
  });

  it("검색어는 세 열 모두에서 걸린 카드만 남기고 재정렬을 잠근다", () => {
    renderKanbanBoard("/kanban?q=" + encodeURIComponent("보고서"));
    expect(titlesOf("todo")).toEqual(["보고서 작성"]);
    expect(titlesOf("doing")).toEqual(["보고서 검토"]);
    expect(titlesOf("done")).toEqual(["월간 보고서"]);
    expect(capturedDragProps!.isReorderLocked).toBe(true);
  });

  it("우선순위 칩은 해당 우선순위만 남긴다", () => {
    renderKanbanBoard("/kanban?p=high");
    expect(titlesOf("todo")).toEqual(["보고서 작성"]);
    expect(titlesOf("doing")).toEqual(["청소"]);
    expect(titlesOf("done")).toEqual([]);
  });

  it("모바일 탭 카운트는 걸러진 수를 보여준다", () => {
    isTabletMock.mockReturnValue(true);
    renderKanbanBoard("/kanban?q=" + encodeURIComponent("보고서"));
    expect(screen.getByRole("button", { name: /To Do \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Doing \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done \(1\)/ })).toBeInTheDocument();
  });
});
