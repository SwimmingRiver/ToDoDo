import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Alert } from "react-native";
import { AiPlanError } from "@tododo/core/dist/aiPlan/index.js";

let mockIsPremium = true;
let mockIsLoading = false;
let mockGenerateIsPending = false;
let mockCreateIsPending = false;
jest.mock("../../premium", () => ({
  useIsPremium: () => ({ isPremium: mockIsPremium, isLoading: mockIsLoading }),
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockSetOptions = jest.fn();
// usePreventRemove(flag, cb)의 가장 최근 인자를 잡는다. 실제 훅은 flag가 true인 동안 항상 막는다.
type PreventCb = (o: { data: { action: unknown } }) => void;
let preventFlag: boolean | undefined;
let preventCb: PreventCb | undefined;
let flagAtGoBack: boolean | undefined;
let flagAtDispatch: boolean | undefined;
// useNavigation이 렌더마다 같은 객체를 돌려줘야 effect가 다시 돌지 않는다(실제 react-navigation도 동일).
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  dispatch: mockDispatch,
  setOptions: mockSetOptions,
};
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  usePreventRemove: (flag: boolean, cb: PreventCb) => {
    preventFlag = flag;
    preventCb = cb;
  },
}));

type Callbacks = { onSuccess?: (r: unknown) => void; onError?: (e: Error) => void; onSettled?: () => void };
const mockGenerateMutate = jest.fn<(input: unknown, cb: Callbacks) => void>();
const mockCreateMutate = jest.fn<(input: unknown, cb: Callbacks) => void>();
// 실제 훅은 reducer를 쓰므로 core의 reducer를 그대로 쓴다.
jest.mock("../../aiPlan", () => {
  const { useReducer } = require("react");
  const core = require("@tododo/core/dist/aiPlan/index.js");
  return {
    useGeneratePlan: () => ({ mutate: mockGenerateMutate, isPending: mockGenerateIsPending }),
    useCreatePlanTodos: () => ({ mutate: mockCreateMutate, isPending: mockCreateIsPending }),
    usePlanDraft: () => {
      const [draft, dispatch] = useReducer(core.planDraftReducer, core.EMPTY_DRAFT);
      return { draft, dispatch };
    },
  };
});

// 네이티브 피커 대신 값만 보여주는 스텁
jest.mock("../../shared/ui/dateField/DateField", () => {
  const { Text } = require("react-native");
  return {
    DateField: ({ label, value }: { label: string; value: string | null }) => (
      <Text>{`${label}: ${value ?? "없음"}`}</Text>
    ),
  };
});

const PLAN = {
  plan: {
    title: "이사 준비",
    dueDate: null,
    items: [
      { title: "박스 구하기", dueDate: "2026-11-25", priority: "medium" },
      { title: "업체 예약", dueDate: "2020-01-01", priority: "high" },
    ],
  },
  usage: { used: 3, limit: 20 },
};

const generateAndPreview = async () => {
  const { AiPlanScreen } = await import("../AiPlanScreen");
  await render(<AiPlanScreen />);
  await fireEvent.changeText(screen.getByLabelText("목표"), "이사 준비");
  await fireEvent.press(screen.getByText("계획 만들기"));
  await act(async () => {
    // 실제 useMutation처럼 성공 뒤 onSettled도 호출해 진행 중 ref를 푼다.
    mockGenerateMutate.mock.calls[0][1].onSuccess?.(PLAN);
    mockGenerateMutate.mock.calls[0][1].onSettled?.();
  });
};

describe("AiPlanScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date(2026, 10, 20, 12, 0, 0),
      doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask"],
    });
    mockIsPremium = true;
    mockIsLoading = false;
    mockNavigate.mockReset();
    mockGoBack.mockReset();
    mockDispatch.mockReset();
    mockSetOptions.mockReset();
    preventFlag = undefined;
    preventCb = undefined;
    flagAtGoBack = undefined;
    flagAtDispatch = undefined;
    mockGoBack.mockImplementation(() => { flagAtGoBack = preventFlag; });
    mockDispatch.mockImplementation(() => { flagAtDispatch = preventFlag; });
    mockGenerateIsPending = false;
    mockCreateIsPending = false;
    mockGenerateMutate.mockReset();
    mockCreateMutate.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("무료면 잠금 안내가 보이고 「구독 알아보기」가 Account로 이동", async () => {
    mockIsPremium = false;
    const { AiPlanScreen } = await import("../AiPlanScreen");
    await render(<AiPlanScreen />);
    expect(screen.getByText("AI 할 일 플랜은 프리미엄 기능입니다")).toBeTruthy();
    await fireEvent.press(screen.getByText("구독 알아보기"));
    expect(mockNavigate).toHaveBeenCalledWith("Account");
  });

  it("프리미엄이면 목표 단계, 빈 목표면 「계획 만들기」 비활성", async () => {
    const { AiPlanScreen } = await import("../AiPlanScreen");
    await render(<AiPlanScreen />);
    expect(screen.getByText("AI로 계획 만들기")).toBeTruthy();
    expect(screen.getByRole("button", { name: "계획 만들기" }).props.accessibilityState.disabled).toBe(true);
  });

  it("계획 만들기 → mutate({ goal, dueDate: null, today })", async () => {
    const { AiPlanScreen } = await import("../AiPlanScreen");
    await render(<AiPlanScreen />);
    await fireEvent.changeText(screen.getByLabelText("목표"), "  이사 준비 ");
    await fireEvent.press(screen.getByText("계획 만들기"));
    expect(mockGenerateMutate).toHaveBeenCalledTimes(1);
    expect(mockGenerateMutate.mock.calls[0][0]).toEqual({ goal: "이사 준비", dueDate: null, today: "2026-11-20" });
  });

  it("생성 성공 → 미리보기에 상위 제목·항목·사용량이 보이고 「2개 추가」", async () => {
    await generateAndPreview();
    expect(screen.getByDisplayValue("이사 준비")).toBeTruthy();
    expect(screen.getByDisplayValue("박스 구하기")).toBeTruthy();
    expect(screen.getByText("오늘 3/20회")).toBeTruthy();
    expect(screen.getByText("2개 추가")).toBeTruthy();
  });

  it("AI가 과거 날짜 항목을 줘도 미리보기에 그대로 표시", async () => {
    await generateAndPreview();
    expect(screen.getByText("업체 예약 마감일: 2020-01-01")).toBeTruthy();
  });

  it("생성 실패 DAILY_LIMIT → Alert, 목표 입력 유지", async () => {
    const { AiPlanScreen } = await import("../AiPlanScreen");
    await render(<AiPlanScreen />);
    await fireEvent.changeText(screen.getByLabelText("목표"), "이사 준비");
    await fireEvent.press(screen.getByText("계획 만들기"));
    await act(async () => {
      mockGenerateMutate.mock.calls[0][1].onError?.(new AiPlanError("DAILY_LIMIT", 429));
    });
    expect(Alert.alert).toHaveBeenCalledWith("오늘 사용 횟수를 다 썼어요", "내일 다시 시도해 주세요");
    expect(screen.getByDisplayValue("이사 준비")).toBeTruthy();
  });

  it("생성 실패 PREMIUM_REQUIRED → 잠금 전환, isPremium=true로 다시 렌더해도 잠금 유지", async () => {
    const { AiPlanScreen } = await import("../AiPlanScreen");
    const view = await render(<AiPlanScreen />);
    await fireEvent.changeText(screen.getByLabelText("목표"), "이사 준비");
    await fireEvent.press(screen.getByText("계획 만들기"));
    await act(async () => {
      mockGenerateMutate.mock.calls[0][1].onError?.(new AiPlanError("PREMIUM_REQUIRED", 403));
    });
    expect(screen.getByText("AI 할 일 플랜은 프리미엄 기능입니다")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    await view.rerender(<AiPlanScreen />);
    expect(screen.getByText("AI 할 일 플랜은 프리미엄 기능입니다")).toBeTruthy();
  });

  it("구독 전 403으로 잠긴 뒤 isPremium이 false→true가 되면 목표 단계로 돌아온다", async () => {
    const { AiPlanScreen } = await import("../AiPlanScreen");
    const view = await render(<AiPlanScreen />);
    await fireEvent.changeText(screen.getByLabelText("목표"), "이사 준비");
    await fireEvent.press(screen.getByText("계획 만들기"));
    mockIsPremium = false;
    await view.rerender(<AiPlanScreen />);
    await act(async () => {
      mockGenerateMutate.mock.calls[0][1].onError?.(new AiPlanError("PREMIUM_REQUIRED", 403));
      mockGenerateMutate.mock.calls[0][1].onSettled?.();
    });
    expect(screen.getByText("AI 할 일 플랜은 프리미엄 기능입니다")).toBeTruthy();
    mockIsPremium = true;
    await view.rerender(<AiPlanScreen />);
    expect(screen.getByText("AI로 계획 만들기")).toBeTruthy();
  });

  it("프리미엄이던 사용자가 isPremium=false로 바뀌면 잠금", async () => {
    const { AiPlanScreen } = await import("../AiPlanScreen");
    const view = await render(<AiPlanScreen />);
    mockIsPremium = false;
    await view.rerender(<AiPlanScreen />);
    expect(screen.getByText("AI 할 일 플랜은 프리미엄 기능입니다")).toBeTruthy();
  });

  it("「계획 만들기」 같은 틱 2회 탭 → mutate 1회", async () => {
    const { AiPlanScreen } = await import("../AiPlanScreen");
    await render(<AiPlanScreen />);
    await fireEvent.changeText(screen.getByLabelText("목표"), "이사 준비");
    const button = screen.getByText("계획 만들기");
    await act(async () => {
      await fireEvent.press(button);
      await fireEvent.press(button);
    });
    expect(mockGenerateMutate).toHaveBeenCalledTimes(1);
  });

  it("「2개 추가」 2회 탭 → mutate 1회, 성공 → Alert + goBack", async () => {
    await generateAndPreview();
    const button = screen.getByText("2개 추가");
    await act(async () => {
      await fireEvent.press(button);
      await fireEvent.press(button);
    });
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockCreateMutate.mock.calls[0][1].onSuccess?.({ parentId: "p", count: 3 });
    });
    expect(Alert.alert).toHaveBeenCalledWith("계획 추가 완료", "할 일 2개를 추가했어요");
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it("추가 실패 → Alert, 화면 유지", async () => {
    await generateAndPreview();
    await fireEvent.press(screen.getByText("2개 추가"));
    await act(async () => {
      mockCreateMutate.mock.calls[0][1].onError?.(new Error("x"));
    });
    expect(Alert.alert).toHaveBeenCalledWith("추가하지 못했어요", "잠시 후 다시 시도해 주세요");
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it("항목 체크 전부 해제 → 추가 버튼 비활성", async () => {
    await generateAndPreview();
    await fireEvent.press(screen.getByLabelText("박스 구하기 포함"));
    await fireEvent.press(screen.getByLabelText("업체 예약 포함"));
    expect(screen.getByRole("button", { name: "0개 추가" }).props.accessibilityState.disabled).toBe(true);
  });

  it("dirty에서 다시 만들기 → 확인 Alert, 「다시 만들기」 선택 시 직전 입력으로 mutate", async () => {
    await generateAndPreview();
    await fireEvent.changeText(screen.getByDisplayValue("박스 구하기"), "박스 사기");
    await fireEvent.press(screen.getByText("다시 만들기"));
    expect(mockGenerateMutate).toHaveBeenCalledTimes(1); // 아직 재요청 안 함
    const alertCall = (Alert.alert as jest.Mock).mock.calls.at(-1) as unknown as [string, string, { text: string; onPress?: () => void }[]];
    expect(alertCall[0]).toBe("수정한 내용이 사라져요");
    await act(async () => {
      alertCall[2].find((b) => b.text === "다시 만들기")!.onPress!();
    });
    expect(mockGenerateMutate).toHaveBeenCalledTimes(2);
    expect(mockGenerateMutate.mock.calls[1][0]).toEqual({ goal: "이사 준비", dueDate: null, today: "2026-11-20" });
  });

  it("자정을 넘긴 뒤 다시 만들기는 현재 날짜(today)로 재요청한다", async () => {
    jest.setSystemTime(new Date(2026, 10, 20, 23, 55));
    await generateAndPreview();
    jest.setSystemTime(new Date(2026, 10, 21, 0, 5));
    const { AiPlanScreen } = await import("../AiPlanScreen");
    await screen.rerender(<AiPlanScreen />);
    await fireEvent.press(screen.getByText("다시 만들기"));
    expect(mockGenerateMutate).toHaveBeenCalledTimes(2);
    expect(mockGenerateMutate.mock.calls[1][0]).toEqual({ goal: "이사 준비", dueDate: null, today: "2026-11-21" });
  });

  it("생성 실패 뒤 「계획 만들기」를 다시 누르면 mutate 2회", async () => {
    const { AiPlanScreen } = await import("../AiPlanScreen");
    await render(<AiPlanScreen />);
    await fireEvent.changeText(screen.getByLabelText("목표"), "이사 준비");
    await fireEvent.press(screen.getByText("계획 만들기"));
    await act(async () => {
      mockGenerateMutate.mock.calls[0][1].onError?.(new AiPlanError("DAILY_LIMIT", 429));
      mockGenerateMutate.mock.calls[0][1].onSettled?.();
    });
    await fireEvent.press(screen.getByText("계획 만들기"));
    expect(mockGenerateMutate).toHaveBeenCalledTimes(2);
  });

  it("저장 실패 뒤 「2개 추가」를 다시 누르면 mutate 2회", async () => {
    await generateAndPreview();
    await fireEvent.press(screen.getByText("2개 추가"));
    await act(async () => {
      mockCreateMutate.mock.calls[0][1].onError?.(new Error("x"));
      mockCreateMutate.mock.calls[0][1].onSettled?.();
    });
    await fireEvent.press(screen.getByText("2개 추가"));
    expect(mockCreateMutate).toHaveBeenCalledTimes(2);
  });

  it("생성 중 목표 단계: 버튼이 「계획을 짜는 중…」이고 비활성", async () => {
    mockGenerateIsPending = true;
    const { AiPlanScreen } = await import("../AiPlanScreen");
    await render(<AiPlanScreen />);
    const button = screen.getByRole("button", { name: "계획을 짜는 중…" });
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it("생성 중 미리보기: 추가 버튼 비활성", async () => {
    await generateAndPreview();
    const { AiPlanScreen } = await import("../AiPlanScreen");
    mockGenerateIsPending = true;
    await screen.rerender(<AiPlanScreen />);
    expect(screen.getByRole("button", { name: "2개 추가" }).props.accessibilityState.disabled).toBe(true);
  });

  describe("이탈 가드 (usePreventRemove)", () => {
    const action = { type: "GO_BACK" };
    const alertArgs = () =>
      ((Alert.alert as jest.Mock).mock.calls.at(-1) as unknown as [string, string, { text: string; onPress?: () => void }[]]);

    it("처음에는 막지 않는다", async () => {
      const { AiPlanScreen } = await import("../AiPlanScreen");
      await render(<AiPlanScreen />);
      expect(preventFlag).toBe(false);
    });

    it("생성 중 → true, 콜백이 불려도 Alert 없음", async () => {
      mockGenerateIsPending = true;
      const { AiPlanScreen } = await import("../AiPlanScreen");
      await render(<AiPlanScreen />);
      expect(preventFlag).toBe(true);
      preventCb!({ data: { action } });
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("저장 중 → true, 콜백이 불려도 Alert 없음", async () => {
      await generateAndPreview();
      const { AiPlanScreen } = await import("../AiPlanScreen");
      mockCreateIsPending = true;
      await screen.rerender(<AiPlanScreen />);
      expect(preventFlag).toBe(true);
      preventCb!({ data: { action } });
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("저장 중에는 제스처·헤더 뒤로가기를 끄고, 끝나면 되돌린다", async () => {
      const { AiPlanScreen } = await import("../AiPlanScreen");
      const view = await render(<AiPlanScreen />);
      mockCreateIsPending = true;
      await view.rerender(<AiPlanScreen />);
      expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false, headerBackVisible: false });
      mockCreateIsPending = false;
      await view.rerender(<AiPlanScreen />);
      expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true, headerBackVisible: true });
    });

    it("미리보기 편집 전 → false, 편집 후 → true", async () => {
      await generateAndPreview();
      expect(preventFlag).toBe(false);
      await fireEvent.changeText(screen.getByDisplayValue("박스 구하기"), "박스 사기");
      expect(preventFlag).toBe(true);
    });

    it("dirty에서 콜백 → 확인 Alert, 「닫기」 → 플래그 false가 된 뒤 원래 action dispatch", async () => {
      await generateAndPreview();
      await fireEvent.changeText(screen.getByDisplayValue("박스 구하기"), "박스 사기");
      await act(async () => {
        preventCb!({ data: { action } });
      });
      const [title, message, buttons] = alertArgs();
      expect(title).toBe("수정한 내용이 사라져요");
      expect(message).toBe("편집한 계획을 저장하지 않고 닫을까요?");
      expect(buttons.map((b) => b.text)).toEqual(["계속 편집", "닫기"]);
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(preventFlag).toBe(true);
      await act(async () => {
        buttons.find((b) => b.text === "닫기")!.onPress!();
      });
      expect(mockDispatch).toHaveBeenCalledWith(action);
      expect(flagAtDispatch).toBe(false);
    });

    it("「계속 편집」은 아무것도 하지 않는다", async () => {
      await generateAndPreview();
      await fireEvent.changeText(screen.getByDisplayValue("박스 구하기"), "박스 사기");
      await act(async () => {
        preventCb!({ data: { action } });
      });
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(preventFlag).toBe(true);
    });

    it("dirty에서 저장 성공 → 플래그 false가 된 뒤 goBack", async () => {
      await generateAndPreview();
      await fireEvent.changeText(screen.getByDisplayValue("박스 구하기"), "박스 사기");
      expect(preventFlag).toBe(true);
      await fireEvent.press(screen.getByText("2개 추가"));
      await act(async () => {
        mockCreateMutate.mock.calls[0][1].onSuccess?.({ parentId: "p", count: 3 });
      });
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(flagAtGoBack).toBe(false);
    });

    it("생성 중에는 제스처·헤더 뒤로가기를 끄고, 끝나면 되돌린다", async () => {
      const { AiPlanScreen } = await import("../AiPlanScreen");
      const view = await render(<AiPlanScreen />);
      expect(mockSetOptions).not.toHaveBeenCalled();
      mockGenerateIsPending = true;
      await view.rerender(<AiPlanScreen />);
      expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false, headerBackVisible: false });
      mockGenerateIsPending = false;
      await view.rerender(<AiPlanScreen />);
      expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true, headerBackVisible: true });
    });
  });
});
