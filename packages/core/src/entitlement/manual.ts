import { aggregate } from "./aggregate.js";
import type { EntitlementDoc } from "./types.js";

/** 운영자 부여. until이 null이면 manual 기록만 지운다(다른 출처는 그대로). */
export const applyManual = (doc: EntitlementDoc, until: string | null, now: Date): EntitlementDoc => {
  const { manual: _removed, ...others } = doc.sources;
  const nowIso = now.toISOString();
  const sources =
    until === null
      ? others
      : {
          ...others,
          manual: {
            status: "active" as const,
            premiumUntil: until,
            cancelAt: null,
            currentPeriodEnd: null,
            autoRenew: false,
            startedAt: nowIso,
            updatedAt: nowIso,
          },
        };
  return aggregate({ ...doc, sources, updatedAt: nowIso }, now);
};
