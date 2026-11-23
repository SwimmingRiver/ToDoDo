import type { UserCredential } from "firebase/auth";
import {
  isAccountExistsError,
  isUserCancelledSignIn,
} from "@tododo/core/dist/auth/index.js";
import { useToast } from "@/shared";
import { Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/useAuth";
import {
  signInWithGoogle,
  signInWithApple,
  consumeLinkedNotice,
} from "../api/signIn";
import { warmUpPopupResolver } from "../api/warmUpPopup";
import { isAppleLoginOpen } from "../config";
import {
  Container,
  Card,
  Title,
  GoogleButton,
  AppleButton,
  ErrorMessage,
  Hint,
  Buttons,
} from "./loginPage.styles";

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    {/* eslint-disable-next-line no-restricted-syntax -- Google 브랜드 로고 고정색 */}
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    {/* eslint-disable-next-line no-restricted-syntax -- Google 브랜드 로고 고정색 */}
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    {/* eslint-disable-next-line no-restricted-syntax -- Google 브랜드 로고 고정색 */}
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    {/* eslint-disable-next-line no-restricted-syntax -- Google 브랜드 로고 고정색 */}
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="20" viewBox="0 0 814 1000" aria-hidden="true" focusable="false">
    {/* eslint-disable-next-line no-restricted-syntax -- Apple 브랜드 고정색 */}
    <path fill="#FFFFFF" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
  </svg>
);

const LINKED_NOTICE = "이제 Google·Apple 둘 다로 로그인할 수 있어요";
const ACCOUNT_EXISTS_MESSAGE =
  "이미 다른 방법으로 가입된 이메일이에요. 그 방법으로 로그인해 주세요.";
const POPUP_BLOCKED_MESSAGE =
  "로그인 창이 열리지 않았어요. 한 번 더 눌러 주세요.";
const GENERIC_ERROR_MESSAGE =
  "로그인 중 오류가 발생했습니다. 다시 시도해주세요.";

const LoginPage = () => {
  const navigate = useNavigate();
  const { user, loading, refreshUser } = useAuth();
  const toast = useToast();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 클릭 전에 팝업 처리기를 준비해 둔다 — 안 하면 Safari가 첫 팝업을 막는다(warmUpPopup.ts).
  const showsButtons = !loading && !user;
  useEffect(() => {
    if (showsButtons) warmUpPopupResolver();
  }, [showsButtons]);

  if (loading) return null;
  if (user) return <Navigate to="/today" replace />;

  const appleOpen = isAppleLoginOpen();

  const login = async (
    signIn: () => Promise<UserCredential>,
    isApple: boolean,
  ) => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await signIn();
      // Apple 이름 보정은 signInWithApple 안에서 끝나므로 화면 이름만 새로 읽게 한다.
      if (isApple) refreshUser();
      if (consumeLinkedNotice(result.user)) toast.info(LINKED_NOTICE);
      navigate("/");
    } catch (err: unknown) {
      const code = (err as { code?: unknown })?.code;
      if (isUserCancelledSignIn(code)) {
        // 사용자가 직접 닫은 경우 - 에러 메시지 불필요
      } else if (isAccountExistsError(code)) {
        setErrorMessage(ACCOUNT_EXISTS_MESSAGE);
      } else if (code === "auth/popup-blocked") {
        setErrorMessage(POPUP_BLOCKED_MESSAGE);
      } else {
        setErrorMessage(GENERIC_ERROR_MESSAGE);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container>
      <Card>
        <Title>ToDoDo</Title>
        {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
        <Buttons>
          <GoogleButton
            onClick={() => login(signInWithGoogle, false)}
            disabled={isLoading}
          >
            <GoogleIcon />
            {isLoading ? "로그인 중..." : "Google로 로그인"}
          </GoogleButton>
          {appleOpen && (
            <AppleButton
              onClick={() => login(signInWithApple, true)}
              disabled={isLoading}
            >
              <AppleIcon />
              Apple로 로그인
            </AppleButton>
          )}
        </Buttons>
        {appleOpen && (
          <Hint>이전에 Google로 가입했다면 Google로 로그인해 주세요.</Hint>
        )}
      </Card>
    </Container>
  );
};

export default LoginPage;
