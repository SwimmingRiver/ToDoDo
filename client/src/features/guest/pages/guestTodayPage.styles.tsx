import { styled } from "styled-components";

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`;

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
`;

export { PageContainer, Content, List };
