import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import { setupUser } from "@/test/setupUser";
import ProjectCard from "../projectCard";
import type { Todo } from "../../types";
import type { ProjectCardData } from "../../utils/projectUtils";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: null },
  googleProvider: {},
}));

vi.mock("@/shared/lib/firestore", () => ({
  db: {},
}));

type MutateOptions = { onSuccess?: () => void; onError?: () => void };

const updateMutate = vi.fn();
const deleteMutate = vi.fn();

// projectCard(및 그 안에서 렌더되는 childTodoCard)는 리스트 행이라 useTodo() 전체가
// 아니라 useUpdateTodo/useDeleteTodo를 독립적으로 호출한다(CLAUDE.md 컨벤션).
vi.mock("../../hooks", () => ({
  useUpdateTodo: () => ({ mutate: updateMutate }),
  useDeleteTodo: () => ({ mutate: deleteMutate }),
}));

const isTabletMock = vi.fn(() => false);
vi.mock("@/shared/hooks/useMediaQuery", () => ({
  default: () => isTabletMock(),
}));

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "project-1",
  userId: "user-1",
  title: "프로젝트 A",
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

const makeData = (overrides: Partial<ProjectCardData> = {}): ProjectCardData => ({
  todo: makeTodo(),
  childTodos: [],
  progress: 0,
  subtaskInfo: { total: 0, statusText: "시작 전" },
  overdueInfo: { isOverdue: false, daysOver: 0 },
  recurringMissedCount: 0,
  ...overrides,
});

const renderCard = (
  props: Partial<Parameters<typeof ProjectCard>[0]> & { data: ProjectCardData },
) =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <ProjectCard
          isExpanded={false}
          onCardClick={vi.fn()}
          onToggleExpand={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onAddChild={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  isTabletMock.mockReturnValue(false);
  updateMutate.mockImplementation(
    (_payload: Todo, options?: MutateOptions) => {
      options?.onSuccess?.();
    },
  );
  deleteMutate.mockImplementation((_id: string, options?: MutateOptions) => {
    options?.onSuccess?.();
  });
});

describe("ProjectCard 기본 렌더링", () => {
  it("제목과 부제(할 일 개수 + 상태)를 표시한다", () => {
    renderCard({
      data: makeData({
        subtaskInfo: { total: 3, statusText: "진행 중" },
      }),
    });

    expect(screen.getByText("프로젝트 A")).toBeInTheDocument();
    expect(screen.getByText("3개 할일 · 진행 중")).toBeInTheDocument();
  });

  it("하위 항목이 없으면 개수 없이 상태 문구만 표시한다", () => {
    renderCard({ data: makeData({ subtaskInfo: { total: 0, statusText: "시작 전" } }) });
    expect(screen.getByText("시작 전")).toBeInTheDocument();
  });

  it("카드 헤더를 클릭하면 onCardClick이 todo와 함께 호출된다", async () => {
    const user = setupUser();
    const onCardClick = vi.fn();
    const data = makeData();
    renderCard({ data, onCardClick });

    await user.click(screen.getByText("프로젝트 A"));

    expect(onCardClick).toHaveBeenCalledWith(data.todo);
  });
});

describe("ProjectCard 초과/반복 배지", () => {
  it("기한 초과 상태면 초과 배지를 보여준다", () => {
    renderCard({
      data: makeData({ overdueInfo: { isOverdue: true, daysOver: 4 } }),
    });
    expect(screen.getByText("4일 초과")).toBeInTheDocument();
  });

  it("기한 초과가 아니면 초과 배지를 보여주지 않는다", () => {
    renderCard({
      data: makeData({ overdueInfo: { isOverdue: false, daysOver: 0 } }),
    });
    expect(screen.queryByText(/일 초과/)).not.toBeInTheDocument();
  });

  it("반복 할 일이면 반복 배지와 밀림 배지를 보여준다", () => {
    renderCard({
      data: makeData({
        todo: makeTodo({ recurrenceId: "series-1" }),
        recurringMissedCount: 2,
      }),
    });
    expect(screen.getByText("반복")).toBeInTheDocument();
    expect(screen.getByText("2회 밀림")).toBeInTheDocument();
  });

  it("반복 할 일이 아니면 반복 배지를 보여주지 않는다", () => {
    renderCard({ data: makeData({ todo: makeTodo({ recurrenceId: null }) }) });
    expect(screen.queryByText("반복")).not.toBeInTheDocument();
  });
});

describe("ProjectCard 상태 변경", () => {
  it("상태 점을 클릭하면 상태 변경 바텀시트가 열리고, 선택하면 updateTodo가 호출된다", async () => {
    const user = setupUser();
    renderCard({ data: makeData() });

    await user.click(screen.getByLabelText("프로젝트 상태 변경"));
    expect(screen.getByText("상태 변경")).toBeInTheDocument();

    await user.click(screen.getByText("완료"));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done" }),
      expect.any(Object),
    );
    expect(await screen.findByText('"프로젝트 A" 상태가 변경되었습니다')).toBeInTheDocument();
  });

  it("상태 점 클릭은 카드 클릭(onCardClick)으로 전파되지 않는다", async () => {
    const user = setupUser();
    const onCardClick = vi.fn();
    renderCard({ data: makeData(), onCardClick });

    await user.click(screen.getByLabelText("프로젝트 상태 변경"));

    expect(onCardClick).not.toHaveBeenCalled();
  });
});

describe("ProjectCard 삭제/하위 추가 (데스크톱)", () => {
  it("삭제 버튼을 클릭하면 onDelete가 호출되고 onCardClick은 호출되지 않는다", async () => {
    const user = setupUser();
    const onDelete = vi.fn();
    const onCardClick = vi.fn();
    renderCard({ data: makeData(), onDelete, onCardClick });

    await user.click(screen.getByLabelText("프로젝트 삭제"));

    expect(onDelete).toHaveBeenCalledWith("project-1");
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("하위 작업 추가 버튼을 클릭하면 onAddChild가 호출된다", async () => {
    const user = setupUser();
    const onAddChild = vi.fn();
    renderCard({ data: makeData(), onAddChild });

    await user.click(screen.getByLabelText("하위 작업 추가"));

    expect(onAddChild).toHaveBeenCalledWith("project-1");
  });

  it("반복 할 일이면 하위 작업 추가 버튼이 비활성화된다", () => {
    renderCard({
      data: makeData({ todo: makeTodo({ recurrence: { type: "daily", endType: "indefinite" } }) }),
    });

    expect(screen.getByLabelText("하위 작업 추가")).toBeDisabled();
  });

  it("펼치기 버튼을 클릭하면 onToggleExpand가 호출된다", async () => {
    const user = setupUser();
    const onToggleExpand = vi.fn();
    renderCard({ data: makeData(), onToggleExpand });

    await user.click(screen.getByLabelText("프로젝트 펼치기"));

    expect(onToggleExpand).toHaveBeenCalledWith("project-1");
  });

  it("펼쳐진 상태에서 하위 항목이 없으면 안내 문구를 보여준다", () => {
    renderCard({ data: makeData(), isExpanded: true });
    expect(screen.getByText("하위 항목이 없습니다")).toBeInTheDocument();
  });

  it("펼쳐진 상태에서 하위 항목이 있으면 각 항목을 렌더링한다", () => {
    const child = makeTodo({ id: "child-1", title: "하위 작업 1", parentId: "project-1" });
    renderCard({ data: makeData({ childTodos: [child] }), isExpanded: true });

    expect(screen.getByText("하위 작업 1")).toBeInTheDocument();
    expect(screen.queryByText("하위 항목이 없습니다")).not.toBeInTheDocument();
  });
});

describe("ProjectCard 모바일 액션시트", () => {
  beforeEach(() => {
    isTabletMock.mockReturnValue(true);
  });

  it("모바일에서는 데스크톱 삭제 버튼을 렌더링하지 않는다", () => {
    renderCard({ data: makeData() });
    expect(screen.queryByLabelText("프로젝트 삭제")).not.toBeInTheDocument();
  });

  it("펼치기 버튼을 클릭하면 (토글 대신) 액션시트가 열려 하위 항목과 삭제 버튼을 보여준다", async () => {
    const user = setupUser();
    const onToggleExpand = vi.fn();
    const child = makeTodo({ id: "child-1", title: "하위 작업 1" });
    renderCard({
      data: makeData({ childTodos: [child] }),
      onToggleExpand,
    });

    await user.click(screen.getByLabelText("프로젝트 펼치기"));

    expect(onToggleExpand).not.toHaveBeenCalled();
    expect(screen.getByText("하위 작업 1")).toBeInTheDocument();
    expect(screen.getByText("프로젝트 삭제")).toBeInTheDocument();
  });

  it("액션시트의 프로젝트 삭제를 클릭하면 onDelete가 호출된다", async () => {
    const user = setupUser();
    const onDelete = vi.fn();
    renderCard({ data: makeData(), onDelete });

    await user.click(screen.getByLabelText("프로젝트 펼치기"));
    await user.click(screen.getByText("프로젝트 삭제"));

    expect(onDelete).toHaveBeenCalledWith("project-1");
  });
});
