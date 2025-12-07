import { SeparatorContainer } from "./separator.styles";

const Separator = ({
  handleMouseDown,
  direction,
}: {
  handleMouseDown: () => void;
  direction: "row" | "column";
}) => {
  return (
    <SeparatorContainer onMouseDown={handleMouseDown} direction={direction} />
  );
};

export default Separator;
