import { useQuery } from "@tanstack/react-query";
import { auth } from "@/shared/lib/firebase";
import { getEntitlement, entitlementQueryKey } from "../api";

export const useEntitlement = () => {
  const uid = auth.currentUser?.uid;
  return useQuery({
    queryKey: entitlementQueryKey(uid),
    queryFn: getEntitlement,
    enabled: !!uid,
    // 최신 값은 useEntitlementSync(onSnapshot)가 캐시에 밀어 넣으므로 다시 요청할 필요가 없다.
    staleTime: Infinity,
  });
};
