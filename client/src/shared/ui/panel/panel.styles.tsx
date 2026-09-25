import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const PanelContainer = styled.div`
  border: 1px solid ${colors.border.tertiary};
  display: flex;
  justify-content: center;
  padding: 8px;
  width: 100%;
  min-width: 0px;
  min-height: 0px;
  overflow: auto;
`;

export { PanelContainer };
