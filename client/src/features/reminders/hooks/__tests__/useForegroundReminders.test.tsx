import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { subscribeMock, infoMock } = vi.hoisted(() => ({ subscribeMock: vi.fn(), infoMock: vi.fn() }));
vi.mock("../../push/pushClient", () => ({ subscribeForegroundMessages: subscribeMock }));
vi.mock("@/shared/ui/toast/useToast", () => ({ useToast: () => ({ info: infoMock }) }));

import { useForegroundReminders } from "../useForegroundReminders";

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
});
