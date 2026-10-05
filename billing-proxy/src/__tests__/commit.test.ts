import { describe, it, expect, vi } from "vitest";
import { commitEntitlement, type CommitDeps } from "../commit";
import { EMPTY_ENTITLEMENT, applyTrial, toClaimSeconds, type EntitlementDoc } from "../entitlement";

const NOW = new Date("2026-10-10T00:00:00.000Z");

/** 메모리 저장소: updateTime이 맞을 때만 쓰기를 받는 실제 사전조건 동작을 흉내 낸다. */
const memoryStore = (initial: EntitlementDoc | null) => {
  let doc = initial;
  let version = initial ? 1 : 0;
  return {
    get: vi.fn(async () => ({ doc: doc ?? EMPTY_ENTITLEMENT, updateTime: doc ? `v${version}` : null })),
    write: vi.fn(async (_uid: string, next: EntitlementDoc, updateTime: string | null) => {
      const current = doc ? `v${version}` : null;
      if (current !== updateTime) return "conflict" as const;
      doc = next;
      version += 1;
      return "ok" as const;
    }),
    current: () => doc,
  };
};

describe("commitEntitlement", () => {
  it("클레임을 먼저 쓰고 문서를 나중에 쓴다", async () => {
    const order: string[] = [];
    const store = memoryStore(null);
    store.write.mockImplementation(async () => {
      order.push("doc");
      return "ok";
    });
    const claims = { setPremiumUntil: vi.fn(async () => void order.push("claim")) };

    const outcome = await commitEntitlement({ store, claims }, "u1", (existing) => applyTrial(existing, NOW));

    expect(order).toEqual(["claim", "doc"]);
    expect(outcome.kind).toBe("written");
    expect(claims.setPremiumUntil).toHaveBeenCalledWith("u1", Math.floor(NOW.getTime() / 1000) + 7 * 86400);
  });

  it("skip이면 아무것도 쓰지 않는다", async () => {
    const store = memoryStore({ ...EMPTY_ENTITLEMENT, trialUsedAt: "2026-01-01T00:00:00.000Z" });
    const claims = { setPremiumUntil: vi.fn() };
    const outcome = await commitEntitlement({ store, claims }, "u1", (existing) => applyTrial(existing, NOW));
    expect(outcome).toEqual({ kind: "skipped", reason: "TRIAL_ALREADY_USED" });
    expect(claims.setPremiumUntil).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it("문서 쓰기가 충돌하면 다시 읽고 다시 결정한다 — 두 탭 동시 체험은 하나만 성공", async () => {
    const store = memoryStore(null);
    const claims = { setPremiumUntil: vi.fn(async () => undefined) };
    const deps: CommitDeps = { store, claims };

    const [a, b] = await Promise.all([
      commitEntitlement(deps, "u1", (existing) => applyTrial(existing, NOW)),
      commitEntitlement(deps, "u1", (existing) => applyTrial(existing, NOW)),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["skipped", "written"]);
    expect(store.current()?.status).toBe("trialing");
  });

  it("문서 쓰기가 예외면 그대로 던진다(웹훅은 500 → Paddle 재전송)", async () => {
    const store = memoryStore(null);
    store.write.mockRejectedValue(new Error("Firestore 엔타이틀먼트 쓰기 실패 (503)"));
    const claims = { setPremiumUntil: vi.fn(async () => undefined) };
    await expect(commitEntitlement({ store, claims }, "u1", (existing) => applyTrial(existing, NOW))).rejects.toThrow("503");
    expect(claims.setPremiumUntil).toHaveBeenCalledTimes(1);
  });

  it("충돌이 3번 반복되면 포기하고 던진다", async () => {
    const store = memoryStore(null);
    store.write.mockResolvedValue("conflict");
    const claims = { setPremiumUntil: vi.fn(async () => undefined) };
    await expect(commitEntitlement({ store, claims }, "u1", (existing) => applyTrial(existing, NOW))).rejects.toThrow("충돌");
    expect(store.write).toHaveBeenCalledTimes(3);
    // 3번의 결정 + 포기 직전 재동기화 1번
    expect(claims.setPremiumUntil).toHaveBeenCalledTimes(4);
  });

  it("충돌로 포기하기 전에 클레임을 저장소의 현재 문서에 맞춰 되돌린다", async () => {
    const stored = { ...EMPTY_ENTITLEMENT, source: "manual" as const, premiumUntil: "2026-10-01T00:00:00.000Z" };
    const store = memoryStore(stored);
    store.write.mockResolvedValue("conflict");
    const claims = { setPremiumUntil: vi.fn(async (_uid: string, _seconds: number) => undefined) };

    await expect(commitEntitlement({ store, claims }, "u1", (existing) => applyTrial(existing, NOW))).rejects.toThrow("충돌");

    const calls = claims.setPremiumUntil.mock.calls;
    expect(calls[calls.length - 1]).toEqual(["u1", toClaimSeconds(store.current()!.premiumUntil)]);
    expect(store.get).toHaveBeenCalledTimes(4);
  });

  it("충돌 후 건너뛸 때 클레임을 최신 문서에 맞춰 재동기화한다", async () => {
    const store = memoryStore(null);
    const claims = { setPremiumUntil: vi.fn(async () => undefined) };
    const deps: CommitDeps = { store, claims };

    const now1 = NOW;
    const now2 = new Date(NOW.getTime() + 3_600_000);

    const [a, b] = await Promise.all([
      commitEntitlement(deps, "u1", (existing) => applyTrial(existing, now1)),
      commitEntitlement(deps, "u1", (existing) => applyTrial(existing, now2)),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["skipped", "written"]);

    // 마지막 클레임 쓰기가 승리한 문서의 premiumUntil과 일치해야 한다.
    const finalDoc = store.current()!;
    const calls = claims.setPremiumUntil.mock.calls as unknown as Array<[string, number]>;
    const lastCallArg = calls[calls.length - 1][1];
    expect(lastCallArg).toBe(toClaimSeconds(finalDoc.premiumUntil));
  });
});
