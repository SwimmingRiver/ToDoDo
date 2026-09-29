import { useState, useEffect, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import * as Sentry from "@sentry/react";
import { auth } from "@/shared/lib/firebase";
import { AuthContext } from "@/features/auth/context/authContext";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout);
      setUser(user);
      setLoading(false);
      // uid만 태깅한다. email 등은 절대 넘기지 않는다(beforeSend에서도 걸러지지만 여기서도 이중 방어).
      Sentry.setUser(user ? { id: user.uid } : null);
    });
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  // 같은 브라우저에서 다른 계정으로 로그인했을 때 이전 계정의 알림이 오지 않도록,
  // ID 토큰이 살아 있는 로그아웃 직전에 이 기기의 푸시 토큰을 해제한다. 실패해도
  // 로그아웃은 막지 않는다. pushClient는 동적 import해 초기 청크에 넣지 않는다.
  const logout = async () => {
    try {
      const { disablePushOnThisDevice } = await import("@/features/reminders/push/pushClient");
      await disablePushOnThisDevice();
    } catch (error) {
      console.error("푸시 토큰 해제 실패:", error);
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
