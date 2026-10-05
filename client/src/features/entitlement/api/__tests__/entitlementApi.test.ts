import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));

describe("getEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("문서가 없으면 free 기본값을 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);

    const { getEntitlement } = await import("../entitlementApi");
    const result = await getEntitlement();

    expect(result).toEqual({
      plan: "free",
      status: "none",
      source: null,
      premiumUntil: null,
      trialUsedAt: null,
      cancelAt: null,
      currentPeriodEnd: null,
      customerId: null,
      subscriptionId: null,
      lastWebhookEventId: null,
      lastEventOccurredAt: null,
      updatedAt: "",
    });
  });

  it("문서가 있으면 그 값을 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({
        plan: "premium",
        status: "active",
        source: "manual",
        currentPeriodEnd: null,
        customerId: null,
        subscriptionId: null,
        lastWebhookEventId: null,
        updatedAt: "2026-09-14T00:00:00.000Z",
      }),
    } as never);

    const { getEntitlement } = await import("../entitlementApi");
    const result = await getEntitlement();

    expect(result).toMatchObject({ plan: "premium", status: "active", source: "manual" });
  });

  it("일부 필드가 누락된 문서라도 기본값으로 채워 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ plan: "premium", status: "active" }),
    } as never);

    const { getEntitlement } = await import("../entitlementApi");
    const result = await getEntitlement();

    expect(result).toEqual({
      plan: "premium",
      status: "active",
      source: null,
      premiumUntil: null,
      trialUsedAt: null,
      cancelAt: null,
      currentPeriodEnd: null,
      customerId: null,
      subscriptionId: null,
      lastWebhookEventId: null,
      lastEventOccurredAt: null,
      updatedAt: "",
    });
  });

  it("문서의 새 필드를 그대로 읽고 없으면 null로 채운다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ plan: "premium", status: "trialing", premiumUntil: "2026-10-17T00:00:00.000Z", trialUsedAt: "2026-10-10T00:00:00.000Z" }),
    } as never);

    const { getEntitlement } = await import("../entitlementApi");
    const result = await getEntitlement();

    expect(result).toMatchObject({ premiumUntil: "2026-10-17T00:00:00.000Z", trialUsedAt: "2026-10-10T00:00:00.000Z", cancelAt: null });
  });

  it("미인증 상태면 에러를 던진다", async () => {
    const { auth } = await import("@/shared/lib/firebase");
    Object.defineProperty(auth, "currentUser", { value: null, configurable: true });

    const { getEntitlement } = await import("../entitlementApi");
    await expect(getEntitlement()).rejects.toThrow("Not authenticated");

    Object.defineProperty(auth, "currentUser", {
      value: { uid: "user-1" },
      configurable: true,
    });
  });
});

describe("subscribeEntitlement", () => {
  it("스냅샷을 정규화해서 넘기고 해제 함수를 돌려준다", async () => {
    const { onSnapshot } = await import("firebase/firestore");
    const off = vi.fn();
    vi.mocked(onSnapshot).mockImplementation(((_ref: unknown, next: (snap: unknown) => void) => {
      next({ exists: () => false });
      return off;
    }) as never);

    const { subscribeEntitlement } = await import("../entitlementApi");
    const onNext = vi.fn();
    const unsubscribe = subscribeEntitlement("user-1", onNext, vi.fn());

    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ plan: "free", premiumUntil: null }));
    expect(unsubscribe).toBe(off);
  });
});
