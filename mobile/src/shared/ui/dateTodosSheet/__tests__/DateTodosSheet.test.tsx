import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react-native";
import { useState } from "react";
import { Animated, StyleSheet } from "react-native";
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

describe("DateTodosSheet 레이아웃·닫기", () => {
  // 리뷰: maxHeight 80%를 Animated.View로 옮긴 뒤 안쪽 Pressable에 스타일이 없어 ScrollView가
  // 줄어들지 않았다 → 작은 화면·큰 글꼴에서 하단 "할 일 추가"가 잘릴 수 있었다.
  it("시트 내용 래퍼는 flexShrink:1이라 목록이 80% 안에서 줄어든다", async () => {
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
    await waitFor(() => expect(screen.getByText("할 일 A")).toBeTruthy());
    expect(StyleSheet.flatten(screen.getByTestId("date-todos-sheet-content").props.style)).toEqual(
      expect.objectContaining({ flexShrink: 1 }),
    );
  });

  // CalendarScreen처럼 항목/추가를 누르면 부모가 같은 틱에 isOpen=false로 바꾸고 화면을 이동한다.
  // 내려가는 250ms 동안 Modal 오버레이가 남아 새 화면의 탭을 삼키지 않게 바로 내린다.
  const Harness = ({ onNavigate }: { onNavigate: () => void }) => {
    const [isOpen, setIsOpen] = useState(true);
    const { DateTodosSheet } = jest.requireActual("../DateTodosSheet") as typeof import("../DateTodosSheet");
    return (
      <DateTodosSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        dateLabel="6월 20일, 토요일"
        todos={[baseTodo]}
        onPressTodo={() => {
          setIsOpen(false);
          onNavigate();
        }}
        onAddTodo={() => {
          setIsOpen(false);
          onNavigate();
        }}
      />
    );
  };
  const modalVisible = () => {
    const modal = screen.queryByTestId("date-todos-sheet-modal", { includeHiddenElements: true });
    return !!modal && modal.props.visible !== false;
  };

  it.each([
    ["할 일 항목", "할 일 A"],
    ["할 일 추가", "할 일 추가"],
  ])("%s을 누르면 내려가는 애니메이션 없이 Modal을 바로 내린다", async (_label, text) => {
    const timing = jest.spyOn(Animated, "timing");
    await render(<Harness onNavigate={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("할 일 A")).toBeTruthy());
    timing.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByText(text));
    });

    expect(modalVisible()).toBe(false);
    expect(timing.mock.calls.some(([, config]) => (config as { toValue: number }).toValue > 0)).toBe(false);
    timing.mockRestore();
  });

  it("배경(오버레이)을 눌러 닫으면 내려가는 애니메이션을 그대로 쓴다", async () => {
    const timing = jest.spyOn(Animated, "timing");
    await render(<Harness onNavigate={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("할 일 A")).toBeTruthy());
    timing.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("닫기"));
    });

    expect(timing.mock.calls.some(([, config]) => (config as { toValue: number }).toValue > 0)).toBe(true);
    timing.mockRestore();
  });

  // 열기 애니메이션은 Modal·시트가 실제로 마운트된 뒤에 시작해야 첫 프레임이 빠지지 않는다.
  it("다시 열 때 올라오는 애니메이션은 시트 내용이 그려진 뒤에 시작한다", async () => {
    const { DateTodosSheet } = await import("../DateTodosSheet");
    const props = {
      onClose: jest.fn(),
      dateLabel: "6월 20일, 토요일",
      todos: [],
      onPressTodo: jest.fn(),
      onAddTodo: jest.fn(),
    };
    const { rerender } = await render(<DateTodosSheet isOpen={false} {...props} />);
    const mountedWhenOpenStarted: boolean[] = [];
    const original = Animated.timing;
    const timing = jest.spyOn(Animated, "timing").mockImplementation((value, config) => {
      if ((config as { toValue: number }).toValue === 0) {
        mountedWhenOpenStarted.push(screen.queryByText("6월 20일, 토요일") !== null);
      }
      return original(value, config);
    });

    await rerender(<DateTodosSheet isOpen {...props} />);
    await waitFor(() => expect(screen.getByText("6월 20일, 토요일")).toBeTruthy());

    expect(mountedWhenOpenStarted.length).toBeGreaterThan(0);
    expect(mountedWhenOpenStarted.every(Boolean)).toBe(true);
    timing.mockRestore();
  });
});

describe("DateTodosSheet 하단 여백", () => {
  it("홈 인디케이터에 버튼이 붙지 않도록 하단 안전 영역만큼 여백을 더한다", async () => {
    const safeArea = await import("react-native-safe-area-context");
    const spy = jest
      .spyOn(safeArea, "useSafeAreaInsets")
      .mockReturnValue({ top: 0, right: 0, bottom: 34, left: 0 });
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
    const footer = await screen.findByTestId("date-todos-sheet-footer");
    const style = Object.assign({}, ...[footer.props.style].flat(Infinity).filter(Boolean));
    expect(style.paddingBottom).toBe(16 + 34);
    spy.mockRestore();
  });
});
