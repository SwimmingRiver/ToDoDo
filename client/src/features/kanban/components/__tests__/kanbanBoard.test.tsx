import { describe, it, expect, vi, beforeEach } from "vitest";
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
    useTodo: () => ({
      useGetTodos: { data: [makeTodo()], isLoading: false, isError: false },
      useUpdateTodo: { mutate: updateMutate },
      useReorderTodos: { mutate: reorderMutate },
    }),
  };
});

let capturedDragProps: {
  onUpdateTodo: (todo: Todo) => void;
  onReorderTodos: (updates: TodoReorderUpdate[]) => void;
} | null = null;

vi.mock("../../hooks/useKanbanDrag", () => ({
  useKanbanDrag: (props: {
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

const renderKanbanBoard = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
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
