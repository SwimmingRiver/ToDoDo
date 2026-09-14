import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEntitlement } from "../useEntitlement";
import { useIsPremium } from "../useIsPremium";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("../../api", () => ({ getEntitlement: vi.fn() }));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getEntitlement 결과를 그대로 반환한다", async () => {
    const { getEntitlement } = await import("../../api");
    vi.mocked(getEntitlement).mockResolvedValue({
      plan: "premium",
      status: "active",
      source: "manual",
      currentPeriodEnd: null,
      customerId: null,
      subscriptionId: null,
      lastWebhookEventId: null,
      updatedAt: "2026-09-14T00:00:00.000Z",
    });

    const { result } = renderHook(() => useEntitlement(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.plan).toBe("premium");
  });
});

describe("useIsPremium", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("plan이 premium이고 status가 active면 true를 반환한다", async () => {
    const { getEntitlement } = await import("../../api");
    vi.mocked(getEntitlement).mockResolvedValue({
      plan: "premium",
      status: "active",
      source: "manual",
      currentPeriodEnd: null,
      customerId: null,
      subscriptionId: null,
      lastWebhookEventId: null,
      updatedAt: "2026-09-14T00:00:00.000Z",
    });

    const { result } = renderHook(() => useIsPremium(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPremium).toBe(true);
  });

  it("plan이 premium이고 status가 trialing이어도 true를 반환한다", async () => {
    const { getEntitlement } = await import("../../api");
    vi.mocked(getEntitlement).mockResolvedValue({
      plan: "premium",
      status: "trialing",
      source: "manual",
      currentPeriodEnd: null,
      customerId: null,
      subscriptionId: null,
      lastWebhookEventId: null,
      updatedAt: "2026-09-14T00:00:00.000Z",
    });

    const { result } = renderHook(() => useIsPremium(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPremium).toBe(true);
  });

  it("plan이 free면 false를 반환한다", async () => {
    const { getEntitlement } = await import("../../api");
    vi.mocked(getEntitlement).mockResolvedValue({
      plan: "free",
      status: "none",
      source: null,
      currentPeriodEnd: null,
      customerId: null,
      subscriptionId: null,
      lastWebhookEventId: null,
      updatedAt: "",
    });

    const { result } = renderHook(() => useIsPremium(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPremium).toBe(false);
  });

  it("premium이지만 status가 canceled면 false를 반환한다", async () => {
    const { getEntitlement } = await import("../../api");
    vi.mocked(getEntitlement).mockResolvedValue({
      plan: "premium",
      status: "canceled",
      source: "manual",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      customerId: null,
      subscriptionId: null,
      lastWebhookEventId: null,
      updatedAt: "2026-09-14T00:00:00.000Z",
    });

    const { result } = renderHook(() => useIsPremium(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPremium).toBe(false);
  });
});
