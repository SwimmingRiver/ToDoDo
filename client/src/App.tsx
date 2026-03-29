import "@/App.css";
import Header from "@/layouts/header/header";
import Footer from "@/layouts/footer/footer";
import { Outlet } from "react-router-dom";

import { useState } from "react";
import { Container, Main } from "@/App.styles";
import SNB from "@/layouts/snb/snb";
import MobileDrawer from "@/layouts/snb/mobileDrawer";
import styled from "styled-components";

const App = () => {
  const [isopen, setIsOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <Container>
      <Header onMenuOpen={() => setIsMobileMenuOpen(true)} />
      <ContentContainer>
        <SNB isopen={isopen} setIsOpen={setIsOpen} />
        <Main>
          <Outlet />
        </Main>
      </ContentContainer>
      <Footer />
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
