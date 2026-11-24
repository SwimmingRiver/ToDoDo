import { useEffect, useState } from "react";
import { auth } from "@/shared/lib/firebase";

/** 커스텀 클레임 operator === true 여부. 캐시된 토큰에 클레임이 없으면 방금 부여됐을 수 있어 한 번만 강제 갱신해 확인한다. */
export const useIsOperator = (): { isOperator: boolean; isLoading: boolean } => {
  const [state, setState] = useState<{ isOperator: boolean; isLoading: boolean }>(() => ({
    isOperator: false,
    isLoading: !!auth.currentUser,
  }));

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setState({ isOperator: false, isLoading: false });
      return;
    }
    let cancelled = false;
    user
      .getIdTokenResult()
      .then((result) => (result.claims.operator === true ? result : user.getIdTokenResult(true)))
      .then((result) => {
        if (!cancelled) setState({ isOperator: result.claims.operator === true, isLoading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ isOperator: false, isLoading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
