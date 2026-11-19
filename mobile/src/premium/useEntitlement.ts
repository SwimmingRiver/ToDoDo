import { useQuery } from "@tanstack/react-query";
import { auth } from "../firebase";
import { entitlementQueryKey, getEntitlement } from "./entitlementApi";

export const useEntitlement = () => {
  const uid = auth.currentUser?.uid;
  const { data, isLoading } = useQuery({
    queryKey: entitlementQueryKey(uid),
    queryFn: getEntitlement,
    enabled: !!uid,
    // 최신 값은 useEntitlementSync(onSnapshot)가 캐시에 밀어 넣으므로 다시 요청할 필요가 없다.
    staleTime: Infinity,
  });
  return { data, isLoading };
};
