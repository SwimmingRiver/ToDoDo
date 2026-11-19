import {
  EMPTY_ENTITLEMENT,
  type EntitlementDoc,
  type EntitlementSource,
  type EntitlementStatus,
} from "@tododo/core/dist/entitlement/index.js";

/** 문서 모델은 core가 소유한다(서버와 같은 정의). 클라이언트는 기존 이름으로 재수출만 한다. */
type Entitlement = EntitlementDoc;
type EntitlementPlan = EntitlementDoc["plan"];

/** entitlements/{uid} 문서가 없을 때 클라이언트가 취급하는 기본값. */
const DEFAULT_ENTITLEMENT: Entitlement = EMPTY_ENTITLEMENT;

export { DEFAULT_ENTITLEMENT };
export type { Entitlement, EntitlementPlan, EntitlementStatus, EntitlementSource };
