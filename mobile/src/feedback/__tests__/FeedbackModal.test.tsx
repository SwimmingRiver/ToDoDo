import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../firebase", () => ({ auth: {} }));
const mockSubmit = jest.fn<(content: string) => Promise<void>>();
jest.mock("../feedbackProxyApi", () => ({
  submitFeedback: (content: string) => mockSubmit(content),
  FeedbackError: (jest.requireActual("../feedbackProxyApi") as typeof import("../feedbackProxyApi")).FeedbackError,
}));

import { FeedbackModal } from "../FeedbackModal";
import { FeedbackError } from "../feedbackProxyApi";

const PLACEHOLDER = "불편한 점이나 바라는 기능을 자유롭게 적어주세요.";

const renderModal = async (onClose = jest.fn()) => {
  await render(<FeedbackModal visible onClose={onClose} />);
  return onClose;
};

describe("FeedbackModal", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSubmit.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("빈 입력이면 보내기가 비활성이고 카운터는 0/1000이다", async () => {
    await renderModal();
    expect(screen.getByRole("button", { name: "보내기" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("0/1000")).toBeTruthy();
  });

  it("입력창은 1000자로 제한하고 카운터가 갱신된다", async () => {
    await renderModal();
    const input = screen.getByPlaceholderText(PLACEHOLDER);
    expect(input.props.maxLength).toBe(1000);
    await fireEvent.changeText(input, "안녕");
    expect(screen.getByText("2/1000")).toBeTruthy();
    expect(screen.getByRole("button", { name: "보내기" }).props.accessibilityState.disabled).toBe(false);
  });

  it("성공하면 감사 문구를 보이고 1.5초 뒤 onClose를 부른다", async () => {
    mockSubmit.mockResolvedValue();
    const onClose = await renderModal();
    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "좋아요");
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "보내기" }));
    });
    expect(mockSubmit).toHaveBeenCalledWith("좋아요");
    expect(screen.getByText("감사합니다! 의견이 전달되었습니다.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("TOO_FREQUENT 실패는 전용 문구를 보이고 입력을 유지한다", async () => {
    mockSubmit.mockRejectedValue(new FeedbackError("TOO_FREQUENT"));
    await renderModal();
    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "좋아요");
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "보내기" }));
    });
    expect(screen.getByText("잠시 후 다시 보내주세요. 짧은 시간에 너무 많이 보냈어요.")).toBeTruthy();
    expect(screen.getByPlaceholderText(PLACEHOLDER).props.value).toBe("좋아요");
  });

  it("그 외 실패는 일반 문구를 보인다", async () => {
    mockSubmit.mockRejectedValue(new FeedbackError("UNKNOWN"));
    await renderModal();
    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "좋아요");
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "보내기" }));
    });
    expect(screen.getByText("전송에 실패했습니다. 잠시 후 다시 시도해주세요.")).toBeTruthy();
  });

  it("전송 중에는 버튼이 비활성이라 중복 전송되지 않는다", async () => {
    let resolve: () => void = () => {};
    mockSubmit.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    await renderModal();
    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "좋아요");
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "보내기" }));
    });
    expect(screen.getByRole("button", { name: "보내기" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "보내기" }));
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve();
    });
  });

  it("닫기 버튼은 onClose를 부른다", async () => {
    const onClose = await renderModal();
    await fireEvent.press(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
