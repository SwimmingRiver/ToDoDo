import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import { setupUser } from "@/test/setupUser";
import TodoListItem from "../todoListItem";
import type { Todo } from "../../../types";

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

// 이 컴포넌트는 리스트 행이라 useTodo() 전체가 아니라 useDeleteTodo/useUpdateTodo를
// 독립적으로 호출한다(CLAUDE.md 컨벤션) — mock도 그 구조를 그대로 반영한다.
vi.mock("../../../hooks", () => ({
  useDeleteTodo: () => ({ mutate: deleteMutate }),
  useUpdateTodo: () => ({ mutate: updateMutate }),
}));

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "user-1",
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

const renderItem = (props: Partial<Parameters<typeof TodoListItem>[0]> & { todo: Todo }) =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <TodoListItem onEdit={vi.fn()} {...props} />
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

describe("TodoListItem 기본 렌더링", () => {
  it("제목이 표시된다", () => {
    renderItem({ todo: makeTodo({ title: "장보기" }) });
    expect(screen.getByText("장보기")).toBeInTheDocument();
  });

  it("제목을 클릭하면 상세 페이지로 이동한다", async () => {
    const user = setupUser();
    renderItem({ todo: makeTodo({ id: "todo-42" }) });

    await user.click(screen.getByText("테스트 할 일"));

    expect(navigateSpy).toHaveBeenCalledWith("/todo/todo-42");
  });

  it("편집 버튼을 클릭하면 onEdit이 해당 todo와 함께 호출된다", async () => {
    const user = setupUser();
    const onEdit = vi.fn();
    const todo = makeTodo();
    renderItem({ todo, onEdit });

    await user.click(screen.getByLabelText("할 일 편집"));

    expect(onEdit).toHaveBeenCalledWith(todo);
  });
});

describe("TodoListItem 삭제", () => {
  it("삭제 버튼을 누르면 확인 모달이 뜨고, 확인해야 실제로 삭제된다", async () => {
    const user = setupUser();
    renderItem({ todo: makeTodo({ title: "지울 항목" }) });

    await user.click(screen.getByLabelText("할 일 삭제"));

    expect(
      screen.getByText('"지울 항목"을(를) 삭제하시겠습니까?'),
    ).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();

    await user.click(screen.getByText("삭제"));

    expect(deleteMutate).toHaveBeenCalledWith("todo-1", expect.any(Object));
    expect(await screen.findByText("삭제 완료")).toBeInTheDocument();
  });

  it("삭제를 취소하면 mutate가 호출되지 않는다", async () => {
    const user = setupUser();
    renderItem({ todo: makeTodo() });

    await user.click(screen.getByLabelText("할 일 삭제"));
    await user.click(screen.getByText("취소"));

    expect(
      screen.queryByText('"테스트 할 일"을(를) 삭제하시겠습니까?'),
    ).not.toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("삭제가 실패하면 실패 토스트를 보여준다", async () => {
    deleteMutate.mockImplementation((_id: string, options?: MutateOptions) => {
      options?.onError?.();
    });
    const user = setupUser();
    renderItem({ todo: makeTodo() });

    await user.click(screen.getByLabelText("할 일 삭제"));
    await user.click(screen.getByText("삭제"));

    expect(await screen.findByText("삭제 실패")).toBeInTheDocument();
  });
});

describe("TodoListItem 상태 변경", () => {
  it("완료로 변경하면 updateTodo가 호출되고 완료 토스트가 뜬다", async () => {
    const user = setupUser();
    renderItem({ todo: makeTodo({ status: "todo" }) });

    await user.click(screen.getByText("할 일"));
    await user.click(screen.getByText("완료"));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done" }),
      expect.any(Object),
    );
    expect(await screen.findByText("완료!")).toBeInTheDocument();
  });

  it("진행 중으로 변경하면 상태 변경 토스트가 뜬다", async () => {
    const user = setupUser();
    renderItem({ todo: makeTodo({ status: "todo" }) });

    await user.click(screen.getByText("할 일"));
    await user.click(screen.getByText("진행 중"));

    expect(await screen.findByText("상태 변경")).toBeInTheDocument();
    expect(
      screen.getByText('"테스트 할 일" → 진행 중'),
    ).toBeInTheDocument();
  });
});

describe("TodoListItem 하위 할 일", () => {
  it("최상위 항목에는 펼치기 버튼이 있지만 하위 항목에는 없다", () => {
    const rootRender = render(
      <ToastProvider>
        <MemoryRouter>
          <TodoListItem
            todo={makeTodo()}
            onEdit={vi.fn()}
            isChild={false}
            childTodos={[makeTodo({ id: "child-1", title: "하위 작업 1" })]}
          />
        </MemoryRouter>
      </ToastProvider>,
    );
    // 펼치기 버튼은 하위 항목 개수(1)를 라벨로 갖는다 — isChild이면 렌더되지 않는다.
    expect(rootRender.getByText("1")).toBeInTheDocument();
    rootRender.unmount();

    render(
      <ToastProvider>
        <MemoryRouter>
          <TodoListItem
            todo={makeTodo({ id: "todo-2" })}
            onEdit={vi.fn()}
            isChild={true}
          />
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("펼치면 하위 할 일 목록과 '새 하위 작업 추가' 버튼이 보인다", async () => {
    const user = setupUser();
    const child = makeTodo({ id: "child-1", title: "하위 작업 1" });
    renderItem({ todo: makeTodo(), childTodos: [child] });

    expect(screen.queryByText("하위 작업 1")).not.toBeInTheDocument();

    // 펼치기 버튼: 하위 항목 개수(1)를 라벨로 갖는다.
    await user.click(screen.getByText("1"));

    expect(screen.getByText("하위 작업 1")).toBeInTheDocument();
    expect(screen.getByText("새 하위 작업 추가")).toBeInTheDocument();
  });

  it("'새 하위 작업 추가' 클릭 시 onAddChild가 부모 id로 호출된다", async () => {
    const user = setupUser();
    const onAddChild = vi.fn();
    renderItem({
      todo: makeTodo({ id: "parent-1" }),
      childTodos: [],
      onAddChild,
    });

    // childTodos가 빈 배열이면 펼치기 버튼에는 카운트 라벨이 없다("").
    // 편집/삭제 버튼 다음에 오는 마지막 버튼이 펼치기 버튼이다.
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);
    await user.click(screen.getByText("새 하위 작업 추가"));

    expect(onAddChild).toHaveBeenCalledWith("parent-1");
  });
});

describe("TodoListItem 마감 배지", () => {
  const FIXED_NOW = new Date("2026-06-10T00:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("마감이 임박(3일 이내)하고 완료 전이면 D-day 배지가 보인다", () => {
    const dueAt = new Date(FIXED_NOW);
    dueAt.setDate(dueAt.getDate() + 2);
    renderItem({
      todo: makeTodo({ dueAt: dueAt.toISOString(), status: "doing" }),
    });

    expect(screen.getByText("D-2")).toBeInTheDocument();
  });

  it("완료된 항목은 마감이 임박해도 배지를 보여주지 않는다", () => {
    const dueAt = new Date(FIXED_NOW);
    dueAt.setDate(dueAt.getDate() + 1);
    renderItem({
      todo: makeTodo({ dueAt: dueAt.toISOString(), status: "done" }),
    });

    expect(screen.queryByText("D-1")).not.toBeInTheDocument();
  });

  it("마감이 많이 남았으면 배지를 보여주지 않는다", () => {
    const dueAt = new Date(FIXED_NOW);
    dueAt.setDate(dueAt.getDate() + 10);
    renderItem({
      todo: makeTodo({ dueAt: dueAt.toISOString(), status: "todo" }),
    });

    expect(screen.queryByText("D-10")).not.toBeInTheDocument();
  });
});
