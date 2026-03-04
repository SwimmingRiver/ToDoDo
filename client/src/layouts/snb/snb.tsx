import {
  ArrowLeft,
  ArrowRight,
  CalendarCheckIcon,
  ChartPieIcon,
  KanbanIcon,
  ListCheckIcon,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import styled from "styled-components";

const SNB = ({
  isopen,
  setIsOpen,
}: {
  isopen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <SNBContainer $isopen={isopen}>
      {isopen && (
        <>
          <SidebarItem
            $active={pathname === "/todo"}
            onClick={() => navigate("/todo")}
          >
            <ListCheckIcon />
            <span>list</span>
          </SidebarItem>
          <SidebarItem
            $active={pathname === "/calendar"}
            onClick={() => navigate("/calendar")}
          >
            <CalendarCheckIcon />
            <span>calendar</span>
          </SidebarItem>
          <SidebarItem
            $active={pathname === "/pie-chart"}
            onClick={() => navigate("/pie-chart")}
          >
            <ChartPieIcon />
            <span>chart</span>
          </SidebarItem>
          <SidebarItem
            $active={pathname === "/kanban"}
            onClick={() => navigate("/kanban")}
          >
            <KanbanIcon />
            <span>kanban</span>
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
const SidebarItem = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  cursor: pointer;
  font-size: 20px;
  font-weight: 500;
  color: ${({ $active }) => ($active ? "#1c72eb" : "#1a1a1a")};
  background-color: ${({ $active }) => ($active ? "#e8f0fe" : "transparent")};
  border-radius: 8px;
  &:hover {
    background-color: ${({ $active }) => ($active ? "#e8f0fe" : "#e0e0e0")};
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
