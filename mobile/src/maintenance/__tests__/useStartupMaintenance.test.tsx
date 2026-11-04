import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { AppState } from "react-native";
import type { ReactNode } from "react";

jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("@tododo/core", () => ({ runStartupMaintenance: jest.fn() }));
jest.mock("../maintenanceSchedule", () => ({
  ...(jest.requireActual("../maintenanceSchedule") as object),
  readLastSuccess: jest.fn(),
  writeLastSuccess: jest.fn(),
}));

import { runStartupMaintenance } from "@tododo/core";
import { readLastSuccess, writeLastSuccess } from "../maintenanceSchedule";
import { useStartupMaintenance, resetStartupMaintenanceState } from "../useStartupMaintenance";

const runMock = runStartupMaintenance as unknown as jest.Mock<(...a: unknown[]) => Promise<unknown>>;
const readMock = readLastSuccess as unknown as jest.Mock<(uid: string) => Promise<number | null>>;
const writeMock = writeLastSuccess as unknown as jest.Mock<(uid: string, ms: number) => Promise<void>>;

const NOW = new Date("2026-11-04T00:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

let listener: (s: string) => void;
let invalidateSpy: jest.SpiedFunction<QueryClient["invalidateQueries"]>;
let wrapper: ({ children }: { children: ReactNode }) => ReactNode;
let errorSpy: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }).setSystemTime(NOW);
  resetStartupMaintenanceState();
  runMock.mockReset().mockResolvedValue({ written: 0, failedSweeps: [] });
  readMock.mockReset().mockResolvedValue(null);
  writeMock.mockReset().mockResolvedValue(undefined);
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, cb: (s: string) => void) => {
    listener = cb;
    return { remove: jest.fn() };
  }) as never);
  const client = new QueryClient();
  invalidateSpy = jest.spyOn(client, "invalidateQueries");
  wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const foreground = async () => {
  await act(async () => { listener("active"); });
  await flush();
};

describe("useStartupMaintenance", () => {
  it("마운트 시 한 번 실행되고 같은 uid 재마운트에서는 실행되지 않는다", async () => {
    const first = await renderHook(() => useStartupMaintenance("a"), { wrapper });
    await flush();
    expect(runMock).toHaveBeenCalledTimes(1);
    await first.unmount();
    await renderHook(() => useStartupMaintenance("a"), { wrapper });
    await flush();
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("uid가 null이면 실행하지 않는다", async () => {
    await renderHook(() => useStartupMaintenance(null), { wrapper });
    await flush();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("포그라운드 복귀: 1시간 전 성공이면 실행 안 하고 25시간 전이면 실행한다", async () => {
    await renderHook(() => useStartupMaintenance("a"), { wrapper });
    await flush();
    runMock.mockClear();
    readMock.mockResolvedValue(NOW - HOUR);
    await foreground();
    expect(runMock).not.toHaveBeenCalled();
    readMock.mockResolvedValue(NOW - 25 * HOUR);
    await foreground();
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("실패한 스윕이 있으면 시각을 기록하지 않고, 없으면 기록한다", async () => {
    runMock.mockResolvedValue({ written: 0, failedSweeps: ["extension"] });
    await renderHook(() => useStartupMaintenance("a"), { wrapper });
    await flush();
    expect(writeMock).not.toHaveBeenCalled();

    runMock.mockResolvedValue({ written: 0, failedSweeps: [] });
    readMock.mockResolvedValue(null);
    await foreground();
    expect(writeMock).toHaveBeenCalledWith("a", NOW);
  });

  it("written이 0이면 무효화하지 않고 3이면 todos를 무효화한다", async () => {
    await renderHook(() => useStartupMaintenance("a"), { wrapper });
    await flush();
    expect(invalidateSpy).not.toHaveBeenCalled();
    runMock.mockResolvedValue({ written: 3, failedSweeps: [] });
    await foreground();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });

  it("reject되어도 throw하지 않고 console.error를 남기며 시각을 갱신하지 않는다", async () => {
    runMock.mockRejectedValue(new Error("boom"));
    await renderHook(() => useStartupMaintenance("a"), { wrapper });
    await flush();
    expect(errorSpy).toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("writeLastSuccess가 reject되어도 throw하지 않는다", async () => {
    writeMock.mockRejectedValue(new Error("storage"));
    await renderHook(() => useStartupMaintenance("a"), { wrapper });
    await flush();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("같은 세션에서 계정이 바뀌면 새 uid로 실행한다", async () => {
    const { rerender } = await renderHook(({ uid }: { uid: string }) => useStartupMaintenance(uid), {
      wrapper,
      initialProps: { uid: "a" },
    });
    await flush();
    await rerender({ uid: "b" });
    await flush();
    expect(runMock).toHaveBeenCalledTimes(2);
    expect(runMock).toHaveBeenLastCalledWith({}, "b", expect.anything());
  });

  it("실행 중 포그라운드 복귀가 와도 겹쳐 실행하지 않는다", async () => {
    let resolve!: (v: unknown) => void;
    runMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    await renderHook(() => useStartupMaintenance("a"), { wrapper });
    await foreground();
    expect(runMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ written: 0, failedSweeps: [] }); });
    await flush();
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
