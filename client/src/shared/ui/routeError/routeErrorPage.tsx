import { useEffect, useRef, useState } from "react";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { canAutoReload, isChunkLoadError, markAutoReload } from "./chunkReload";
import {
  Actions,
  Container,
  Description,
  PrimaryButton,
  SecondaryButton,
  Title,
  type RouteErrorVariant,
} from "./routeErrorPage.styles";

// 라우터 안에서 난 오류(렌더·loader·lazy 청크)는 react-router가 직접 잡아 main.tsx의
// ErrorBoundary까지 올라가지 않는다. 그래서 라우트 errorElement로 이 화면을 달아
// 기본 "Unexpected Application Error" 대신 서비스 화면을 보여주고 Sentry 보고도 여기서 한다.
//
// router.tsx가 eager로 import하므로 auth·Firestore·@/shared 배럴 같은 무거운 의존을
// 끌어오지 말 것 — 오류 화면이 다시 실패하거나 초기 번들이 커진다.

interface RouteErrorPageProps {
  /** fullPage: 화면 전체(셸 밖). inline: 셸의 본문(Outlet) 자리. */
  variant: RouteErrorVariant;
}

const RouteErrorPage = ({ variant }: RouteErrorPageProps) => {
  const error = useRouteError();
  const navigate = useNavigate();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  // 렌더에서는 읽기만 한다. 기록(markAutoReload)은 effect에서 — StrictMode가 초기화
  // 함수를 두 번 불러도 두 번째 호출이 "방금 재시도했음"으로 잘못 판단하지 않게.
  // 오프라인이면 새로고침해 봐야 브라우저 오프라인 화면으로 튕기므로, 셸·오류 화면을
  // 남겨 두고 사용자가 다시 연결된 뒤 직접 새로고침하게 한다.
  const [willReload] = useState(
    () => isChunkLoadError(error) && navigator.onLine !== false && canAutoReload(),
  );
  const reportedRef = useRef(false);

  useEffect(() => {
    if (willReload) {
      markAutoReload();
      window.location.reload();
      return;
    }
    // 404는 오타·크롤러 노이즈라 보고하지 않는다.
    if (isNotFound || reportedRef.current) return;
    reportedRef.current = true;
    Sentry.captureException(error);
  }, [error, isNotFound, willReload]);

  // 새로고침 직전 오류 화면이 번쩍이지 않게 아무것도 그리지 않는다.
  if (willReload) return null;

  const goHome = () => navigate("/");

  if (isNotFound) {
    return (
      <Container $variant={variant}>
        <Title>페이지를 찾을 수 없어요</Title>
        <Description>주소가 바뀌었거나 없는 페이지예요.</Description>
        <Actions>
          <PrimaryButton type="button" onClick={goHome}>
            홈으로
          </PrimaryButton>
        </Actions>
      </Container>
    );
  }

  return (
    <Container $variant={variant}>
      <Title>문제가 발생했어요</Title>
      <Description>
        화면을 표시하는 중 오류가 생겼어요. 새로고침하거나 홈으로 이동해 주세요.
      </Description>
      <Actions>
        <PrimaryButton type="button" onClick={() => window.location.reload()}>
          새로고침
        </PrimaryButton>
        <SecondaryButton type="button" onClick={goHome}>
          홈으로
        </SecondaryButton>
      </Actions>
    </Container>
  );
};

export default RouteErrorPage;
