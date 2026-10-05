import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "../types";

const getEntitlementDocRef = (uid: string) => doc(db, "entitlements", uid);

export const entitlementQueryKey = (uid: string | undefined) => ["entitlement", uid] as const;

/**
 * 문서가 없으면 free로 취급한다 — calendarIntegrations 문서가 없을 때 connected: false로
 * 취급하는 기존 관례와 동일. 누락 필드는 기본값으로 채운다(예전 문서 호환).
 */
export const normalizeEntitlement = (data: Partial<Entitlement> | undefined): Entitlement => {
  if (!data) return DEFAULT_ENTITLEMENT;
  const pick = <K extends keyof Entitlement>(key: K): Entitlement[K] => data[key] ?? DEFAULT_ENTITLEMENT[key];
  return {
    plan: pick("plan"),
    status: pick("status"),
    source: pick("source"),
    premiumUntil: pick("premiumUntil"),
    trialUsedAt: pick("trialUsedAt"),
    cancelAt: pick("cancelAt"),
    currentPeriodEnd: pick("currentPeriodEnd"),
    customerId: pick("customerId"),
    subscriptionId: pick("subscriptionId"),
    lastWebhookEventId: pick("lastWebhookEventId"),
    lastEventOccurredAt: pick("lastEventOccurredAt"),
    updatedAt: pick("updatedAt"),
  };
};

export const getEntitlement = async (): Promise<Entitlement> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  const snap = await getDoc(getEntitlementDocRef(uid));
  return normalizeEntitlement(snap.exists() ? (snap.data() as Partial<Entitlement>) : undefined);
};

/** 결제·체험·포털 해지·다른 기기 변경을 모두 같은 경로로 받기 위해 문서를 실시간 구독한다. */
export const subscribeEntitlement = (
  uid: string,
  onNext: (entitlement: Entitlement) => void,
  onError: (error: Error) => void,
): (() => void) =>
  onSnapshot(
    getEntitlementDocRef(uid),
    (snap) => onNext(normalizeEntitlement(snap.exists() ? (snap.data() as Partial<Entitlement>) : undefined)),
    onError,
  );
