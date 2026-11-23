import { useState, useEffect, useReducer, useCallback, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import * as Sentry from "@sentry/react";
import { auth } from "@/shared/lib/firebase";
import { AuthContext } from "@/features/auth/context/authContext";
import { writeSignedInHint } from "@/features/auth/utils/signedInHint";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const refreshUser = useCallback(() => forceRender(), []);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout);
      setUser(user);
      setLoading(false);
      // 다음 방문 때 인증 확인을 기다리지 않고 청크를 미리 받을지 판단하는 힌트(main.tsx).
      writeSignedInHint(!!user);
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
    <AuthContext.Provider value={{ user, loading, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
