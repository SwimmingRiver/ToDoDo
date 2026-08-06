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

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
