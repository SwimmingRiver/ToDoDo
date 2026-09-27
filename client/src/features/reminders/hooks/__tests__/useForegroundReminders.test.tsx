import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { subscribeMock, infoMock } = vi.hoisted(() => ({ subscribeMock: vi.fn(), infoMock: vi.fn() }));
vi.mock("../../push/pushClient", () => ({ subscribeForegroundMessages: subscribeMock }));
vi.mock("@/shared/ui/toast/useToast", () => ({ useToast: () => ({ info: infoMock }) }));

import { useForegroundReminders } from "../useForegroundReminders";
import { notifyPushPermissionChanged } from "../../push/pushSupport";

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error 테스트에서 설치한 속성 제거
  delete navigator.serviceWorker;
  subscribeMock.mockReset();
  infoMock.mockReset();
});

describe("useForegroundReminders", () => {
  it("포그라운드 알림을 info 토스트로 보여주고 언마운트 시 구독 해제", async () => {
    const off = vi.fn();
    subscribeMock.mockImplementation(async (handler: (m: { title: string; body: string }) => void) => {
      handler({ title: "보고서", body: "30분 후 마감이에요" });
      return off;
    });
    const { unmount } = renderHook(() => useForegroundReminders());
    await waitFor(() => expect(infoMock).toHaveBeenCalledWith("보고서", "30분 후 마감이에요"));
    unmount();
    expect(off).toHaveBeenCalled();
  });

  it("세션 중 권한이 granted로 바뀌면 다시 구독해 알림을 받는다", async () => {
    const NotificationStub = { permission: "default" as NotificationPermission };
    vi.stubGlobal("Notification", NotificationStub);
    vi.stubGlobal("PushManager", vi.fn());
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });

    let handler: ((m: { title: string; body: string }) => void) | null = null;
    const offDefault = vi.fn();
    const offGranted = vi.fn();
    subscribeMock.mockImplementation(async (h: (m: { title: string; body: string }) => void) => {
      if (NotificationStub.permission !== "granted") return offDefault;
      handler = h;
      return offGranted;
    });

    const { unmount } = renderHook(() => useForegroundReminders());
    await waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(1));
    expect(handler).toBeNull();

    NotificationStub.permission = "granted";
    act(() => notifyPushPermissionChanged());

    await waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(handler).not.toBeNull());
    expect(offDefault).toHaveBeenCalled();
    act(() => handler!({ title: "보고서", body: "30분 후 마감이에요" }));
    expect(infoMock).toHaveBeenCalledWith("보고서", "30분 후 마감이에요");

    unmount();
    expect(offGranted).toHaveBeenCalled();
  });
});
