import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockMutateAsync = jest.fn<() => Promise<string>>();
jest.mock("../../hooks/useCreateTodo", () => ({
  useCreateTodo: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const mockCreateRecurring = jest.fn<(input: unknown) => Promise<unknown[]>>();
// 실제 useMutation처럼 mutateAsync 호출 시 isPending이 true로 바뀌어 리렌더되게 한다.
jest.mock("../../hooks/useCreateRecurringTodo", () => {
  const { useState } = require("react");
  return {
    useCreateRecurringTodo: () => {
      const [isPending, setPending] = useState(false);
      return {
        mutateAsync: (input: unknown) => {
          setPending(true);
          return mockCreateRecurring(input);
        },
        isPending,
      };
    },
  };
});

// 네이티브 피커 대신 값을 즉시 설정/해제하는 스텁 (startAt 제어용)
jest.mock("../../shared/ui/dateTimeField/DateTimeField", () => {
  const { Pressable, Text } = require("react-native");
  return {
    DateTimeField: ({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string | null) => void }) => (
      <>
        <Text>{label}</Text>
        <Text>{`${label} 값: ${value ?? "없음"}`}</Text>
        <Pressable onPress={() => onChange("2026-11-10T01:00:00.000Z")}>
          <Text>{`${label} 설정`}</Text>
        </Pressable>
        <Pressable onPress={() => onChange(null)}>
          <Text>{`${label} 해제`}</Text>
        </Pressable>
      </>
    ),
  };
});

const mockUseTodos = jest.fn();
jest.mock("../../hooks/useTodos", () => ({
  useTodos: () => mockUseTodos(),
}));

const mockGoBack = jest.fn();
let mockRouteParams: { parentId?: string; dueAt?: string } | undefined = undefined;
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

describe("TodoFormScreen", () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockCreateRecurring.mockReset();
    mockGoBack.mockReset();
    mockUseTodos.mockReturnValue({ data: [] });
    mockRouteParams = undefined;
  });

  it("제목이 공백뿐이면 생성 요청을 보내지 않는다", async () => {
    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "   ");
    // changeText로 예약된 상태 갱신이 커밋된 뒤에 눌러야 press가 최신 title을
    // 반영한 handleSubmit을 호출한다 (아래 두 번째 테스트의 주석 참고).
    await screen.findByDisplayValue("   ");

    await act(async () => {
      fireEvent.press(screen.getByText("추가"));
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("생성에 실패하면 에러 메시지를 보여주고 이전 화면으로 돌아가지 않는다", async () => {
    mockMutateAsync.mockRejectedValue(new Error("네트워크 오류"));

    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "새 할 일");
    // changeText로 예약된 setTitle 상태 갱신이 실제로 반영된 뒤에 제출해야 한다.
    // 그렇지 않으면 press가 title="" 상태를 캡처한 이전 렌더의 handleSubmit을
    // 호출해 빈 제목 가드에 걸려 조용히 아무 일도 일어나지 않는다.
    await screen.findByDisplayValue("새 할 일");

    await act(async () => {
      fireEvent.press(screen.getByText("추가"));
    });

    expect(await screen.findByText("네트워크 오류")).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  // design/spec.md "TodoFormScreen — 펼침(더보기)" 절: "더보기"를 누르면 설명/우선순위/
  // 시작일시/만료일시가 나타난다(웹 DetailSection과 동일한 정보 위계).
  it("더보기를 누르면 설명/우선순위/날짜 필드가 나타난다", async () => {
    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    expect(screen.queryByPlaceholderText("상세 설명을 입력하세요")).toBeNull();

    // ScrollView 하위에서의 상태 갱신은 act(async)로 감싸야 다음 조회에 반영된다
    // (RN Modal과 마찬가지로 이 테스트 환경의 act() 플러시 타이밍 특성).
    await act(async () => {
      fireEvent.press(screen.getByText("더보기"));
    });

    expect(screen.getByPlaceholderText("상세 설명을 입력하세요")).toBeTruthy();
    expect(screen.getByText("낮음")).toBeTruthy();
    expect(screen.getByText("보통")).toBeTruthy();
    expect(screen.getByText("높음")).toBeTruthy();
    expect(screen.getByText("시작일시")).toBeTruthy();
    expect(screen.getByText("만료일시")).toBeTruthy();
  });

  // 의사결정 확정 1번(design/spec.md): <select> 대신 3-세그먼트 칩.
  it("우선순위 칩을 선택하면 선택 상태가 바뀐다", async () => {
    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("더보기"));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("우선순위 높음"));
    });

    expect(screen.getByLabelText("우선순위 높음").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("우선순위 보통").props.accessibilityState.selected).toBe(false);
  });

  it("route.params.parentId가 있으면 그 부모 밑에 생성 요청을 보낸다", async () => {
    mockRouteParams = { parentId: "root-1" };

    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "하위 할 일");
    await screen.findByDisplayValue("하위 할 일");

    await act(async () => {
      fireEvent.press(screen.getByText("추가"));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "root-1" }),
    );
  });

  it("route.params.dueAt이 있으면 그 값을 dueAt으로 채워 생성 요청을 보낸다", async () => {
    mockRouteParams = { dueAt: "2026-06-18T00:00:00.000Z" };

    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);

    // dueAt이 프리필되면 "더보기"를 누르지 않아도 날짜 필드가 바로 보여야 한다.
    expect(screen.getByText("만료일시")).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "프리필 할 일");
    await screen.findByDisplayValue("프리필 할 일");

    await act(async () => {
      fireEvent.press(screen.getByText("추가"));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ dueAt: "2026-06-18T00:00:00.000Z" }),
    );
  });

  describe("반복 설정", () => {
    const openAndSetStart = async () => {
      const { TodoFormScreen } = await import("../TodoFormScreen");
      await render(<TodoFormScreen />);
      await fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "반복 할 일");
      await screen.findByDisplayValue("반복 할 일");
      await fireEvent.press(screen.getByText("더보기"));
      await fireEvent.press(screen.getByText("시작일시 설정"));
    };
    const toggleRecurrence = async () => {
      await fireEvent(screen.getByLabelText("이 할 일을 반복합니다"), "valueChange", true);
    };

    it("parentId가 있으면 반복 섹션을 렌더링하지 않는다", async () => {
      mockRouteParams = { parentId: "root-1" };
      const { TodoFormScreen } = await import("../TodoFormScreen");
      await render(<TodoFormScreen />);
      await fireEvent.press(screen.getByText("더보기"));

      expect(screen.queryByText("이 할 일을 반복합니다")).toBeNull();
    });

    it("시작일시를 정하고 반복을 켜서 저장하면 createRecurringTodo만 호출한다", async () => {
      mockCreateRecurring.mockResolvedValue([]);
      await openAndSetStart();
      await toggleRecurrence();
      await fireEvent.press(screen.getByText("추가"));

      expect(mockCreateRecurring).toHaveBeenCalledTimes(1);
      expect(mockCreateRecurring).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "반복 할 일",
          startAt: "2026-11-10T01:00:00.000Z",
          parentId: null,
          recurrence: { type: "daily", endType: "indefinite", endDate: null },
        }),
      );
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it("오늘 탭이 만료일시를 자정으로 채워도 반복을 켜 저장하면 날짜 검증 오류 없이 무기한으로 생성된다", async () => {
      // 시작(11/10 10:00 KST)보다 앞선 마감(11/10 00:00 KST). 숨긴 값이라 검증하지 않는다.
      mockRouteParams = { dueAt: "2026-11-09T15:00:00.000Z" };
      mockCreateRecurring.mockResolvedValue([]);
      const { TodoFormScreen } = await import("../TodoFormScreen");
      await render(<TodoFormScreen />);
      await fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "반복 할 일");
      await screen.findByDisplayValue("반복 할 일");
      await fireEvent.press(screen.getByText("시작일시 설정"));
      await toggleRecurrence();
      await fireEvent.press(screen.getByText("추가"));

      expect(screen.queryByText("시작일시는 마감일시보다 늦을 수 없습니다")).toBeNull();
      expect(mockCreateRecurring).toHaveBeenCalledTimes(1);
      expect(mockCreateRecurring).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: { type: "daily", endType: "indefinite", endDate: null } }),
      );
    });

    it("반복을 켜면 만료일시 필드가 숨고, 끄면 프리필 값 그대로 다시 보인다", async () => {
      mockRouteParams = { dueAt: "2026-11-09T15:00:00.000Z" };
      const { TodoFormScreen } = await import("../TodoFormScreen");
      await render(<TodoFormScreen />);
      await fireEvent.press(screen.getByText("시작일시 설정"));
      expect(screen.getByText("만료일시 값: 2026-11-09T15:00:00.000Z")).toBeTruthy();

      await toggleRecurrence();
      expect(screen.queryByText("만료일시")).toBeNull();

      await fireEvent(screen.getByLabelText("이 할 일을 반복합니다"), "valueChange", false);
      expect(screen.getByText("만료일시")).toBeTruthy();
      expect(screen.getByText("만료일시 값: 2026-11-09T15:00:00.000Z")).toBeTruthy();
    });

    it("날짜 지정을 고르고 종료일을 비운 채 저장하면 '종료일을 선택해주세요'로 막힌다", async () => {
      await openAndSetStart();
      await toggleRecurrence();
      await fireEvent.press(screen.getByRole("radio", { name: "반복 종료 날짜 지정" }));
      await fireEvent.press(screen.getByText("추가"));

      expect((await screen.findAllByText("종료일을 선택해주세요")).length).toBeGreaterThan(0);
      expect(mockCreateRecurring).not.toHaveBeenCalled();
    });

    it("반복을 켠 뒤 시작일시를 지우면 일반 createTodo 경로로 저장한다", async () => {
      mockMutateAsync.mockResolvedValue("id");
      await openAndSetStart();
      await toggleRecurrence();
      await fireEvent.press(screen.getByText("시작일시 해제"));
      await fireEvent.press(screen.getByText("추가"));

      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockCreateRecurring).not.toHaveBeenCalled();
    });

    it("매주 반복에 요일이 없으면 에러를 보여 주고 아무 mutation도 호출하지 않는다", async () => {
      await openAndSetStart();
      await toggleRecurrence();
      await fireEvent.press(screen.getByLabelText("반복 주기 매주"));
      await fireEvent.press(screen.getByText("추가"));

      expect((await screen.findAllByText("요일을 하나 이상 선택해주세요")).length).toBeGreaterThan(0);
      expect(mockCreateRecurring).not.toHaveBeenCalled();
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it("반복 저장 중에는 저장을 두 번 눌러도 한 번만 호출한다", async () => {
      mockCreateRecurring.mockReturnValue(new Promise(() => {}));
      await openAndSetStart();
      await toggleRecurrence();
      // 끝나지 않는 mutation을 시작하는 press는 handler 완료를 기다리면 멈추므로
      // act 안에서 시작만 하고 pending 리렌더가 반영된 뒤 두 번째 press를 보낸다.
      await act(async () => {
        void fireEvent.press(screen.getByText("추가"));
      });
      await act(async () => {
        void fireEvent.press(screen.getByLabelText("추가 중..."));
      });

      expect(mockCreateRecurring).toHaveBeenCalledTimes(1);
    });

    it("반복 추가를 같은 틱에 두 번 눌러도 createRecurringTodo는 한 번만 호출된다", async () => {
      mockCreateRecurring.mockReturnValue(new Promise(() => {}));
      await openAndSetStart();
      await toggleRecurrence();
      const button = screen.getByText("추가");
      await act(async () => {
        void fireEvent.press(button);
        void fireEvent.press(button);
      });

      expect(mockCreateRecurring).toHaveBeenCalledTimes(1);
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it("반복 경로에는 order를 넘기지 않는다(core가 루트 order를 직접 계산)", async () => {
      mockUseTodos.mockReturnValue({ data: [{ id: "a", parentId: null, order: 3 }] });
      mockCreateRecurring.mockResolvedValue([]);
      await openAndSetStart();
      await toggleRecurrence();
      await fireEvent.press(screen.getByText("추가"));

      expect(mockCreateRecurring).toHaveBeenCalledTimes(1);
      expect(mockCreateRecurring.mock.calls[0][0]).not.toHaveProperty("order");
    });
  });

  it("추가를 같은 틱에 두 번 눌러도 createTodo는 한 번만 호출된다", async () => {
    mockMutateAsync.mockReturnValue(new Promise(() => {}));
    const { TodoFormScreen } = await import("../TodoFormScreen");
    await render(<TodoFormScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText("할 일 제목"), "일반 할 일");
    await screen.findByDisplayValue("일반 할 일");
    const button = screen.getByText("추가");
    await act(async () => {
      void fireEvent.press(button);
      void fireEvent.press(button);
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});
