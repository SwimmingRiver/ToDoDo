import { styled } from "styled-components";

const SeparatorContainer = styled.div`
  flex: 0 0 10px;
  cursor: col-resize;
  background-color: white;
  &:hover {
    background-color: #e0e0e0;
    transition: background-color 0.3s ease;
  }
`;
const Separator = () => {
  return <SeparatorContainer>separator</SeparatorContainer>;
};

export default Separator;
