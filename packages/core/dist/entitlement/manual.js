import { aggregate } from "./aggregate.js";
/** 운영자 부여. until이 null이면 manual 기록만 지운다(다른 출처는 그대로). */
export const applyManual = (doc, until, now) => {
    const { manual: _removed, ...others } = doc.sources;
    const nowIso = now.toISOString();
    const sources = until === null
        ? others
        : {
            ...others,
            manual: {
                status: "active",
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
