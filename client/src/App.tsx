import "@/App.css";
import Header from "@/layouts/header/header";
import Footer from "@/layouts/footer/footer";
import { Outlet } from "react-router-dom";

import { useState } from "react";
import { Container, Main } from "@/App.styles";
import SNB from "@/layouts/snb/snb";
import styled from "styled-components";

const App = () => {
  const [isopen, setIsOpen] = useState(true);
  return (
    <Container>
      <Header />
      <ContentContainer>
        <SNB isopen={isopen} setIsOpen={setIsOpen} />
        <Main>
          <Outlet />
        </Main>
      </ContentContainer>
      <Footer />
    </Container>
  );
};

const ContentContainer = styled.div`
  display: flex;
  height: 100%;
`;

export default App;
