import type { ClaimsClient } from "./claims";
import { toClaimSeconds, type Decision, type EntitlementDoc } from "./entitlement";
import type { EntitlementStore } from "./entitlementStore";

export interface CommitDeps {
  store: Pick<EntitlementStore, "get" | "write">;
  claims: Pick<ClaimsClient, "setPremiumUntil">;
}

export type CommitOutcome<R extends string> =
  | { kind: "written"; doc: EntitlementDoc }
  | { kind: "skipped"; reason: R };

const MAX_ATTEMPTS = 3;

/**
 * 읽기 → 결정 → 클레임 → 문서(사전조건) 순서로 반영한다.
 *
 * 클레임을 먼저 쓰는 이유: 중복 판정 기준(lastWebhookEventId)이 문서에 있다. 문서 쓰기가 실패하면
 * 예외 → 웹훅 500 → Paddle 재전송 → 클레임 재기록(같은 값이라 무해) → 문서 기록으로 수렴한다.
 * 반대 순서면 "문서는 처리됨, 클레임만 실패"가 재전송에서도 무시되어 영구히 남는다.
 */
export const commitEntitlement = async <R extends string>(
  deps: CommitDeps,
  uid: string,
  decide: (existing: EntitlementDoc) => Decision<R>,
): Promise<CommitOutcome<R>> => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { doc, updateTime } = await deps.store.get(uid);
    const decision = decide(doc);
    if ("skip" in decision) return { kind: "skipped", reason: decision.skip };

    await deps.claims.setPremiumUntil(uid, toClaimSeconds(decision.write.premiumUntil));
    if ((await deps.store.write(uid, decision.write, updateTime)) === "ok") {
      return { kind: "written", doc: decision.write };
    }
  }
  throw new Error(`entitlements/${uid} 쓰기 충돌이 ${MAX_ATTEMPTS}회 반복됨`);
};
