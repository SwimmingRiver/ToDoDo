import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDeleteAccount } from "../handlers/deleteAccount";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "../entitlement";
import { asStored } from "./helpers/storedDoc";
import type { AppleRecord, GoogleRecord } from "@tododo/core/dist/entitlement/index.js";
import { hmacSha256Hex } from "../hmac";

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

  it("deleteAccount: google autoRenew false but status active → still cancels (lost re-enable RTDN), already_inactive continues", async () => {
    // 저장된 autoRenew=false를 믿지 않는다 — "자동 갱신 다시 켬" 알림이 유실됐으면 Play는 계속 청구한다.
    const deps = makeDeps(googleDoc({ ...GOOGLE, autoRenew: false, cancelAt: "2026-12-01T00:00:00.000Z" }));
    deps.google.cancelSubscription.mockImplementationOnce(async () => {
      deps.calls.push("google");
      return "already_inactive";
    });
    expect((await handleDeleteAccount("u1", deps)).status).toBe(204);
    expect(deps.google.cancelSubscription).toHaveBeenCalledWith("gpa-token");
    expect(deps.calls).toEqual(["google", "data", "auth"]);
  });

  it("deleteAccount: google status canceled → no cancel call", async () => {
    const deps = makeDeps(googleDoc({ ...GOOGLE, status: "canceled" }));
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

describe("handleDeleteAccount — 체험 사용 확인값", () => {
  const AFTER = new Date("2026-12-28T03:00:00.000Z");
  const TRIALED: EntitlementDoc = { ...EMPTY_ENTITLEMENT, trialUsedAt: "2026-12-01T00:00:00.000Z" };
  const IDS = { "google.com": ["g1"], "apple.com": ["a1"] };

  const withHistory = (doc: EntitlementDoc, record = vi.fn(async () => undefined)) => {
    const deps = makeDeps(doc);
    const store = {
      record: vi.fn(async (...args: Parameters<typeof record>) => {
        deps.calls.push("record");
        return record(...args);
      }),
      hasActive: vi.fn(async () => false),
    };
    return { ...deps, trialHistory: { store, secret: "s" }, store_: store };
  };

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("시행 후 체험을 쓴 계정이면 데이터 삭제 전에 google·apple 키를 모두 기록한다", async () => {
    const deps = withHistory(TRIALED);
    const res = await handleDeleteAccount("u1", deps, IDS, AFTER);
    expect(res.status).toBe(204);
    expect(deps.calls).toEqual(["record", "data", "auth"]);
    expect(deps.store_.record).toHaveBeenCalledWith(
      [
        { provider: "google.com", key: await hmacSha256Hex("s", "google.com:g1") },
        { provider: "apple.com", key: await hmacSha256Hex("s", "apple.com:a1") },
      ],
      AFTER,
    );
  });

  it("trialUsedAt이 없으면 기록하지 않는다", async () => {
    const deps = withHistory(EMPTY_ENTITLEMENT);
    await handleDeleteAccount("u1", deps, IDS, AFTER);
    expect(deps.store_.record).not.toHaveBeenCalled();
    expect(deps.calls).toEqual(["data", "auth"]);
  });

  it("시행 시각 전이면 기록하지 않고, 시행 시각에는 기록한다", async () => {
    const before = withHistory(TRIALED);
    await handleDeleteAccount("u1", before, IDS, new Date("2026-12-27T14:59:59.999Z"));
    expect(before.store_.record).not.toHaveBeenCalled();

    const at = withHistory(TRIALED);
    await handleDeleteAccount("u1", at, IDS, new Date("2026-12-27T15:00:00.000Z"));
    expect(at.store_.record).toHaveBeenCalledTimes(1);
  });

  it("식별자가 없으면 기록하지 않는다", async () => {
    const deps = withHistory(TRIALED);
    await handleDeleteAccount("u1", deps, {}, AFTER);
    expect(deps.store_.record).not.toHaveBeenCalled();
  });

  it("기록이 실패해도 탈퇴는 204로 끝난다", async () => {
    const deps = withHistory(TRIALED, vi.fn(async () => { throw new Error("firestore down"); }));
    const res = await handleDeleteAccount("u1", deps, IDS, AFTER);
    expect(res.status).toBe(204);
    expect(deps.accountData.deleteUserData).toHaveBeenCalledWith("u1");
    expect(deps.claims.deleteUser).toHaveBeenCalledWith("u1");
  });

  it("시크릿이 없으면(trialHistory null) 기록 없이 탈퇴한다", async () => {
    const deps = { ...makeDeps(TRIALED), trialHistory: null };
    const res = await handleDeleteAccount("u1", deps, IDS, AFTER);
    expect(res.status).toBe(204);
    expect(deps.calls).toEqual(["data", "auth"]);
  });
});
