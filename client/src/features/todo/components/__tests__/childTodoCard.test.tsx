import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import { setupUser } from "@/test/setupUser";
import ChildTodoCard from "../childTodoCard";
import type { Todo } from "../../types";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: null },
  googleProvider: {},
}));

vi.mock("@/shared/lib/firestore", () => ({
  db: {},
}));

const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

type MutateOptions = { onSuccess?: () => void; onError?: () => void };

const deleteMutate = vi.fn();
const updateMutate = vi.fn();

// childTodoCard는 리스트 행처럼 반복 렌더링되는 컴포넌트라 useTodo() 전체가 아니라
// useDeleteTodo/useUpdateTodo를 독립적으로 호출한다(CLAUDE.md 컨벤션).
vi.mock("../../hooks", () => ({
  useDeleteTodo: () => ({ mutate: deleteMutate }),
  useUpdateTodo: () => ({ mutate: updateMutate }),
}));

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "child-1",
  userId: "user-1",
  title: "하위 할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: "parent-1",
  order: 0,
  recurrence: null,
  recurrenceId: null,
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

const renderCard = (todo: Todo, onEdit = vi.fn()) =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <ChildTodoCard todo={todo} onEdit={onEdit} />
      </MemoryRouter>
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  deleteMutate.mockImplementation((_id: string, options?: MutateOptions) => {
    options?.onSuccess?.();
  });
  updateMutate.mockImplementation(
    (_payload: Todo, options?: MutateOptions) => {
      options?.onSuccess?.();
    },
  );
});

describe("ChildTodoCard 기본 렌더링", () => {
  it("제목이 표시된다", () => {
    renderCard(makeTodo({ title: "장보기" }));
    expect(screen.getByText("장보기")).toBeInTheDocument();
  });

  it("제목을 클릭하면 상세 페이지로 이동한다", async () => {
    const user = setupUser();
    renderCard(makeTodo({ id: "child-42" }));

    await user.click(screen.getByText("하위 할 일"));

    expect(navigateSpy).toHaveBeenCalledWith("/todo/child-42");
  });

  it("편집 버튼을 클릭하면 onEdit이 해당 todo와 함께 호출된다", async () => {
    const user = setupUser();
    const onEdit = vi.fn();
    const todo = makeTodo();
    renderCard(todo, onEdit);

    await user.click(screen.getByLabelText("할 일 편집"));

    expect(onEdit).toHaveBeenCalledWith(todo);
  });
});

describe("ChildTodoCard 삭제", () => {
  it("삭제 버튼을 누르면 확인 모달이 뜨고, 확인해야 실제로 삭제된다", async () => {
    const user = setupUser();
    renderCard(makeTodo({ title: "지울 항목" }));

    await user.click(screen.getByLabelText("할 일 삭제"));
    expect(
      screen.getByText('"지울 항목"을(를) 삭제하시겠습니까?'),
    ).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();

    await user.click(screen.getByText("삭제"));

    expect(deleteMutate).toHaveBeenCalledWith("child-1", expect.any(Object));
    expect(await screen.findByText("삭제 완료")).toBeInTheDocument();
  });

  it("삭제가 실패하면 실패 토스트를 보여준다", async () => {
    deleteMutate.mockImplementation((_id: string, options?: MutateOptions) => {
      options?.onError?.();
    });
    const user = setupUser();
    renderCard(makeTodo());

    await user.click(screen.getByLabelText("할 일 삭제"));
    await user.click(screen.getByText("삭제"));

    expect(await screen.findByText("삭제 실패")).toBeInTheDocument();
  });
});

describe("ChildTodoCard 상태 변경", () => {
  it("상태 점을 클릭하면 인라인 상태 목록이 열린다", async () => {
    const user = setupUser();
    renderCard(makeTodo({ status: "todo" }));

    expect(screen.queryByText("진행 중")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("상태 변경"));

    expect(screen.getByText("진행 중")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
  });

  it("상태를 선택하면 updateTodo가 호출되고 성공 토스트가 뜬 뒤 목록이 닫힌다", async () => {
    const user = setupUser();
    renderCard(makeTodo({ status: "todo" }));

    await user.click(screen.getByLabelText("상태 변경"));
    await user.click(screen.getByText("완료"));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done" }),
      expect.any(Object),
    );
    expect(await screen.findByText("상태 변경")).toBeInTheDocument();
    expect(screen.queryByText("진행 중")).not.toBeInTheDocument();
  });

  it("상태 변경이 실패하면 실패 토스트를 보여준다", async () => {
    updateMutate.mockImplementation(
      (_payload: Todo, options?: MutateOptions) => {
        options?.onError?.();
      },
    );
    const user = setupUser();
    renderCard(makeTodo({ status: "todo" }));

    await user.click(screen.getByLabelText("상태 변경"));
    await user.click(screen.getByText("완료"));

    expect(await screen.findByText("변경 실패")).toBeInTheDocument();
  });
});
