import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "../../types";

// vi.mock 팩토리는 파일 맨 위로 끌어올려지므로, 팩토리가 즉시 읽는 값은 vi.hoisted로 만든다.
const { user, unsubscribe, emitter } = vi.hoisted(() => ({
  user: { uid: "user-1", getIdTokenResult: vi.fn(), getIdToken: vi.fn() },
  unsubscribe: vi.fn(),
  emitter: { emit: null as ((e: Entitlement) => void) | null },
}));
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: user }, googleProvider: {} }));
vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));
vi.mock("../../api", () => ({
  entitlementQueryKey: (uid: string | undefined) => ["entitlement", uid] as const,
  subscribeEntitlement: vi.fn((_uid: string, onNext: (e: Entitlement) => void) => {
    emitter.emit = onNext;
    return unsubscribe;
  }),
}));

import { useEntitlementSync, syncClaimWithEntitlement } from "../useEntitlementSync";

const UNTIL = "2026-11-13T00:00:00.000Z";
const UNTIL_SEC = Math.floor(Date.parse(UNTIL) / 1000);

describe("syncClaimWithEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("문서와 클레임이 다르면 토큰을 강제 갱신한다", async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: {} });
    await syncClaimWithEntitlement({ ...DEFAULT_ENTITLEMENT, premiumUntil: UNTIL });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });

  it("같으면 갱신하지 않는다(무한 갱신 방지)", async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { premiumUntil: UNTIL_SEC } });
    await syncClaimWithEntitlement({ ...DEFAULT_ENTITLEMENT, premiumUntil: UNTIL });
    expect(user.getIdToken).not.toHaveBeenCalled();
  });

  it("문서 premiumUntil이 null이고 클레임이 0/없음이면 같은 것으로 본다", async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { premiumUntil: 0 } });
    await syncClaimWithEntitlement(DEFAULT_ENTITLEMENT);
    user.getIdTokenResult.mockResolvedValue({ claims: {} });
    await syncClaimWithEntitlement(DEFAULT_ENTITLEMENT);
    expect(user.getIdToken).not.toHaveBeenCalled();
  });
});

describe("useEntitlementSync", () => {
  it("스냅샷을 쿼리 캐시에 넣고 언마운트 시 구독을 해제한다", async () => {
    user.getIdTokenResult.mockResolvedValue({ claims: { premiumUntil: UNTIL_SEC } });
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { unmount } = renderHook(() => useEntitlementSync(), { wrapper });

    emitter.emit?.({ ...DEFAULT_ENTITLEMENT, premiumUntil: UNTIL });
    await waitFor(() =>
      expect(queryClient.getQueryData(["entitlement", "user-1"])).toMatchObject({ premiumUntil: UNTIL }),
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
