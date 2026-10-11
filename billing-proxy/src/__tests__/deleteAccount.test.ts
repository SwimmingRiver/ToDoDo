import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDeleteAccount } from "../handlers/deleteAccount";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";

const PADDLE_ACTIVE: EntitlementDoc = {
  ...EMPTY_ENTITLEMENT,
  plan: "premium",
  status: "active",
  source: "paddle",
  customerId: "ctm_1",
  subscriptionId: "sub_1",
  premiumUntil: "2026-11-10T00:00:00.000Z",
};

const makeDeps = (doc: EntitlementDoc) => {
  const calls: string[] = [];
  return {
    calls,
    store: { get: vi.fn(async () => ({ doc, updateTime: "t" })) },
    paddle: { cancelSubscriptionImmediately: vi.fn(async () => void calls.push("cancel")) },
    accountData: { deleteUserData: vi.fn(async () => void calls.push("data")) },
    claims: { deleteUser: vi.fn(async () => void calls.push("auth")) },
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
