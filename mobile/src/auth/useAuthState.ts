import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import * as Sentry from "@sentry/react-native";
import { auth } from "../firebase";

export const useAuthState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      // Sentry에는 uid만 넘긴다(이메일 등 금지). 로그아웃하면 비워 이전 사용자가 이벤트에 남지 않게 한다.
      Sentry.setUser(nextUser ? { id: nextUser.uid } : null);
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  return { user, loading };
};
