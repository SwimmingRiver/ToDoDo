import { useQuery } from "@tanstack/react-query";
import { auth } from "@/shared/lib/firebase";
import { getEntitlement } from "../api";

export const useEntitlement = () => {
  const uid = auth.currentUser?.uid;
  return useQuery({
    queryKey: ["entitlement", uid],
    queryFn: getEntitlement,
    enabled: !!uid,
    // 결제 웹훅이 없는 지금은 값이 운영자의 수동 조작으로만 바뀌므로,
    // 매 마운트마다 재요청할 필요가 없다.
    staleTime: 5 * 60 * 1000,
  });
};
