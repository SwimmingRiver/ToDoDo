import { type EntitlementDoc } from "./types.js";
/** Firestore에서 읽은 임의의 값을 EntitlementDoc으로. 잘못된 필드는 기본값, 예전 문서는 sources로 이주. */
export declare const normalizeEntitlement: (data: unknown) => EntitlementDoc;
