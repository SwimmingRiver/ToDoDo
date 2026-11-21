import { render, screen, fireEvent, waitFor, within } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import type { Todo } from "@tododo/core";
import { colors } from "../../../../theme/colors";
import { statusColors } from "../../../../theme/statusColors";

const baseTodo: Todo = {
  id: "a",
  userId: "u1",
  title: "할 일 A",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("DateTodosSheet", () => {
  it("항목이 없으면 빈 상태와 할 일 추가 버튼을 보여준다", async () => {
    const onAddTodo = jest.fn();
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[]}
        onPressTodo={jest.fn()}
        onAddTodo={onAddTodo}
      />,
    );

    // RN Modal jest mock 특성상 visible=true 초기 렌더도 한 틱 뒤에 반영된다.
    await waitFor(() => {
      expect(screen.getByText("6월 20일, 토요일")).toBeTruthy();
    });
    expect(screen.getByText("이 날짜엔 할 일이 없어요")).toBeTruthy();

    fireEvent.press(screen.getByText("할 일 추가"));
    expect(onAddTodo).toHaveBeenCalled();
  });

  it("항목이 있으면 목록을 보여주고, 항목을 누르면 onPressTodo를 호출한다", async () => {
    const onPressTodo = jest.fn();
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[baseTodo]}
        onPressTodo={onPressTodo}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("할 일 A")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("할 일 A"));
    expect(onPressTodo).toHaveBeenCalledWith(baseTodo);
  });

  it("체크박스 없이 상태·시작·마감을 한 줄로 보여준다", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 20, 12, 0));
    const todo: Todo = {
      ...baseTodo,
      status: "doing",
      startAt: new Date(2026, 5, 18, 9, 0).toISOString(),
      dueAt: new Date(2026, 5, 22, 18, 0).toISOString(),
    };
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[todo]}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("진행 중 · 시작: 6월 18일 · 마감: 6월 22일")).toBeTruthy();
    });
    expect(screen.queryByLabelText("할 일 A 완료 처리")).toBeNull();
    expect(screen.getByTestId("date-todo-a")).toHaveStyle({ borderLeftColor: statusColors.doing.main });
    jest.useRealTimers();
  });

  it("반복 할 일이면 반복 요약을 보여준다", async () => {
    const todo: Todo = {
      ...baseTodo,
      recurrenceId: "r1",
      recurrence: { type: "weekly", weekdays: [1, 3], endType: "indefinite" },
    };
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[todo]}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("매주 월・수 반복")).toBeTruthy();
    });
  });

  it("기한이 지난 미완료 항목은 위험 색 보더와 배경으로 표시한다", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 25, 12, 0));
    const todo: Todo = { ...baseTodo, dueAt: new Date(2026, 5, 20, 18, 0).toISOString() };
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[todo]}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("date-todo-a")).toHaveStyle({
        borderLeftColor: colors.danger.main,
        backgroundColor: colors.danger.background,
      });
    });
    jest.useRealTimers();
  });

  it("항목이 있어도 하단 '할 일 추가' 버튼을 보여준다", async () => {
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[baseTodo]}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("할 일 추가")).toBeTruthy();
    });
  });

  describe("구글 캘린더 일정", () => {
    const allDayEvent = { id: "g1", title: "가족 모임", start: "2026-06-20", end: "2026-06-21" };

    it("할 일 아래에 '구글 캘린더 · 종일' 줄을 보여주고, 그 줄은 버튼이 아니다", async () => {
      const { DateTodosSheet } = await import("../DateTodosSheet");
      await render(
        <DateTodosSheet
          isOpen
          onClose={jest.fn()}
          dateLabel="6월 20일, 토요일"
          dateKey="2026-06-20"
          todos={[baseTodo]}
          googleEvents={[allDayEvent]}
          onPressTodo={jest.fn()}
          onAddTodo={jest.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("가족 모임")).toBeTruthy();
      });
      expect(screen.getByText("구글 캘린더 · 종일")).toBeTruthy();
      expect(screen.getByText("할 일 A")).toBeTruthy();
      // 읽기 전용 행: 버튼 역할 요소 중 어떤 것도 구글 일정 제목을 담지 않는다.
      const buttons = screen.queryAllByRole("button");
      for (const button of buttons) {
        expect(within(button).queryByText("가족 모임")).toBeNull();
      }
    });

    it("할 일이 0개여도 구글 일정이 있으면 빈 상태 대신 목록을 보여준다", async () => {
      const { DateTodosSheet } = await import("../DateTodosSheet");
      await render(
        <DateTodosSheet
          isOpen
          onClose={jest.fn()}
          dateLabel="6월 20일, 토요일"
          dateKey="2026-06-20"
          todos={[]}
          googleEvents={[allDayEvent]}
          onPressTodo={jest.fn()}
          onAddTodo={jest.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("구글 캘린더 · 종일")).toBeTruthy();
      });
      expect(screen.queryByText("이 날짜엔 할 일이 없어요")).toBeNull();
    });
  });
});

describe("DateTodosSheet 애니메이션", () => {
  it("배경이 같이 미끄러지지 않도록 Modal 자체 애니메이션은 끄고(animationType none) 시트만 움직인다", async () => {
    const { DateTodosSheet } = await import("../DateTodosSheet");
    await render(
      <DateTodosSheet
        isOpen
        onClose={jest.fn()}
        dateLabel="6월 20일, 토요일"
        todos={[]}
        onPressTodo={jest.fn()}
        onAddTodo={jest.fn()}
      />,
    );
    expect(screen.getByTestId("date-todos-sheet-modal", { includeHiddenElements: true }).props.animationType).toBe("none");
  });

  it("닫으면(내려가는 애니메이션 완료 후) 시트가 사라지고, 다시 열면 보인다", async () => {
    // jest 환경의 Animated는 즉시 완료되므로 "내려가는 중" 중간 상태는 관찰하지 않고 최종 상태만 본다.
    const { DateTodosSheet } = await import("../DateTodosSheet");
    const props = {
      onClose: jest.fn(),
      dateLabel: "6월 20일, 토요일",
      todos: [],
      onPressTodo: jest.fn(),
      onAddTodo: jest.fn(),
    };
    const { rerender } = await render(<DateTodosSheet isOpen {...props} />);
    await waitFor(() => expect(screen.getByText("6월 20일, 토요일")).toBeTruthy());
    await rerender(<DateTodosSheet isOpen={false} {...props} />);
    await waitFor(() => expect(screen.queryByText("6월 20일, 토요일")).toBeNull());
    await rerender(<DateTodosSheet isOpen {...props} />);
    await waitFor(() => expect(screen.getByText("6월 20일, 토요일")).toBeTruthy());
  });
});
