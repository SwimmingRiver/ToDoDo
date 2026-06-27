import {
  ArrowLeft,
  ArrowRight,
  CalendarCheckIcon,
  KanbanIcon,
  ListCheckIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import styled from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const NAV_ITEMS = [
  { path: "/todo", icon: <ListCheckIcon />, label: "list" },
  { path: "/calendar", icon: <CalendarCheckIcon />, label: "calendar" },
  { path: "/kanban", icon: <KanbanIcon />, label: "kanban" },
];

const SNB = ({
  isopen,
  setIsOpen,
}: {
  isopen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  return (
    <SNBContainer $isopen={isopen}>
      {isopen && (
        <>
          {NAV_ITEMS.map(({ path, icon, label }) => (
            <SidebarNavLink key={path} to={path}>
              {icon}
              <span>{label}</span>
            </SidebarNavLink>
          ))}
        </>
      )}
      <SidebarButton
        onClick={() => setIsOpen(!isopen)}
        aria-label={isopen ? "사이드바 닫기" : "사이드바 열기"}
      >
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

  ${media.tablet} {
    display: none;
  }
`;

const SidebarNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  cursor: pointer;
  font-size: 20px;
  font-weight: 500;
  color: #1a1a1a;
  background-color: transparent;
  border-radius: 8px;
  text-decoration: none;

  &:hover {
    background-color: #e0e0e0;
  }

  &.active {
    color: ${colors.brand.secondary};
    background-color: #e8f0fe;

    &:hover {
      background-color: #e8f0fe;
    }
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
