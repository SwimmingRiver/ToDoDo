import React from "react";

import Separator from "../../components/separator";
import Panel from "../../components/panel";
import useResize from "../../hooks/useResize";

const ResizeableLayout = ({
  children1,
  children2,
  direction,
}: {
  children1: React.ReactNode;
  children2: React.ReactNode;
  direction: "row" | "column";
}) => {
  const { containerRef, handleMouseDown, firstRatio, secondRatio } =
    useResize(direction);
  return (
    <div
      ref={containerRef}
      className="resizeable-layout"
      style={{ display: "flex", flexDirection: direction, height: "100%" }}
    >
      <Panel ratio={firstRatio}>{children1}</Panel>
      <Separator direction={direction} handleMouseDown={handleMouseDown} />
      <Panel ratio={secondRatio}>{children2}</Panel>
    </div>
  );
};

export default ResizeableLayout;
