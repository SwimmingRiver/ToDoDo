import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "@tododo/core/dist/entitlement/index.js";

const mockUser = {
  uid: "user-1",
  getIdTokenResult: jest.fn<() => Promise<{ claims: Record<string, unknown> }>>(),
  getIdToken: jest.fn<(force?: boolean) => Promise<string>>(),
};
jest.mock("../../firebase", () => ({ auth: { get currentUser() { return mockUser; } }, db: {} }));

const mockUnsubscribe = jest.fn();
const emitter: { next: ((e: EntitlementDoc) => void) | null; error: ((e: Error) => void) | null } = {
  next: null,
  error: null,
};
jest.mock("../entitlementApi", () => ({
  entitlementQueryKey: (uid: string | undefined) => ["entitlement", uid] as const,
  subscribeEntitlement: (_uid: string, next: (e: EntitlementDoc) => void, error: (e: Error) => void) => {
    emitter.next = next;
    emitter.error = error;
    return mockUnsubscribe;
  },
}));

import { useEntitlementSync, syncClaimWithEntitlement, refreshClaims } from "../useEntitlementSync";

const sentryMock = jest.requireMock("@sentry/react-native") as { captureException: jest.Mock };

const UNTIL = "2026-11-13T00:00:00.000Z";
const UNTIL_SEC = Math.floor(Date.parse(UNTIL) / 1000);

describe("syncClaimWithEntitlement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("claim mismatch -> getIdToken(true)", async () => {
    mockUser.getIdTokenResult.mockResolvedValue({ claims: {} });
    await syncClaimWithEntitlement({ ...EMPTY_ENTITLEMENT, premiumUntil: UNTIL });
    expect(mockUser.getIdToken).toHaveBeenCalledWith(true);
  });

  it("claim equal -> no refresh", async () => {
    mockUser.getIdTokenResult.mockResolvedValue({ claims: { premiumUntil: UNTIL_SEC } });
    await syncClaimWithEntitlement({ ...EMPTY_ENTITLEMENT, premiumUntil: UNTIL });
    expect(mockUser.getIdToken).not.toHaveBeenCalled();
  });

  it("null premiumUntil equals claim 0 or missing", async () => {
    mockUser.getIdTokenResult.mockResolvedValue({ claims: { premiumUntil: 0 } });
    await syncClaimWithEntitlement(EMPTY_ENTITLEMENT);
    mockUser.getIdTokenResult.mockResolvedValue({ claims: {} });
    await syncClaimWithEntitlement(EMPTY_ENTITLEMENT);
    expect(mockUser.getIdToken).not.toHaveBeenCalled();
  });

  it("refreshClaims forces a token refresh", async () => {
    await refreshClaims();
    expect(mockUser.getIdToken).toHaveBeenCalledWith(true);
  });
});

describe("useEntitlementSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("snapshot sets query data and unsubscribes on unmount", async () => {
    mockUser.getIdTokenResult.mockResolvedValue({ claims: { premiumUntil: UNTIL_SEC } });
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { unmount } = await renderHook(() => useEntitlementSync(), { wrapper });

    emitter.next?.({ ...EMPTY_ENTITLEMENT, premiumUntil: UNTIL });
    await waitFor(() =>
      expect(queryClient.getQueryData(["entitlement", "user-1"])).toMatchObject({ premiumUntil: UNTIL }),
    );
    await unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("logs subscription errors with console.warn", async () => {
    sentryMock.captureException.mockClear();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    await renderHook(() => useEntitlementSync(), { wrapper });
    emitter.error?.(new Error("boom"));
    expect(warn).toHaveBeenCalled();
    expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { feature: "entitlement" } });
    warn.mockRestore();
  });
});
