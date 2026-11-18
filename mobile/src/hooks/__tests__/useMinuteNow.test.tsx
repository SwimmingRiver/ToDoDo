import { renderHook, act } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { useMinuteNow } from "../useMinuteNow";

describe("useMinuteNow", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // RN 테스트 환경은 자체 타이머가 있어 getTimerCount()로는 셀 수 없다 — 호출을 직접 센다.
  it("여러 컴포넌트가 구독해도 타이머는 하나만 돈다", async () => {
    const setSpy = jest.spyOn(global, "setInterval");
    const a = await renderHook(() => useMinuteNow());
    const b = await renderHook(() => useMinuteNow());
    expect(setSpy.mock.calls.filter(([, ms]) => ms === 60_000)).toHaveLength(1);
    await a.unmount();
    await b.unmount();
    setSpy.mockRestore();
  });

  it("1분이 지나면 새 현재 시각을 돌려준다", async () => {
    const { result, unmount } = await renderHook(() => useMinuteNow());
    const before = result.current.getTime();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.getTime() - before).toBe(60_000);
    await unmount();
  });

  it("마지막 구독자가 unmount되면 타이머가 정리된다", async () => {
    const clearSpy = jest.spyOn(global, "clearInterval");
    const a = await renderHook(() => useMinuteNow());
    const b = await renderHook(() => useMinuteNow());
    await a.unmount();
    expect(clearSpy).not.toHaveBeenCalled();
    await b.unmount();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});
