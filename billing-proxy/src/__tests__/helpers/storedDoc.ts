import { normalizeEntitlement } from "@tododo/core/dist/entitlement/index.js";
import type { EntitlementDoc } from "../../entitlement";

/**
 * 테스트 픽스처를 EntitlementStore가 읽은 모양으로 바꾼다(테스트 전용).
 * sources를 비운 픽스처는 `sources`가 없는 예전 문서로 보고 이주시킨다 — 운영 문서가 실제로 그렇게 읽힌다.
 */
export const asStored = (doc: EntitlementDoc): EntitlementDoc =>
  normalizeEntitlement(Object.keys(doc.sources).length > 0 ? doc : { ...doc, sources: undefined });
