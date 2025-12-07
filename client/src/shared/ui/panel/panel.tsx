import { PanelContainer } from "./panel.styles";

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
