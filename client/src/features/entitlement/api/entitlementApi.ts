import { doc, getDoc } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "../types";

const getEntitlementDocRef = (uid: string) => doc(db, "entitlements", uid);

/**
 * 문서가 없으면 free로 취급한다 — calendarIntegrations 문서가 없을 때
 * connected: false로 취급하는 기존 관례와 동일. 결제 연동 전까지 대부분의
 * 사용자는 이 문서 자체가 없으므로 백필이 필요 없다.
 */
export const getEntitlement = async (): Promise<Entitlement> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");

  const snap = await getDoc(getEntitlementDocRef(uid));
  if (!snap.exists()) return DEFAULT_ENTITLEMENT;

  const data = snap.data() as Partial<Entitlement>;
  return {
    plan: data.plan ?? DEFAULT_ENTITLEMENT.plan,
    status: data.status ?? DEFAULT_ENTITLEMENT.status,
    source: data.source ?? DEFAULT_ENTITLEMENT.source,
    currentPeriodEnd: data.currentPeriodEnd ?? DEFAULT_ENTITLEMENT.currentPeriodEnd,
    customerId: data.customerId ?? DEFAULT_ENTITLEMENT.customerId,
    subscriptionId: data.subscriptionId ?? DEFAULT_ENTITLEMENT.subscriptionId,
    lastWebhookEventId: data.lastWebhookEventId ?? DEFAULT_ENTITLEMENT.lastWebhookEventId,
    updatedAt: data.updatedAt ?? DEFAULT_ENTITLEMENT.updatedAt,
  };
};
