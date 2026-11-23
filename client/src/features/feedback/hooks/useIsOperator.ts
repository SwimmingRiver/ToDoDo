import { useEffect, useState } from "react";
import { auth } from "@/shared/lib/firebase";

/** 커스텀 클레임 operator === true 여부. 토큰은 강제 갱신하지 않는다. */
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
