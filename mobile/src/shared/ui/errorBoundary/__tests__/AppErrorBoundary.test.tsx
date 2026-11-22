import { Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { AppErrorBoundary } from "../AppErrorBoundary";

const sentry = jest.requireMock("@sentry/react-native") as { captureException: jest.Mock };

const AlwaysThrows = () => {
  throw new Error("render boom");
};

describe("AppErrorBoundary", () => {
  let consoleError: ReturnType<typeof jest.spyOn>;
  beforeEach(() => {
    sentry.captureException.mockReset();
    // React가 잡힌 렌더 오류를 console.error로 찍는 것을 테스트 출력에서 가린다.
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("자식이 렌더 중 던지면 대체 화면을 보이고 componentStack과 함께 보고한다", async () => {
    await render(
      <AppErrorBoundary>
        <AlwaysThrows />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("문제가 발생했습니다")).toBeTruthy();
    expect(screen.getByText("다시 시도")).toBeTruthy();
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      contexts: { react: { componentStack: expect.any(String) } },
    });
  });

  it("다시 시도를 누르면 자식을 다시 렌더한다", async () => {
    let shouldThrow = true;
    const ThrowsOnce = () => {
      if (shouldThrow) throw new Error("once");
      return <Text>복구됨</Text>;
    };
    await render(
      <AppErrorBoundary>
        <ThrowsOnce />
      </AppErrorBoundary>,
    );

    shouldThrow = false;
    await fireEvent.press(screen.getByText("다시 시도"));
    expect(screen.getByText("복구됨")).toBeTruthy();
  });

  it("다시 시도 후 또 던지면 대체 화면이 다시 뜬다", async () => {
    await render(
      <AppErrorBoundary>
        <AlwaysThrows />
      </AppErrorBoundary>,
    );

    await fireEvent.press(screen.getByText("다시 시도"));
    expect(screen.getByText("문제가 발생했습니다")).toBeTruthy();
    expect(sentry.captureException).toHaveBeenCalledTimes(2);
  });
});
