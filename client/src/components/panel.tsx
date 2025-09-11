import { styled } from "styled-components";

const PanelContainer = styled.div`
  width: 100%;
  height: 100%;
  border: 1px solid #e0e0e0;
  padding: 10px;
`;
const Panel = ({
  children,
  ratio,
}: {
  children: React.ReactNode;
  ratio: number;
}) => {
  return (
    <PanelContainer style={{ width: `${ratio * 100}%` }}>
      {children}
    </PanelContainer>
  );
};

export default Panel;
