import "@/App.css";
import Header from "@/layouts/header/header";
import Footer from "@/layouts/footer/footer";
import { Outlet } from "react-router-dom";

import { useEffect, useState } from "react";
import { Container, Main } from "@/App.styles";
import SNB from "@/layouts/snb/snb";
import MobileDrawer from "@/layouts/snb/mobileDrawer";
import MobileHeader from "@/layouts/mobileHeader/mobileHeader";
import BottomTabBar from "@/layouts/bottomTabBar/bottomTabBar";
import { BOTTOM_TAB_BAR_HEIGHT } from "@/layouts/bottomTabBar/bottomTabBar.styles";
import FeedbackForm from "@/features/feedback/components/feedbackForm";
import styled from "styled-components";
import { useMediaQuery } from "@/shared/hooks";
// @/features/todo 배럴은 TodoList/TodoDetail/TodoForm까지 재수출한다. App 청크는
// 모든 보호 라우트의 공통 경로라 여기 들어가는 건 전부 크리티컬 패스이므로,
// 실제로 쓰는 훅만 직접 가져온다.
import { useRunStartupMaintenance } from "@/features/todo/hooks";
import { claimStartupMaintenance } from "@/features/todo/utils/startupMaintenanceGate";
import { useAuth } from "@/features/auth/context/useAuth";
import { useSyncTodosToCalendar } from "@/features/calendarIntegration/hooks";
import { useReminderRefresh } from "@/features/reminders/hooks/useReminderRefresh";
import { usePushTokenSync } from "@/features/reminders/hooks/usePushTokenSync";
import { useForegroundReminders } from "@/features/reminders/hooks/useForegroundReminders";
import { useNotificationClickNavigation } from "@/features/reminders/hooks/useNotificationClickNavigation";
import { useEntitlementSync } from "@/features/entitlement/hooks/useEntitlementSync";
import { ReminderPromptProvider } from "@/features/reminders/components/reminderPrompt/reminderPrompt";

const App = () => {
  const [isopen, setIsOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const isMobile = useMediaQuery("tablet");
  const runStartupMaintenance = useRunStartupMaintenance();
  useSyncTodosToCalendar();
  useReminderRefresh();
  usePushTokenSync();
  useForegroundReminders();
  useNotificationClickNavigation();
  useEntitlementSync();
  const { user } = useAuth();

  // 사용자별로 페이지 수명 동안 1회. App은 셸 밖 라우트(/terms 등)에 다녀오면 재마운트되므로
  // useRef 대신 모듈 수준 가드로 막는다(StrictMode의 이중 실행도 같은 가드가 막는다).
  useEffect(() => {
    if (user && claimStartupMaintenance(user.uid)) {
      runStartupMaintenance.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return (
    <ReminderPromptProvider>
      <Container>
        {isMobile ? (
          <MobileHeader onAvatarClick={() => setIsMobileMenuOpen(true)} />
        ) : (
          <Header onMenuOpen={() => setIsMobileMenuOpen(true)} />
        )}
        <ContentContainer>
          <SNB
            isopen={isopen}
            setIsOpen={setIsOpen}
            onFeedbackClick={() => setIsFeedbackOpen(true)}
          />
          <Main $bottomInset={isMobile ? BOTTOM_TAB_BAR_HEIGHT : 0}>
            <Outlet />
          </Main>
        </ContentContainer>
        {isMobile ? <BottomTabBar /> : <Footer />}
        <MobileDrawer
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          onFeedbackClick={() => setIsFeedbackOpen(true)}
        />
        {/* MobileDrawer/SNB의 트리거는 각자 자리에 두되, 폼 상태는 여기(App)에서
            소유한다 — 드로어는 닫히면 서브트리 전체가 언마운트되므로 폼이 그
            자식이면 방금 열리려던 상태까지 같이 사라진다. */}
        <FeedbackForm
          isOpen={isFeedbackOpen}
          onClose={() => setIsFeedbackOpen(false)}
        />
      </Container>
    </ReminderPromptProvider>
  );
};

// overflow:hidden이 핵심이다 — 이게 없으면 어느 라우트든 콘텐츠가 깊이 중첩된
// flex 체인(Container→ContentContainer→Main→페이지 컨테이너)의 자동 최소 크기
// 규칙에 걸려 이 요소가 shrink되지 못하고, Footer/BottomTabBar가 화면 밖으로
// 밀려나는 문제가 생긴다(실측으로 확인된 원인).
const ContentContainer = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
`;

export default App;
