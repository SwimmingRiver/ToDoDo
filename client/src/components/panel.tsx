import { styled } from "styled-components";

const PanelContainer = styled.div`
  border: 1px solid #e0e0e0;
  padding: 10px;
  width: 100%;
  height: 100%;
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
