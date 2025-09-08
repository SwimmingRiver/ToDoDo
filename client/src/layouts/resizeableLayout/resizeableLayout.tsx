import React from "react";
import styled from "styled-components";

const Children1 = styled.div`
  width: 50%;
  height: 100%;
  border: 1px solid #e0e0e0;
`;
const Children2 = styled.div`
  width: 50%;
  height: 100%;
  border: 1px solid #e0e0e0;
`;
const Separator = styled.div`
  flex: 0 0 10px;
  cursor: col-resize;
  background-color: white;
  &:hover {
    background-color: #e0e0e0;
    transition: background-color 0.3s ease;
  }
`;

const ResizeableLayout = ({
  children1,
  children2,
  direction,
}: {
  children1: React.ReactNode;
  children2: React.ReactNode;
  direction: "row" | "column";
}) => {
  return (
    <div
      className="resizeable-layout"
      style={{ display: "flex", flexDirection: direction }}
    >
      <Children1 className="resizeable-layout__item">{children1}</Children1>
      <Separator />
      <Children2 className="resizeable-layout__item">{children2}</Children2>
    </div>
  );
};

export default ResizeableLayout;
