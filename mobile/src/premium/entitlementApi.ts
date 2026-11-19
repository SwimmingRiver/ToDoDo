import { doc, getDoc, onSnapshot } from "firebase/firestore";
import {
  EMPTY_ENTITLEMENT,
  normalizeEntitlement as coreNormalize,
  type EntitlementDoc,
} from "@tododo/core/dist/entitlement/index.js";
import { auth, db } from "../firebase";

const getEntitlementDocRef = (uid: string) => doc(db, "entitlements", uid);

export const entitlementQueryKey = (uid: string | undefined) => ["entitlement", uid] as const;

/** 문서가 없으면 free로 취급한다. 필드 채우기·이주는 core 정규화가 한다(서버와 같은 규칙). */
export const normalizeEntitlement = (data: unknown): EntitlementDoc =>
  data ? coreNormalize(data) : EMPTY_ENTITLEMENT;

export const getEntitlement = async (): Promise<EntitlementDoc> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  const snap = await getDoc(getEntitlementDocRef(uid));
  return normalizeEntitlement(snap.exists() ? snap.data() : undefined);
};

/** 결제·체험·해지·다른 기기 변경을 모두 같은 경로로 받기 위해 문서를 실시간 구독한다. */
export const subscribeEntitlement = (
  uid: string,
  onNext: (entitlement: EntitlementDoc) => void,
  onError: (error: Error) => void,
): (() => void) =>
  onSnapshot(
    getEntitlementDocRef(uid),
    (snap) => onNext(normalizeEntitlement(snap.exists() ? snap.data() : undefined)),
    onError,
  );
