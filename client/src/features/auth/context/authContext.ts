import { createContext } from "react";
import type { User } from "firebase/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  // user는 같은 객체에서 필드만 바뀌므로(updateProfile), 다시 읽게 렌더를 한 번 더 일으킨다.
  refreshUser: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);
