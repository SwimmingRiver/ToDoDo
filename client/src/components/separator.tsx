import { styled } from "styled-components";

const SeparatorContainer = styled.div`
  flex: 0 0 10px;
  cursor: col-resize;
  width: 10px;
  background-color: white;
  &:hover {
    background-color: #e0e0e0;
    transition: background-color 0.3s ease;
  }
`;
const Separator = ({ handleMouseDown }: { handleMouseDown: () => void }) => {
  return <SeparatorContainer onMouseDown={handleMouseDown} />;
};

export default Separator;
