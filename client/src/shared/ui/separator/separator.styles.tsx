import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const SeparatorContainer = styled.div<{ direction: "row" | "column" }>`
  flex: 0 0 10px;
  cursor: ${(props) =>
    props.direction === "row" ? "col-resize" : "row-resize"};
  ${(props) =>
    props.direction === "row" ? "width: 10px;" : "height: 10px; width: 100%;"}
  background-color: ${colors.background.primary};
  &:hover {
    background-color: ${colors.border.tertiary};
    transition: background-color 0.3s ease;
  }
`;

export { SeparatorContainer };
