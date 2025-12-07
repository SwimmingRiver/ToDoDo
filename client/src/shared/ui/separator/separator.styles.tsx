import { styled } from "styled-components";

const SeparatorContainer = styled.div<{ direction: "row" | "column" }>`
  flex: 0 0 10px;
  cursor: ${(props) =>
    props.direction === "row" ? "col-resize" : "row-resize"};
  ${(props) =>
    props.direction === "row" ? "width: 10px;" : "height: 10px; width: 100%;"}
  background-color: white;
  &:hover {
    background-color: #e0e0e0;
    transition: background-color 0.3s ease;
  }
`;

export { SeparatorContainer };
