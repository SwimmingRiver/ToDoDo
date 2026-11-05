import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import type { ReactNode } from "react";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // 이 화면에서 로그인 상태를 한 번이라도 봤는지. 로그인돼 있다가 풀린 경우(로그아웃·탈퇴·
  // 다른 탭 로그아웃)는 스스로 떠난 것이므로 로그인 화면이 아니라 랜딩으로 보낸다.
  const hadUserRef = useRef(false);

  useEffect(() => {
    if (user) hadUserRef.current = true;
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      navigate(hadUserRef.current ? "/" : "/login", { replace: true });
    }
  }, [loading, user, navigate]);

  if (loading) return null;
  if (!user) return null;
  return <>{children}</>;
};

export default ProtectedRoute;
