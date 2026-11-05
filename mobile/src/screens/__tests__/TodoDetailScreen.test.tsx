import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockUseTodos = jest.fn();
jest.mock("../../hooks/useTodos", () => ({
  useTodos: () => mockUseTodos(),
}));

const mockUpdateTodoMutateAsync = jest.fn<() => Promise<void>>();
const mockUpdateTodoMutate = jest.fn();
let mockUpdateTodoIsPending = false;
jest.mock("../../hooks/useUpdateTodo", () => ({
  useUpdateTodo: () => ({
    mutateAsync: mockUpdateTodoMutateAsync,
    mutate: mockUpdateTodoMutate,
    isPending: mockUpdateTodoIsPending,
  }),
}));

const mockDeleteTodoMutateAsync = jest.fn<() => Promise<void>>();
jest.mock("../../hooks/useDeleteTodo", () => ({
  useDeleteTodo: () => ({ mutateAsync: mockDeleteTodoMutateAsync }),
}));

const mockCreateRecurring = jest.fn<(input: unknown) => Promise<unknown[]>>();
jest.mock("../../hooks/useCreateRecurringTodo", () => ({
  useCreateRecurringTodo: () => ({ mutateAsync: mockCreateRecurring, isPending: false }),
}));

const mockEditSeries = jest.fn<(input: unknown) => Promise<void>>();
// 실제 useMutation처럼 mutateAsync 호출 시 isPending이 true로 바뀌어 리렌더되게 한다.
jest.mock("../../hooks/useEditRecurringSeries", () => {
  const { useState } = require("react");
  return {
    useEditRecurringSeries: () => {
      const [isPending, setPending] = useState(false);
      return {
        mutateAsync: (input: unknown) => {
          setPending(true);
          return mockEditSeries(input);
        },
        isPending,
      };
    },
  };
});

const mockDeleteSeries = jest.fn<(recurrenceId: string) => Promise<void>>();
// useEditRecurringSeries 목과 같이 호출 시 isPending이 true로 바뀌어 리렌더되게 한다.
jest.mock("../../hooks/useDeleteRecurringSeries", () => {
  const { useState } = require("react");
  return {
    useDeleteRecurringSeries: () => {
      const [isPending, setPending] = useState(false);
      return {
        mutateAsync: (recurrenceId: string) => {
          setPending(true);
          return mockDeleteSeries(recurrenceId);
        },
        isPending,
      };
    },
  };
});

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockPush = jest.fn();
let mockRouteParams: { id: string } = { id: "root-1" };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate, push: mockPush }),
  useRoute: () => ({ params: mockRouteParams }),
}));

const rootTodo = (overrides: Record<string, unknown> = {}) => ({
  id: "root-1",
  title: "루트 할 일",
  description: "설명입니다",
  parentId: null,
  status: "todo",
  priority: "medium",
  order: 0,
  startAt: null,
  dueAt: null,
  doneAt: null,
  recurrenceId: null,
  recurrence: null,
  ...overrides,
});

describe("TodoDetailScreen", () => {
  beforeEach(() => {
    mockUpdateTodoMutateAsync.mockReset();
    mockUpdateTodoMutate.mockReset();
    mockUpdateTodoIsPending = false;
    mockDeleteTodoMutateAsync.mockReset();
    mockGoBack.mockReset();
    mockNavigate.mockReset();
    mockPush.mockReset();
    mockRouteParams = { id: "root-1" };
    mockCreateRecurring.mockReset();
    mockEditSeries.mockReset();
    mockDeleteSeries.mockReset();
  });

  it("route id에 해당하는 할 일이 캐시에 없으면 안내 문구를 보여준다", async () => {
    mockUseTodos.mockReturnValue({ data: [] });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.getByText("할 일을 찾을 수 없습니다")).toBeTruthy();
  });

  it("마운트 시점엔 캐시에 아직 없다가 나중에 데이터가 도착하면 폼 값이 갱신된다", async () => {
    mockUseTodos.mockReturnValue({ data: [] });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    const { rerender } = await render(<TodoDetailScreen />);

    expect(screen.getByText("할 일을 찾을 수 없습니다")).toBeTruthy();

    mockUseTodos.mockReturnValue({ data: [rootTodo()] });
    await act(async () => {
      rerender(<TodoDetailScreen />);
    });

    expect(await screen.findByDisplayValue("루트 할 일")).toBeTruthy();
    expect(screen.getByDisplayValue("설명입니다")).toBeTruthy();
  });

  it("기존 제목/설명/우선순위 값으로 폼이 채워진다", async () => {
    mockUseTodos.mockReturnValue({ data: [rootTodo({ priority: "high" })] });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.getByDisplayValue("루트 할 일")).toBeTruthy();
    expect(screen.getByDisplayValue("설명입니다")).toBeTruthy();
    expect(screen.getByLabelText("우선순위 높음").props.accessibilityState.selected).toBe(true);
  });

  it("저장을 누르면 수정된 필드로 useUpdateTodo를 호출하고 뒤로 간다", async () => {
    mockUseTodos.mockReturnValue({ data: [rootTodo()] });
    mockUpdateTodoMutateAsync.mockResolvedValue(undefined);

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.changeText(screen.getByDisplayValue("루트 할 일"), "수정된 제목");
    await screen.findByDisplayValue("수정된 제목");

    await act(async () => {
      fireEvent.press(screen.getByText("저장"));
    });

    expect(mockUpdateTodoMutateAsync).toHaveBeenCalledWith({
      id: "root-1",
      fields: {
        title: "수정된 제목",
        description: "설명입니다",
        priority: "medium",
        startAt: null,
        dueAt: null,
      },
      title: "수정된 제목",
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it("시작일시가 마감일시보다 늦으면 저장하지 않고 에러 메시지를 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo({
          startAt: "2026-01-02T00:00:00.000Z",
          dueAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("저장"));
    });

    expect(
      await screen.findByText("시작일시는 마감일시보다 늦을 수 없습니다"),
    ).toBeTruthy();
    expect(mockUpdateTodoMutateAsync).not.toHaveBeenCalled();
  });

  it("상태 배지를 누르면 바텀시트가 열리고, 선택하면 useUpdateTodo가 상태로 호출된다", async () => {
    mockUseTodos.mockReturnValue({ data: [rootTodo({ status: "todo" })] });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("detail-status-badge"));
    fireEvent.press(await screen.findByText("진행 중"));

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "root-1",
      fields: { status: "doing", doneAt: null },
    });
  });

  it("이전 상태 변경이 진행 중이면 상태 배지를 눌러도 바텀시트가 열리지 않는다(더블탭 방지)", async () => {
    mockUpdateTodoIsPending = true;
    mockUseTodos.mockReturnValue({ data: [rootTodo({ status: "todo" })] });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("detail-status-badge"));

    expect(screen.queryByText("상태 선택")).toBeNull();
    expect(mockUpdateTodoMutate).not.toHaveBeenCalled();
  });

  it("자식의 편집 아이콘을 누르면 push로 그 자식의 상세로 이동한다(같은 라우트 재사용으로 인한 상태 오염 방지)", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo(),
        rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1" }),
      ],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("edit-child-child-1"));

    expect(mockPush).toHaveBeenCalledWith("TodoDetail", { id: "child-1" });
    expect(mockNavigate).not.toHaveBeenCalledWith("TodoDetail", expect.anything());
  });

  it("자식의 상태 점을 누르면 같은 바텀시트가 그 자식 기준으로 열린다", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo(),
        rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1", status: "todo" }),
      ],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("status-dot-child-1"));
    fireEvent.press(await screen.findByText("완료"));

    expect(mockUpdateTodoMutate).toHaveBeenCalledWith({
      id: "child-1",
      fields: { status: "done", doneAt: expect.any(String) },
    });
  });

  it("자식 삭제 버튼을 누르고 확정하면 그 자식이 삭제된다", async () => {
    const { Alert } = require("react-native");
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo(),
        rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1" }),
      ],
    });
    mockDeleteTodoMutateAsync.mockResolvedValue(undefined);

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByTestId("delete-child-child-1"));

    const call = (Alert.alert as jest.Mock).mock.calls.at(-1) as [
      string,
      string,
      { text: string; style?: string; onPress?: () => void }[],
    ];
    const destructive = call[2].find((button) => button.style === "destructive");
    await destructive?.onPress?.();

    expect(mockDeleteTodoMutateAsync).toHaveBeenCalledWith("child-1");
  });

  it("삭제 버튼을 누르면 확인 다이얼로그를 띄우고, 확정하면 삭제 후 뒤로 간다", async () => {
    const { Alert } = require("react-native");
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockUseTodos.mockReturnValue({ data: [rootTodo()] });
    mockDeleteTodoMutateAsync.mockResolvedValue(undefined);

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    fireEvent.press(screen.getByText("삭제"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "프로젝트 삭제",
      expect.any(String),
      expect.any(Array),
    );

    const call = (Alert.alert as jest.Mock).mock.calls.at(-1) as [
      string,
      string,
      { text: string; style?: string; onPress?: () => void }[],
    ];
    const destructive = call[2].find((button) => button.style === "destructive");
    await destructive?.onPress?.();

    expect(mockDeleteTodoMutateAsync).toHaveBeenCalledWith("root-1");
    expect(mockGoBack).toHaveBeenCalled();
  });

  it("루트(parentId 없음)일 때만 하위 할 일 섹션이 보이고, 추가 버튼은 TodoForm으로 parentId와 함께 이동한다", async () => {
    mockUseTodos.mockReturnValue({
      data: [
        rootTodo(),
        rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1", status: "done" }),
      ],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.getByText("하위 항목")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("하위 할 일 추가"));

    expect(mockNavigate).toHaveBeenCalledWith("TodoForm", { parentId: "root-1" });
  });

  it("자식(parentId 있음) 상세에서는 하위 할 일 섹션이 보이지 않는다", async () => {
    mockRouteParams = { id: "child-1" };
    mockUseTodos.mockReturnValue({
      data: [rootTodo(), rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1" })],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.queryByLabelText("하위 할 일 추가")).toBeNull();
  });

  it("반복 할 일이면 읽기 전용 반복 배지를 보여준다", async () => {
    mockUseTodos.mockReturnValue({
      data: [rootTodo({ recurrenceId: "series-1" })],
    });

    const { TodoDetailScreen } = await import("../TodoDetailScreen");
    await render(<TodoDetailScreen />);

    expect(screen.getByText("반복")).toBeTruthy();
  });

  describe("반복", () => {
    type AlertButton = { text: string; style?: string; onPress?: () => unknown };
    const START_AT = "2026-11-10T01:00:00.000Z";
    // 실제 반복 인스턴스처럼 dueAt은 그 회차 날짜(시작과 같은 날, KST 기준)다.
    const OCCURRENCE_DUE_AT = "2026-11-10T09:00:00.000Z";
    const DAILY = { type: "daily", endType: "indefinite", endDate: null };
    const recurringRoot = (overrides: Record<string, unknown> = {}) =>
      rootTodo({
        recurrenceId: "series-1",
        recurrence: DAILY,
        startAt: START_AT,
        dueAt: OCCURRENCE_DUE_AT,
        ...overrides,
      });
    const spyAlert = () => {
      const { Alert } = require("react-native");
      return jest.spyOn(Alert, "alert").mockImplementation(() => {}) as unknown as jest.Mock;
    };
    const lastButtons = (alertSpy: jest.Mock) =>
      (alertSpy.mock.calls.at(-1) as [string, string, AlertButton[]])[2];

    it("반복 할 일의 제목만 바꿔 저장해도 시리즈 수정 확인을 띄우고, 전체 적용 시 editRecurringSeries만 호출한다", async () => {
      const alertSpy = spyAlert();
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });
      mockEditSeries.mockResolvedValue(undefined);

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent.changeText(screen.getByDisplayValue("루트 할 일"), "바뀐 제목");
      await screen.findByDisplayValue("바뀐 제목");
      await fireEvent.press(screen.getByText("저장"));

      expect(alertSpy).toHaveBeenCalledWith(
        "반복 일정 수정",
        "이 변경은 이 일정과 이후 일정에 적용됩니다.\n\n이전 일정과 이미 완료됐거나 진행 중인 회차는 그대로 유지됩니다.",
        expect.any(Array),
      );
      const apply = lastButtons(alertSpy).find((b) => b.text === "전체 적용");
      await act(async () => {
        await apply?.onPress?.();
      });

      expect(mockEditSeries).toHaveBeenCalledTimes(1);
      expect(mockEditSeries).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "root-1",
          title: "바뀐 제목",
          recurrenceId: "series-1",
          dueAt: OCCURRENCE_DUE_AT,
          recurrence: DAILY,
        }),
      );
      // 회차의 dueAt이 시리즈 종료일(untilDate)로 바뀌어 무기한 시리즈가 잘리면 안 된다.
      expect(
        (mockEditSeries.mock.calls[0][0] as { recurrence: { endType: string } }).recurrence.endType,
      ).toBe("indefinite");
      expect(mockUpdateTodoMutateAsync).not.toHaveBeenCalled();
      expect(mockGoBack).toHaveBeenCalled();
    });

    it("종료일이 있는 시리즈를 수정하면 회차 날짜가 아니라 기존 종료일을 유지한다", async () => {
      const alertSpy = spyAlert();
      const UNTIL = { type: "daily", endType: "untilDate", endDate: "2026-12-31" };
      mockUseTodos.mockReturnValue({ data: [recurringRoot({ recurrence: UNTIL })] });
      mockEditSeries.mockResolvedValue(undefined);

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      expect(screen.getByText("2026-12-31까지 반복됩니다")).toBeTruthy();
      await fireEvent.press(screen.getByLabelText("반복 주기 매주"));
      await fireEvent.press(screen.getByLabelText("화요일"));
      await fireEvent.press(screen.getByText("저장"));
      const apply = lastButtons(alertSpy).find((b) => b.text === "전체 적용");
      await act(async () => {
        await apply?.onPress?.();
      });

      expect(mockEditSeries).toHaveBeenCalledWith(
        expect.objectContaining({
          recurrence: { type: "weekly", endType: "untilDate", endDate: "2026-12-31", weekdays: [2] },
        }),
      );
    });

    it("기존 untilDate 시리즈는 「날짜 지정」과 그 날짜로 채워지고, 제목만 바꿔도 endDate가 유지된다", async () => {
      const alertSpy = spyAlert();
      const UNTIL = { type: "daily", endType: "untilDate", endDate: "2026-12-31" };
      mockUseTodos.mockReturnValue({ data: [recurringRoot({ recurrence: UNTIL })] });
      mockEditSeries.mockResolvedValue(undefined);

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      expect(screen.getByRole("radio", { name: "반복 종료 날짜 지정" }).props.accessibilityState.selected).toBe(true);
      expect(screen.getByLabelText("반복 종료일, 2026-12-31")).toBeTruthy();
      await fireEvent.changeText(screen.getByDisplayValue("루트 할 일"), "바뀐 제목");
      await screen.findByDisplayValue("바뀐 제목");
      await fireEvent.press(screen.getByText("저장"));
      const apply = lastButtons(alertSpy).find((b) => b.text === "전체 적용");
      await act(async () => {
        await apply?.onPress?.();
      });

      expect(mockEditSeries).toHaveBeenCalledWith(
        expect.objectContaining({ title: "바뀐 제목", recurrence: UNTIL }),
      );
    });

    it("종료를 없음으로 바꾸면 indefinite + endDate null로 저장한다", async () => {
      const alertSpy = spyAlert();
      const UNTIL = { type: "daily", endType: "untilDate", endDate: "2026-12-31" };
      mockUseTodos.mockReturnValue({ data: [recurringRoot({ recurrence: UNTIL })] });
      mockEditSeries.mockResolvedValue(undefined);

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent.press(screen.getByRole("radio", { name: "반복 종료 없음" }));
      await fireEvent.press(screen.getByText("저장"));
      const apply = lastButtons(alertSpy).find((b) => b.text === "전체 적용");
      await act(async () => {
        await apply?.onPress?.();
      });

      expect(mockEditSeries).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: { type: "daily", endType: "indefinite", endDate: null } }),
      );
    });

    it("기존 시리즈 수정에서는 만료일시가 보인다", async () => {
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });
      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      expect(screen.getByText("만료일시")).toBeTruthy();
    });

    it("endDate가 없는 옛 untilDate 문서는 「날짜 지정」+빈 날짜로 열리고 저장이 막힌다", async () => {
      const alertSpy = spyAlert();
      alertSpy.mockClear(); // spy는 테스트 간 호출 기록을 공유한다
      mockUseTodos.mockReturnValue({
        data: [recurringRoot({ recurrence: { type: "daily", endType: "untilDate" } })],
      });

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      expect(screen.getByLabelText("반복 종료일, 선택 안 함")).toBeTruthy();
      await fireEvent.press(screen.getByText("저장"));

      expect((await screen.findAllByText("종료일을 선택해주세요")).length).toBeGreaterThan(0);
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockEditSeries).not.toHaveBeenCalled();
    });

    it("시리즈 수정 확인에서 취소하면 아무 mutation도 호출하지 않는다", async () => {
      const alertSpy = spyAlert();
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent.press(screen.getByText("저장"));

      const cancel = lastButtons(alertSpy).find((b) => b.text === "취소");
      await act(async () => {
        await cancel?.onPress?.();
      });

      expect(mockEditSeries).not.toHaveBeenCalled();
      expect(mockUpdateTodoMutateAsync).not.toHaveBeenCalled();
      expect(mockCreateRecurring).not.toHaveBeenCalled();
      expect(mockDeleteTodoMutateAsync).not.toHaveBeenCalled();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it("editRecurringSeries가 실패하면 시리즈 저장 실패 문구를 보여 주고 뒤로 가지 않는다", async () => {
      const alertSpy = spyAlert();
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });
      mockEditSeries.mockRejectedValue(new Error("boom"));

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent.press(screen.getByText("저장"));
      const apply = lastButtons(alertSpy).find((b) => b.text === "전체 적용");
      await act(async () => {
        await apply?.onPress?.();
      });

      expect(
        await screen.findByText("반복 일정 저장 중 오류가 발생했습니다. 다시 시도해주세요"),
      ).toBeTruthy();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it("전체 적용을 두 번 눌러도 pending 동안 editRecurringSeries는 한 번만 호출된다", async () => {
      const alertSpy = spyAlert();
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });
      mockEditSeries.mockReturnValue(new Promise(() => {}));

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent.press(screen.getByText("저장"));
      const apply = lastButtons(alertSpy).find((b) => b.text === "전체 적용");
      await act(async () => {
        void apply?.onPress?.();
        void apply?.onPress?.();
      });

      expect(mockEditSeries).toHaveBeenCalledTimes(1);
    });

    it("비반복 할 일에서 반복을 켜고 저장하면 createRecurringTodo 다음 deleteTodo(원본) 순서로 호출한다", async () => {
      mockUseTodos.mockReturnValue({ data: [rootTodo({ startAt: START_AT })] });
      mockCreateRecurring.mockResolvedValue([]);
      mockDeleteTodoMutateAsync.mockResolvedValue(undefined);

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent(screen.getByLabelText("이 할 일을 반복합니다"), "valueChange", true);
      await fireEvent.press(screen.getByText("저장"));

      expect(mockCreateRecurring).toHaveBeenCalledWith(
        expect.objectContaining({ title: "루트 할 일", startAt: START_AT, recurrence: DAILY }),
      );
      expect(mockDeleteTodoMutateAsync).toHaveBeenCalledWith("root-1");
      expect(mockCreateRecurring.mock.invocationCallOrder[0]).toBeLessThan(
        mockDeleteTodoMutateAsync.mock.invocationCallOrder[0],
      );
      expect(mockUpdateTodoMutateAsync).not.toHaveBeenCalled();
      expect(mockGoBack).toHaveBeenCalled();
    });

    it("createRecurringTodo가 실패하면 원본을 지우지 않고 에러를 보여 준다", async () => {
      mockUseTodos.mockReturnValue({ data: [rootTodo({ startAt: START_AT })] });
      mockCreateRecurring.mockRejectedValue(new Error("생성 실패"));

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent(screen.getByLabelText("이 할 일을 반복합니다"), "valueChange", true);
      await fireEvent.press(screen.getByText("저장"));

      expect(await screen.findByText("생성 실패")).toBeTruthy();
      expect(mockDeleteTodoMutateAsync).not.toHaveBeenCalled();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it("전환 후 원본 삭제만 실패하면 정리 실패 문구를 띄우고 뒤로 간다", async () => {
      const alertSpy = spyAlert();
      mockUseTodos.mockReturnValue({ data: [rootTodo({ startAt: START_AT })] });
      mockCreateRecurring.mockResolvedValue([]);
      mockDeleteTodoMutateAsync.mockRejectedValue(new Error("삭제 실패"));

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent(screen.getByLabelText("이 할 일을 반복합니다"), "valueChange", true);
      await fireEvent.press(screen.getByText("저장"));

      expect(alertSpy).toHaveBeenCalledWith(
        expect.any(String),
        "새 반복 일정은 생성되었지만 기존 항목 정리에 실패했습니다. 목록을 확인해주세요",
      );
      expect(mockGoBack).toHaveBeenCalled();
    });

    it("반복 할 일을 삭제하면 반복 삭제 문구를 띄우고, 확인 시 deleteRecurringSeries만 호출한다", async () => {
      const alertSpy = spyAlert();
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });
      mockDeleteSeries.mockResolvedValue(undefined);

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent.press(screen.getByText("삭제"));

      expect(alertSpy).toHaveBeenCalledWith(
        "할 일 삭제",
        '"루트 할 일"은(는) 반복 일정입니다.\n\n삭제하면 이 반복 시리즈의 모든 일정이 함께 삭제됩니다.',
        expect.any(Array),
      );
      const destructive = lastButtons(alertSpy).find((b) => b.style === "destructive");
      expect(destructive?.text).toBe("삭제");
      await act(async () => {
        await destructive?.onPress?.();
      });

      expect(mockDeleteSeries).toHaveBeenCalledWith("series-1");
      expect(mockDeleteTodoMutateAsync).not.toHaveBeenCalled();
      expect(mockGoBack).toHaveBeenCalled();
    });

    it("반복 삭제 확인을 같은 틱에 두 번 눌러도 deleteRecurringSeries는 한 번만 호출된다", async () => {
      const alertSpy = spyAlert();
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });
      mockDeleteSeries.mockReturnValue(new Promise(() => {}));

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent.press(screen.getByText("삭제"));
      const destructive = lastButtons(alertSpy).find((b) => b.style === "destructive");
      await act(async () => {
        void destructive?.onPress?.();
        void destructive?.onPress?.();
      });

      expect(mockDeleteSeries).toHaveBeenCalledTimes(1);
    });

    it("시리즈 삭제가 진행 중이면 저장을 눌러도 아무것도 하지 않는다(삭제된 시리즈 부활 방지)", async () => {
      const alertSpy = spyAlert();
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });
      mockDeleteSeries.mockReturnValue(new Promise(() => {}));

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent.press(screen.getByText("삭제"));
      const destructive = lastButtons(alertSpy).find((b) => b.style === "destructive");
      await act(async () => {
        void destructive?.onPress?.();
      });
      alertSpy.mockClear();

      expect(screen.getByRole("button", { name: "저장" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: true }),
      );
      await fireEvent.press(screen.getByText("저장"));

      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockEditSeries).not.toHaveBeenCalled();
      expect(mockUpdateTodoMutateAsync).not.toHaveBeenCalled();
    });

    it("시리즈 삭제와 같은 틱에 저장 확인(전체 적용)이 눌려도 editRecurringSeries는 호출되지 않는다", async () => {
      const alertSpy = spyAlert();
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });
      mockDeleteSeries.mockReturnValue(new Promise(() => {}));

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);
      await fireEvent.press(screen.getByText("저장"));
      const apply = lastButtons(alertSpy).find((b) => b.text === "전체 적용");
      await fireEvent.press(screen.getByText("삭제"));
      const destructive = lastButtons(alertSpy).find((b) => b.style === "destructive");
      await act(async () => {
        void destructive?.onPress?.();
        void apply?.onPress?.();
      });

      expect(mockDeleteSeries).toHaveBeenCalledTimes(1);
      expect(mockEditSeries).not.toHaveBeenCalled();
    });

    it("반복 할 일에는 하위 할 일 추가 버튼이 없다", async () => {
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);

      expect(screen.queryByLabelText("하위 할 일 추가")).toBeNull();
    });

    it("반복이 꺼진 옛 시리즈 회차(recurrenceId만 있고 recurrence 없음)에는 웹처럼 하위 할 일 추가 버튼이 보인다", async () => {
      mockUseTodos.mockReturnValue({ data: [recurringRoot({ recurrence: null })] });

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);

      expect(screen.getByLabelText("하위 할 일 추가")).toBeTruthy();
    });

    it("반복 할 일을 열면 반복 스위치가 켜진 상태로 채워진다", async () => {
      mockUseTodos.mockReturnValue({ data: [recurringRoot()] });

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);

      expect(screen.getByLabelText("이 할 일을 반복합니다").props.value).toBe(true);
    });

    it("하위 할 일이 있는 루트에서는 반복 섹션이 비활성이고 하위 할 일 사유를 먼저 보여 준다", async () => {
      mockUseTodos.mockReturnValue({
        data: [rootTodo(), rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1" })],
      });

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);

      expect(screen.getByLabelText("이 할 일을 반복합니다").props.disabled).toBe(true);
      expect(screen.getByText("하위 할 일이 있는 항목은 반복을 설정할 수 없습니다")).toBeTruthy();
    });

    it("하위 할 일 상세에서는 반복 섹션을 렌더링하지 않는다", async () => {
      mockRouteParams = { id: "child-1" };
      mockUseTodos.mockReturnValue({
        data: [rootTodo(), rootTodo({ id: "child-1", title: "하위 항목", parentId: "root-1", startAt: START_AT })],
      });

      const { TodoDetailScreen } = await import("../TodoDetailScreen");
      await render(<TodoDetailScreen />);

      expect(screen.queryByText("이 할 일을 반복합니다")).toBeNull();
    });
  });
});
