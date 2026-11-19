import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDeleteAccount } from "../handlers/deleteAccount";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import { asStored } from "./helpers/storedDoc";
import type { AppleRecord, GoogleRecord } from "@tododo/core/dist/entitlement/index.js";

const PADDLE_ACTIVE: EntitlementDoc = {
  ...EMPTY_ENTITLEMENT,
  plan: "premium",
  status: "active",
  source: "paddle",
  customerId: "ctm_1",
  subscriptionId: "sub_1",
  premiumUntil: "2026-11-10T00:00:00.000Z",
};

const APPLE: AppleRecord = {
  status: "active",
  premiumUntil: "2026-12-01T00:00:00.000Z",
  cancelAt: null,
  currentPeriodEnd: "2026-12-01T00:00:00.000Z",
  autoRenew: true,
  startedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "",
  originalTransactionId: "otx_1",
  productId: "premium_monthly",
  environment: "Production",
  appAccountToken: null,
  lastNotificationUUID: null,
  lastSignedDate: null,
};

const GOOGLE: GoogleRecord = {
  status: "active",
  premiumUntil: "2026-12-01T00:00:00.000Z",
  cancelAt: null,
  currentPeriodEnd: "2026-12-01T00:00:00.000Z",
  autoRenew: true,
  startedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "",
  purchaseToken: "gpa-token",
  productId: "premium_monthly",
  basePlanId: "monthly",
  environment: "Production",
  obfuscatedAccountId: null,
  lastMessageId: null,
  lastEventTime: null,
};

const googleDoc = (google: GoogleRecord, extra: Partial<EntitlementDoc["sources"]> = {}): EntitlementDoc => ({
  ...EMPTY_ENTITLEMENT,
  plan: "premium",
  status: "active",
  source: "google",
  premiumUntil: "2026-12-01T00:00:00.000Z",
  sources: { ...extra, google },
});

const makeDeps = (doc: EntitlementDoc) => {
  const calls: string[] = [];
  return {
    calls,
    store: { get: vi.fn(async () => ({ doc: asStored(doc), updateTime: "t" })) },
    paddle: { cancelSubscriptionImmediately: vi.fn(async () => void calls.push("cancel")) },
    accountData: { deleteUserData: vi.fn(async () => void calls.push("data")) },
    claims: { deleteUser: vi.fn(async () => void calls.push("auth")) },
    google: {
      cancelSubscription: vi.fn(async (): Promise<"canceled" | "already_inactive"> => {
        calls.push("google");
        return "canceled";
      }),
    },
  };
};

describe("handleDeleteAccount", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("살아 있는 Paddle 구독이면 해지 → 데이터 삭제 → Auth 삭제 순서로 하고 204", async () => {
    const deps = makeDeps(PADDLE_ACTIVE);
    const res = await handleDeleteAccount("u1", deps);
    expect(res.status).toBe(204);
    expect(deps.paddle.cancelSubscriptionImmediately).toHaveBeenCalledWith("sub_1");
    expect(deps.accountData.deleteUserData).toHaveBeenCalledWith("u1");
    expect(deps.claims.deleteUser).toHaveBeenCalledWith("u1");
    expect(deps.calls).toEqual(["cancel", "data", "auth"]);
  });

  it("해지 예약(cancelAt) 상태여도 아직 active면 즉시 해지한다", async () => {
    const deps = makeDeps({ ...PADDLE_ACTIVE, cancelAt: "2026-11-10T00:00:00.000Z" });
    await handleDeleteAccount("u1", deps);
    expect(deps.paddle.cancelSubscriptionImmediately).toHaveBeenCalledWith("sub_1");
  });

  it.each([
    ["구독 기록 없음", EMPTY_ENTITLEMENT],
    ["체험", { ...EMPTY_ENTITLEMENT, plan: "premium", status: "trialing", source: "trial" } as EntitlementDoc],
    ["운영자 부여", { ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "manual" } as EntitlementDoc],
    ["이미 해지된 Paddle 구독", { ...PADDLE_ACTIVE, status: "canceled" } as EntitlementDoc],
  ])("%s이면 Paddle을 부르지 않고 삭제한다", async (_label, doc) => {
    const deps = makeDeps(doc);
    const res = await handleDeleteAccount("u1", deps);
    expect(res.status).toBe(204);
    expect(deps.paddle.cancelSubscriptionImmediately).not.toHaveBeenCalled();
    expect(deps.calls).toEqual(["data", "auth"]);
  });

  it("deleteAccount cancels sources.paddle subscription when not canceled — 대표 출처가 apple이어도 해지한다", async () => {
    const paddle = asStored(PADDLE_ACTIVE).sources.paddle!;
    const deps = makeDeps({
      ...EMPTY_ENTITLEMENT,
      plan: "premium",
      status: "active",
      source: "apple",
      premiumUntil: "2026-12-01T00:00:00.000Z",
      sources: { paddle, apple: APPLE },
    });
    await handleDeleteAccount("u1", deps);
    expect(deps.paddle.cancelSubscriptionImmediately).toHaveBeenCalledWith("sub_1");
    expect(deps.calls).toEqual(["cancel", "data", "auth"]);
  });

  it("deleteAccount: only apple → no server cancel call — Apple 구독은 서버가 해지할 수 없다", async () => {
    const deps = makeDeps({ ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", source: "apple", premiumUntil: "2026-12-01T00:00:00.000Z", sources: { apple: APPLE } });
    expect((await handleDeleteAccount("u1", deps)).status).toBe(204);
    expect(deps.paddle.cancelSubscriptionImmediately).not.toHaveBeenCalled();
    expect(deps.google.cancelSubscription).not.toHaveBeenCalled();
    expect(deps.calls).toEqual(["data", "auth"]);
  });

  it("deleteAccount: auto-renewing google → cancel then delete data then delete auth", async () => {
    const deps = makeDeps(googleDoc(GOOGLE));
    const res = await handleDeleteAccount("u1", deps);
    expect(res.status).toBe(204);
    expect(deps.google.cancelSubscription).toHaveBeenCalledWith("gpa-token");
    expect(deps.calls).toEqual(["google", "data", "auth"]);
  });

  it("deleteAccount: google cancel failure → 502 GOOGLE_CANCEL_FAILED, nothing deleted", async () => {
    const deps = makeDeps(googleDoc(GOOGLE));
    deps.google.cancelSubscription.mockRejectedValueOnce(new Error("play down"));
    const res = await handleDeleteAccount("u1", deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "GOOGLE_CANCEL_FAILED" });
    expect(deps.accountData.deleteUserData).not.toHaveBeenCalled();
    expect(deps.claims.deleteUser).not.toHaveBeenCalled();
  });

  it("deleteAccount: google already_inactive → continues deletion", async () => {
    const deps = makeDeps(googleDoc(GOOGLE));
    deps.google.cancelSubscription.mockImplementationOnce(async () => {
      deps.calls.push("google");
      return "already_inactive";
    });
    expect((await handleDeleteAccount("u1", deps)).status).toBe(204);
    expect(deps.calls).toEqual(["google", "data", "auth"]);
  });

  it.each([
    ["autoRenew false", { ...GOOGLE, autoRenew: false, cancelAt: "2026-12-01T00:00:00.000Z" }],
    ["status canceled", { ...GOOGLE, status: "canceled" as const }],
  ])("deleteAccount: google %s → no cancel call", async (_label, google) => {
    const deps = makeDeps(googleDoc(google));
    expect((await handleDeleteAccount("u1", deps)).status).toBe(204);
    expect(deps.google.cancelSubscription).not.toHaveBeenCalled();
    expect(deps.calls).toEqual(["data", "auth"]);
  });

  it("deleteAccount: paddle and google both live → paddle cancel, google cancel, then delete", async () => {
    const paddle = asStored(PADDLE_ACTIVE).sources.paddle!;
    const deps = makeDeps(googleDoc(GOOGLE, { paddle }));
    expect((await handleDeleteAccount("u1", deps)).status).toBe(204);
    expect(deps.calls).toEqual(["cancel", "google", "data", "auth"]);
  });

  it("deleteAccount: paddle cancel failure → google not called", async () => {
    const paddle = asStored(PADDLE_ACTIVE).sources.paddle!;
    const deps = makeDeps(googleDoc(GOOGLE, { paddle }));
    deps.paddle.cancelSubscriptionImmediately.mockRejectedValueOnce(new Error("paddle down"));
    const res = await handleDeleteAccount("u1", deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "PADDLE_CANCEL_FAILED" });
    expect(deps.google.cancelSubscription).not.toHaveBeenCalled();
    expect(deps.calls).toEqual([]);
  });

  it("Paddle 해지가 실패하면 아무것도 지우지 않고 502 PADDLE_CANCEL_FAILED", async () => {
    const deps = makeDeps(PADDLE_ACTIVE);
    deps.paddle.cancelSubscriptionImmediately.mockRejectedValueOnce(new Error("paddle down"));
    const res = await handleDeleteAccount("u1", deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "PADDLE_CANCEL_FAILED" });
    expect(deps.accountData.deleteUserData).not.toHaveBeenCalled();
    expect(deps.claims.deleteUser).not.toHaveBeenCalled();
  });

  it("데이터 삭제가 실패하면 Auth는 지우지 않고 던진다(재시도할 토큰을 남긴다)", async () => {
    const deps = makeDeps(EMPTY_ENTITLEMENT);
    deps.accountData.deleteUserData.mockRejectedValueOnce(new Error("firestore down"));
    await expect(handleDeleteAccount("u1", deps)).rejects.toThrow("firestore down");
    expect(deps.claims.deleteUser).not.toHaveBeenCalled();
  });
});
