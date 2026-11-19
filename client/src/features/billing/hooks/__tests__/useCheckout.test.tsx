import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "@/features/entitlement/types";

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock("@/shared", () => ({ useToast: () => toast }));
vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));
vi.mock("@/shared/lib/authorizedFetch", () => ({ authorizedFetch: vi.fn() }));

let entitlement: Entitlement = DEFAULT_ENTITLEMENT;
vi.mock("@/features/entitlement/hooks/useEntitlement", () => ({ useEntitlement: () => ({ data: entitlement }) }));

vi.mock("../../api/billingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/billingApi")>()),
  createCheckout: vi.fn(),
}));

let emitPaddle: ((e: { name: string }) => void) | null = null;
const paddle = { Checkout: { open: vi.fn(), close: vi.fn() } };
vi.mock("../../lib/paddle", () => ({
  loadPaddle: vi.fn(async () => paddle),
  onPaddleEvent: vi.fn((listener: (e: { name: string }) => void) => {
    emitPaddle = listener;
    return () => {
      emitPaddle = null;
    };
  }),
}));

import { BillingApiError, createCheckout } from "../../api/billingApi";
import { CONFIRM_SLOW_MS, useCheckout } from "../useCheckout";

const NOW = new Date("2026-10-10T00:00:00.000Z");
const paddleRecord = (premiumUntil: string) => ({
  status: "active" as const,
  premiumUntil,
  cancelAt: null,
  currentPeriodEnd: premiumUntil,
  autoRenew: true,
  startedAt: null,
  updatedAt: "",
  customerId: "ctm_1",
  subscriptionId: "sub_1",
  lastWebhookEventId: null,
  lastEventOccurredAt: null,
});

describe("useCheckout", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    entitlement = DEFAULT_ENTITLEMENT;
    vi.mocked(createCheckout).mockResolvedValue("txn_1");
  });
  afterEach(() => vi.useRealTimers());

  it("연타해도 /checkout은 한 번만 부른다", async () => {
    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      void result.current.start();
      void result.current.start();
    });
    expect(createCheckout).toHaveBeenCalledTimes(1);
    expect(paddle.Checkout.open).toHaveBeenCalledWith({ transactionId: "txn_1" });
  });

  it("결제 완료 → 확인 중 → 문서가 active가 되면 성공 토스트", async () => {
    const { result, rerender } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitPaddle?.({ name: "checkout.completed" }));
    expect(result.current.phase).toBe("confirming");
    expect(paddle.Checkout.close).toHaveBeenCalled();

    entitlement = {
      ...DEFAULT_ENTITLEMENT,
      status: "active",
      source: "paddle",
      premiumUntil: "2026-11-13T00:00:00.000Z",
      sources: { paddle: paddleRecord("2026-11-13T00:00:00.000Z") },
    };
    rerender();
    expect(result.current.phase).toBe("idle");
    expect(toast.success).toHaveBeenCalledWith("프리미엄이 시작됐어요", expect.any(String));
  });

  it("더 오래 가는 운영자 부여가 대표 출처로 남아도 Paddle 기록이 생기면 성공으로 본다", async () => {
    const MANUAL_UNTIL = "2027-06-01T00:00:00.000Z";
    const manual = { status: "active" as const, premiumUntil: MANUAL_UNTIL, cancelAt: null, currentPeriodEnd: null, autoRenew: false, startedAt: null, updatedAt: "" };
    entitlement = { ...DEFAULT_ENTITLEMENT, status: "active", source: "manual", premiumUntil: MANUAL_UNTIL, sources: { manual } };
    const { result, rerender } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitPaddle?.({ name: "checkout.completed" }));
    rerender();
    expect(result.current.phase).toBe("confirming");

    entitlement = { ...entitlement, sources: { manual, paddle: paddleRecord("2026-11-13T00:00:00.000Z") } };
    rerender();
    expect(result.current.phase).toBe("idle");
    expect(toast.success).toHaveBeenCalledWith("프리미엄이 시작됐어요", expect.any(String));
  });

  it("해지됐거나 기간이 지난 Paddle 기록으로는 성공으로 보지 않는다", async () => {
    const { result, rerender } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitPaddle?.({ name: "checkout.completed" }));
    entitlement = { ...DEFAULT_ENTITLEMENT, sources: { paddle: { ...paddleRecord("2026-11-13T00:00:00.000Z"), status: "canceled" } } };
    rerender();
    expect(result.current.phase).toBe("confirming");
    entitlement = { ...DEFAULT_ENTITLEMENT, sources: { paddle: paddleRecord("2026-10-01T00:00:00.000Z") } };
    rerender();
    expect(result.current.phase).toBe("confirming");
  });

  it("30초 안에 반영되지 않으면 slow로 바뀌고 실패로 끝내지 않는다", async () => {
    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitPaddle?.({ name: "checkout.completed" }));
    await act(async () => {
      vi.advanceTimersByTime(CONFIRM_SLOW_MS + 1);
    });
    expect(result.current.phase).toBe("slow");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("결제창을 닫으면 idle로 돌아간다", async () => {
    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitPaddle?.({ name: "checkout.closed" }));
    expect(result.current.phase).toBe("idle");
  });

  it("403 NOT_ALLOWED면 준비 중 안내, 그 외 오류는 실패 토스트", async () => {
    vi.mocked(createCheckout).mockRejectedValueOnce(new BillingApiError(403, "NOT_ALLOWED"));
    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.start();
    });
    expect(toast.info).toHaveBeenCalledWith("아직 준비 중이에요", expect.any(String));
    expect(result.current.phase).toBe("idle");

    vi.mocked(createCheckout).mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      await result.current.start();
    });
    expect(toast.error).toHaveBeenCalledWith("결제창을 열지 못했어요", expect.any(String));
  });
});
