import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { EMPTY_ENTITLEMENT } from "@tododo/core/dist/entitlement/index.js";

jest.mock("../../firebase", () => ({ auth: { currentUser: { uid: "user-1" } }, db: {} }));
jest.mock("../entitlementApi", () => ({
  entitlementQueryKey: (uid: string | undefined) => ["entitlement", uid] as const,
  getEntitlement: jest.fn(),
}));

import { useIsPremium } from "../useIsPremium";

const NOW = new Date("2026-06-01T00:00:00.000Z");

const setup = (data: unknown) => {
  const queryClient = new QueryClient();
  if (data !== undefined) queryClient.setQueryData(["entitlement", "user-1"], data);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useIsPremium(), { wrapper });
};

describe("useIsPremium", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("flips to false at premiumUntil without a new snapshot", async () => {
    const until = new Date(NOW.getTime() + 60_000).toISOString();
    const { result } = await setup({ ...EMPTY_ENTITLEMENT, premiumUntil: until });
    expect(result.current.isPremium).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(61_000);
    });
    expect(result.current.isPremium).toBe(false);
  });

  it("missing doc -> free", async () => {
    const { result } = await setup(EMPTY_ENTITLEMENT);
    expect(result.current).toEqual({ isPremium: false, isLoading: false });
  });
});
