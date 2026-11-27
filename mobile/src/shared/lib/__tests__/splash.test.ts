import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockPrevent = jest.fn<() => Promise<boolean>>();
const mockHide = jest.fn();
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: () => mockPrevent(),
  hide: () => mockHide(),
}));

// resetModules·isolateModules로 매번 새로 불러오므로 Sentry 목 인스턴스도 바뀐다 — 모듈 밖 jest.fn으로 받는다.
const mockLifecycle = jest.fn();
jest.mock("../sentry", () => ({
  addLifecycleBreadcrumb: (...args: unknown[]) => mockLifecycle(...args),
}));
const stages = () => mockLifecycle.mock.calls;

describe("splash", () => {
  beforeEach(() => {
    jest.resetModules();
    mockPrevent.mockReset().mockResolvedValue(true);
    mockHide.mockReset();
    mockLifecycle.mockClear();
    jest.useFakeTimers();
  });

  it("스플래시 유지 시작과 숨김(준비 신호)을 breadcrumb으로 남기고, 숨김은 한 번만 남긴다", () => {
    jest.isolateModules(() => {
      const { hideSplash } = require("../splash") as typeof import("../splash");
      hideSplash();
      hideSplash();
    });
    expect(stages()).toEqual([["splash_hold"], ["splash_hide", { reason: "ready" }]]);
  });

  it("안전 시간으로 숨기면 reason이 failsafe다(로그인 확정이 늦었다는 신호)", () => {
    jest.isolateModules(() => {
      const { SPLASH_FAILSAFE_MS } = require("../splash") as typeof import("../splash");
      jest.advanceTimersByTime(SPLASH_FAILSAFE_MS);
    });
    expect(stages()).toContainEqual(["splash_hide", { reason: "failsafe" }]);
  });

  it("불러오는 즉시 자동 숨김을 막는다", () => {
    jest.isolateModules(() => {
      require("../splash");
    });
    expect(mockPrevent).toHaveBeenCalledTimes(1);
  });

  it("hideSplash는 여러 번 불러도 한 번만 숨긴다", () => {
    jest.isolateModules(() => {
      const { hideSplash } = require("../splash") as typeof import("../splash");
      hideSplash();
      hideSplash();
    });
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it("앱이 준비 신호를 못 보내도 안전 시간이 지나면 숨긴다", () => {
    jest.isolateModules(() => {
      const { SPLASH_FAILSAFE_MS } = require("../splash") as typeof import("../splash");
      jest.advanceTimersByTime(SPLASH_FAILSAFE_MS - 1);
      expect(mockHide).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
    });
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it("자동 숨김 막기가 실패해도 예외를 밖으로 던지지 않는다", async () => {
    mockPrevent.mockRejectedValue(new Error("no native module"));
    await expect(
      (async () => {
        jest.isolateModules(() => {
          require("../splash");
        });
        await Promise.resolve();
      })(),
    ).resolves.toBeUndefined();
  });
});
