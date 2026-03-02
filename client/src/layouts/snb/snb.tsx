import {
  ArrowLeft,
  ArrowRight,
  CalendarCheckIcon,
  ChartPieIcon,
  ListCheckIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";

const SNB = ({
  isopen,
  setIsOpen,
}: {
  isopen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  const navigate = useNavigate();
  return (
    <SNBContainer $isopen={isopen}>
      {isopen && (
        <>
          <SidebarItem onClick={() => navigate("/todo")}>
            <ListCheckIcon />
            <span>list</span>
          </SidebarItem>
          <SidebarItem onClick={() => navigate("/calendar")}>
            <CalendarCheckIcon />
            <span>calendar</span>
          </SidebarItem>
          <SidebarItem onClick={() => navigate("/pie-chart")}>
            <ChartPieIcon />
            <span>chart</span>
          </SidebarItem>
        </>
      )}
      <SidebarButton onClick={() => setIsOpen(!isopen)}>
        {isopen ? <ArrowLeft size={20} /> : <ArrowRight size={20} />}
      </SidebarButton>
    </SNBContainer>
  );
};

const SNBContainer = styled.div<{ $isopen: boolean }>`
  height: 100%;
  width: ${({ $isopen }) => ($isopen ? "200px" : "40px")};
  background-color: #f1f3f4;
  border-right: 1px solid #e0e0e0;
  transition: all 0.3s ease;
  transform: translateX(${({ $isopen }) => ($isopen ? "0" : "-10%")});
`;
const SidebarItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  cursor: pointer;
  font-size: 20px;
  font-weight: 500;
  color: #1a1a1a;
  &:hover {
    background-color: #e0e0e0;
  }
`;

const SidebarButton = styled.button`
  cursor: pointer;
  border-radius: 100%;
  position: absolute;
  top: 200px;
  right: -20px;
  width: 40px;
  height: 40px;
  border: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background-color: #e0e0e0;
  }
`;

export default SNB;
