import { styled } from "styled-components";

const PanelContainer = styled.div`
  border: 1px solid #e0e0e0;
  padding: 10px;
  width: 100%;
  height: 100%;
  min-width: 0px;
  min-height: 0px;
  overflow: hidden;
`;

const Panel = ({
  children,
  ratio,
}: {
  children: React.ReactNode;
  ratio: number;
}) => {
  return (
    <PanelContainer style={{ flex: `${ratio} 1 0` }}>{children}</PanelContainer>
  );
};

export default Panel;
