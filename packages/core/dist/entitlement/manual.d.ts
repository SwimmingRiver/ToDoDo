import type { EntitlementDoc } from "./types.js";
/** 운영자 부여. until이 null이면 manual 기록만 지운다(다른 출처는 그대로). */
export declare const applyManual: (doc: EntitlementDoc, until: string | null, now: Date) => EntitlementDoc;
