import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "react-router-dom";
// @/shared 배럴 대신 직접 경로를 쓴다. 배럴은 ui/hooks/utils 전체를 초기 청크의
// 모듈 그래프에 올리는데, 그 안의 utils/descriptionLinks → linkifyjs는 부피
// 대부분이 TLD 데이터 테이블이라 트리셰이킹이 한 번만 어긋나도 통째로 딸려온다.
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import ErrorBoundary from "@/shared/ui/errorBoundary/errorBoundary";
import { AuthProvider } from "@/features/auth/context/authProvider";
import { initSentry } from "@/shared/lib/sentry";
import { router } from "./router";

// 다른 모든 초기화(Firebase, React Query 등)보다 먼저 호출해야
// 이후 렌더링/네트워크 단계에서 발생하는 에러도 빠짐없이 캡처할 수 있다.
initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1분: 탭 전환 시 불필요한 재조회 방지
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ReactQueryDevtools initialIsOpen={false} />
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
