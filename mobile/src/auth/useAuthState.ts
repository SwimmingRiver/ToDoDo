import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import * as Sentry from "@sentry/react-native";
import { auth } from "../firebase";
import { addLifecycleBreadcrumb } from "../shared/lib/sentry";

export const useAuthState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 앱 시작 진행 단계 breadcrumb: 로그인 상태 확정을 기다리기 시작한 때와 처음 확정된 때만 남긴다.
    let resolved = false;
    addLifecycleBreadcrumb("auth_wait_start");
    return onAuthStateChanged(auth, (nextUser) => {
      if (!resolved) {
        resolved = true;
        addLifecycleBreadcrumb("auth_resolved", { signed_in: nextUser !== null });
      }
      // Sentry에는 uid만 넘긴다(이메일 등 금지). 로그아웃하면 비워 이전 사용자가 이벤트에 남지 않게 한다.
      Sentry.setUser(nextUser ? { id: nextUser.uid } : null);
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  return { user, loading };
};
