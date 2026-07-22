import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import LandingPage from "@/features/landing/pages/landingPage";

/**
 * "/" 전용 게이트. ProtectedRoute와 대칭되는 컴포넌트로, 인증 로딩 중에는
 * ProtectedRoute와 동일하게 깜빡임 방지를 위해 null을 반환한다.
 * - 로그인 상태: /today로 즉시 리다이렉트 (랜딩 노출 안 됨)
 * - 비로그인 상태: 랜딩 페이지 노출
 */
const RootGate = () => {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/today" replace />;
  return <LandingPage />;
};

export default RootGate;
