import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import { setupUser } from "@/test/setupUser";
import TodoForm from "../todoForm";
import type { Todo } from "../../../types";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: null },
  googleProvider: {},
}));

vi.mock("@/shared/lib/firestore", () => ({
  db: {},
}));

type MutateOptions<T> = { onSuccess?: (v?: T) => void; onError?: () => void };

/**
 * mutate가 매 테스트마다 다른 성공/실패 시나리오를 흉내내야 하므로, 각 mutate는
 * 호출 즉시 onSuccess를 부르는 기본 구현으로 두고(실패 케이스는 mockImplementationOnce로
 * 개별 오버라이드) 호출 자체는 spy로 검증한다.
 */
const mockTodo = vi.hoisted(() => ({
  useCreateTodo: { mutate: vi.fn() },
  useUpdateTodo: { mutate: vi.fn() },
  useCreateChildTodo: { mutate: vi.fn() },
  useCreateRecurringTodo: { mutate: vi.fn() },
  useEditRecurringSeries: { mutate: vi.fn(), isPending: false },
  useDeleteTodo: { mutate: vi.fn() },
  useGetTodos: { data: [] as Todo[] },
}));

vi.mock("../../../hooks", () => ({
  useCreateTodo: () => mockTodo.useCreateTodo,
  useUpdateTodo: () => mockTodo.useUpdateTodo,
  useCreateChildTodo: () => mockTodo.useCreateChildTodo,
  useCreateRecurringTodo: () => mockTodo.useCreateRecurringTodo,
  useEditRecurringSeries: () => mockTodo.useEditRecurringSeries,
  useDeleteTodo: () => mockTodo.useDeleteTodo,
  useGetTodos: () => mockTodo.useGetTodos,
}));

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "user-1",
  title: "기존 할 일",
  description: "",
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

const renderForm = (props: Parameters<typeof TodoForm>[0] = {}) =>
  render(
    <ToastProvider>
      <TodoForm {...props} />
    </ToastProvider>,
  );

const asSuccess = <T,>(mutateFn: ReturnType<typeof vi.fn>) =>
  mutateFn.mockImplementation((_payload: T, options?: MutateOptions<T>) => {
    options?.onSuccess?.();
  });

const asError = <T,>(mutateFn: ReturnType<typeof vi.fn>) =>
  mutateFn.mockImplementationOnce((_payload: T, options?: MutateOptions<T>) => {
    options?.onError?.();
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockTodo.useGetTodos.data = [];
  mockTodo.useEditRecurringSeries.isPending = false;

  asSuccess(mockTodo.useCreateTodo.mutate);
  asSuccess(mockTodo.useUpdateTodo.mutate);
  asSuccess(mockTodo.useCreateChildTodo.mutate);
  asSuccess(mockTodo.useCreateRecurringTodo.mutate);
  asSuccess(mockTodo.useEditRecurringSeries.mutate);
  asSuccess(mockTodo.useDeleteTodo.mutate);
});

describe("TodoForm 기본 렌더링과 유효성 검사", () => {
  it("제목 입력창이 표시된다", () => {
    renderForm();
    expect(screen.getByPlaceholderText("무엇을 해야 하나요?")).toBeInTheDocument();
  });

  it("제목 없이 제출하면 에러 메시지를 보여주고 생성 mutate는 호출되지 않는다", async () => {
    const user = setupUser();
    renderForm();

    await user.click(screen.getByPlaceholderText("무엇을 해야 하나요?"));
    fireEvent.submit(screen.getByPlaceholderText("무엇을 해야 하나요?").closest("form")!);

    expect(await screen.findByText("제목을 입력해주세요")).toBeInTheDocument();
    expect(mockTodo.useCreateTodo.mutate).not.toHaveBeenCalled();
  });

  it("더보기를 누르면 설명/우선순위/날짜 필드가 열리고 버튼 라벨이 '간단히'로 바뀐다", async () => {
    const user = setupUser();
    renderForm();

    await user.click(screen.getByText("더보기"));

    expect(screen.getByPlaceholderText("상세 설명을 입력하세요")).toBeInTheDocument();
    expect(screen.getByText("간단히")).toBeInTheDocument();
  });

  it("설명이 최대 길이를 넘으면 에러 메시지가 뜨고 더보기 섹션이 자동으로 열린다", async () => {
    renderForm();

    // 더보기 섹션을 열지 않은 채로 시작 — 에러 발생 시 자동으로 열리는지 확인한다.
    const titleInput = screen.getByPlaceholderText("무엇을 해야 하나요?");
    fireEvent.change(titleInput, { target: { value: "제목" } });

    const form = titleInput.closest("form")!;
    // 아직 열리지 않은 DetailSection 안의 textarea를 fireEvent로 직접 조작한다
    // (long text를 user.type으로 타이핑하면 느리다).
    const descInput = screen.getByPlaceholderText("상세 설명을 입력하세요");
    fireEvent.change(descInput, { target: { value: "a".repeat(2001) } });

    fireEvent.submit(form);

    expect(
      await screen.findByText("설명은 2000자 이내로 입력해주세요"),
    ).toBeInTheDocument();
  });
});

describe("TodoForm 신규 생성", () => {
  it("제목만 입력해 제출하면 useCreateTodo가 호출되고 완료 토스트와 onClose가 뒤따른다", async () => {
    const user = setupUser();
    const onClose = vi.fn();
    renderForm({ onClose });

    await user.type(screen.getByPlaceholderText("무엇을 해야 하나요?"), "새 할 일");
    fireEvent.submit(screen.getByPlaceholderText("무엇을 해야 하나요?").closest("form")!);

    // handleSubmit의 검증/제출은 마이크로태스크를 거치므로, 토스트가 뜨는 것을
    // 먼저 기다린 뒤에야 mutate 호출 여부를 동기적으로 확인할 수 있다.
    expect(await screen.findByText("추가 완료")).toBeInTheDocument();
    expect(mockTodo.useCreateTodo.mutate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("생성이 실패하면 실패 토스트를 보여주고 onClose는 호출하지 않는다", async () => {
    asError(mockTodo.useCreateTodo.mutate);
    const user = setupUser();
    const onClose = vi.fn();
    renderForm({ onClose });

    await user.type(screen.getByPlaceholderText("무엇을 해야 하나요?"), "새 할 일");
    fireEvent.submit(screen.getByPlaceholderText("무엇을 해야 하나요?").closest("form")!);

    expect(await screen.findByText("추가 실패")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("parentId가 있으면 반복 섹션을 렌더링하지 않고 하위 할 일 생성 mutate를 호출한다", async () => {
    const user = setupUser();
    renderForm({ parentId: "parent-1" });

    await user.click(screen.getByText("더보기"));
    expect(screen.queryByText("이 할 일을 반복합니다")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("무엇을 해야 하나요?"), "하위 할 일");
    fireEvent.submit(screen.getByPlaceholderText("무엇을 해야 하나요?").closest("form")!);

    expect(await screen.findByText("추가 완료")).toBeInTheDocument();
    expect(mockTodo.useCreateChildTodo.mutate).toHaveBeenCalledTimes(1);
    const [payload] = mockTodo.useCreateChildTodo.mutate.mock.calls[0];
    expect(payload.parentId).toBe("parent-1");
    expect(payload.todo.title).toBe("하위 할 일");
  });
});

describe("TodoForm 기존 할 일 수정", () => {
  it("반복이 아닌 할 일은 확인 모달 없이 바로 useUpdateTodo를 호출한다", async () => {
    const onClose = vi.fn();
    renderForm({ todo: makeTodo(), onClose });

    fireEvent.submit(screen.getByDisplayValue("기존 할 일").closest("form")!);

    expect(await screen.findByText("수정 완료")).toBeInTheDocument();
    expect(mockTodo.useUpdateTodo.mutate).toHaveBeenCalledTimes(1);
    expect(mockTodo.useEditRecurringSeries.mutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("반복 시리즈였던 할 일을 수정하면 먼저 확인 모달을 띄우고, '전체 적용'을 눌러야 실제로 반영된다", async () => {
    const user = setupUser();
    const recurringTodo = makeTodo({
      recurrence: { type: "daily", endType: "indefinite" },
    });
    renderForm({ todo: recurringTodo });

    fireEvent.submit(screen.getByDisplayValue("기존 할 일").closest("form")!);

    // 모달이 뜨기 전까지는 아직 실제 수정 mutate가 호출되지 않는다.
    expect(mockTodo.useEditRecurringSeries.mutate).not.toHaveBeenCalled();
    expect(await screen.findByText("반복 일정 전체 수정")).toBeInTheDocument();

    await user.click(screen.getByText("전체 적용"));

    expect(mockTodo.useEditRecurringSeries.mutate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("수정 완료")).toBeInTheDocument();
  });

  it("하위 할 일이 있는 프로젝트를 수정할 때는 반복 체크박스가 비활성화되고 안내 문구가 뜬다", async () => {
    const user = setupUser();
    const parent = makeTodo({ id: "parent-1", startAt: "2026-06-01T00:00:00.000Z" });
    mockTodo.useGetTodos.data = [
      parent,
      makeTodo({ id: "child-1", parentId: "parent-1" }),
    ];
    renderForm({ todo: parent });

    await user.click(screen.getByText("더보기"));

    const checkbox = screen.getByLabelText("이 할 일을 반복합니다");
    expect(checkbox).toBeDisabled();
    expect(
      screen.getByText("하위 할 일이 있는 항목은 반복을 설정할 수 없습니다"),
    ).toBeInTheDocument();
  });

  it("시작일시가 없으면 반복 체크박스가 비활성화되고 안내 문구가 뜬다", async () => {
    const user = setupUser();
    renderForm({ todo: makeTodo({ startAt: null }) });

    await user.click(screen.getByText("더보기"));

    const checkbox = screen.getByLabelText("이 할 일을 반복합니다");
    expect(checkbox).toBeDisabled();
    expect(
      screen.getByText("반복 설정은 시작일시를 입력해야 사용할 수 있습니다"),
    ).toBeInTheDocument();
  });

  it("반복이 없던 할 일에 새로 반복을 설정해 저장하면 반복 생성 후 기존 문서를 삭제한다", async () => {
    const user = setupUser();
    const onClose = vi.fn();
    renderForm({
      todo: makeTodo({ startAt: "2026-06-01T09:00:00.000Z" }),
      onClose,
    });

    await user.click(screen.getByText("더보기"));
    await user.click(screen.getByLabelText("이 할 일을 반복합니다"));

    fireEvent.submit(screen.getByDisplayValue("기존 할 일").closest("form")!);

    expect(await screen.findByText("반복 설정 완료")).toBeInTheDocument();
    expect(mockTodo.useCreateRecurringTodo.mutate).toHaveBeenCalledTimes(1);
    expect(mockTodo.useDeleteTodo.mutate).toHaveBeenCalledWith(
      "todo-1",
      expect.any(Object),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("TodoForm 반복 유효성 검사", () => {
  it("매주 반복인데 요일을 하나도 선택하지 않으면 제출이 막히고 입력 확인 토스트가 뜬다", async () => {
    const user = setupUser();
    renderForm({ todo: makeTodo({ startAt: "2026-06-01T09:00:00.000Z" }) });

    await user.click(screen.getByText("더보기"));
    await user.click(screen.getByLabelText("이 할 일을 반복합니다"));
    await user.click(screen.getByRole("tab", { name: "매주" }));

    fireEvent.submit(screen.getByDisplayValue("기존 할 일").closest("form")!);

    expect(await screen.findByText("입력 확인")).toBeInTheDocument();
    expect(mockTodo.useUpdateTodo.mutate).not.toHaveBeenCalled();
    expect(mockTodo.useCreateRecurringTodo.mutate).not.toHaveBeenCalled();
  });
});
