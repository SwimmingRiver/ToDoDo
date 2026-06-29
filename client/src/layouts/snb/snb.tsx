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
  { path: "/todo", icon: <ListCheckIcon />, label: "목록" },
  { path: "/calendar", icon: <CalendarCheckIcon />, label: "캘린더" },
  { path: "/kanban", icon: <KanbanIcon />, label: "칸반" },
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
      {NAV_ITEMS.map(({ path, icon, label }) => (
        <SidebarNavLink key={path} to={path} $isopen={isopen}>
          {({ isActive }) => (
            <>
              <IconWrapper
                $isopen={isopen}
                $active={isActive}
                aria-label={!isopen ? label : undefined}
              >
                {icon}
              </IconWrapper>
              {isopen && <span>{label}</span>}
            </>
          )}
        </SidebarNavLink>
      ))}
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

const IconWrapper = styled.span<{ $isopen: boolean; $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ $isopen }) => ($isopen ? "auto" : "36px")};
  height: ${({ $isopen }) => ($isopen ? "auto" : "36px")};
  border-radius: 8px;
  flex-shrink: 0;
  transition: background-color 0.15s ease;

  ${({ $isopen, $active }) =>
    !$isopen && $active
      ? `background-color: #E8F5EF; color: ${colors.brand.secondary};`
      : ""}
`;

const SidebarNavLink = styled(NavLink)<{ $isopen: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ $isopen }) => ($isopen ? "10px" : "0")};
  padding: ${({ $isopen }) => ($isopen ? "10px" : "4px")};
  justify-content: ${({ $isopen }) => ($isopen ? "flex-start" : "center")};
  cursor: pointer;
  font-size: 20px;
  font-weight: 500;
  color: #1a1a1a;
  background-color: transparent;
  border-radius: 8px;
  text-decoration: none;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: #e0e0e0;
  }

  &.active {
    color: ${colors.brand.secondary};
    background-color: ${({ $isopen }) => ($isopen ? "#E8F5EF" : "transparent")};

    &:hover {
      background-color: ${({ $isopen }) => ($isopen ? "#D5EDE4" : "transparent")};
    }

    &:hover ${IconWrapper} {
      background-color: #D5EDE4;
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
