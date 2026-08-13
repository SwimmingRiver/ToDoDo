import "@/App.css";
import Header from "@/layouts/header/header";
import Footer from "@/layouts/footer/footer";
import { Outlet } from "react-router-dom";

import { useEffect, useRef, useState } from "react";
import { Container, Main } from "@/App.styles";
import SNB from "@/layouts/snb/snb";
import MobileDrawer from "@/layouts/snb/mobileDrawer";
import MobileHeader from "@/layouts/mobileHeader/mobileHeader";
import BottomTabBar from "@/layouts/bottomTabBar/bottomTabBar";
import { BOTTOM_TAB_BAR_HEIGHT } from "@/layouts/bottomTabBar/bottomTabBar.styles";
import styled from "styled-components";
import { useMediaQuery } from "@/shared/hooks";
// @/features/todo 배럴은 TodoList/TodoDetail/TodoForm까지 재수출한다. App 청크는
// 모든 보호 라우트의 공통 경로라 여기 들어가는 건 전부 크리티컬 패스이므로,
// 실제로 쓰는 훅만 직접 가져온다.
import { useTodo } from "@/features/todo/hooks";

const App = () => {
  const [isopen, setIsOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isMobile = useMediaQuery("tablet");
  const { useRunStartupMaintenance } = useTodo();
  const hasRunMaintenanceRef = useRef(false);

  // 인증된 레이아웃(App) 마운트 시 1회. 세션 중 재마운트되어도 다시 실행되지 않도록
  // ref로 막는다(라우트 이동으로는 App이 재마운트되지 않지만 방어적으로 둔다).
  useEffect(() => {
    if (!hasRunMaintenanceRef.current) {
      hasRunMaintenanceRef.current = true;
      useRunStartupMaintenance.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container>
      {isMobile ? (
        <MobileHeader onAvatarClick={() => setIsMobileMenuOpen(true)} />
      ) : (
        <Header onMenuOpen={() => setIsMobileMenuOpen(true)} />
      )}
      <ContentContainer>
        <SNB isopen={isopen} setIsOpen={setIsOpen} />
        <Main $bottomInset={isMobile ? BOTTOM_TAB_BAR_HEIGHT : 0}>
          <Outlet />
        </Main>
      </ContentContainer>
      {isMobile ? <BottomTabBar /> : <Footer />}
      <MobileDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
    </Container>
  );
};

const ContentContainer = styled.div`
  display: flex;
  height: 100%;
`;

export default App;
