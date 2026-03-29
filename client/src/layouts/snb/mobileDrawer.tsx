import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ListCheckIcon,
  CalendarCheckIcon,
  ChartPieIcon,
  KanbanIcon,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/useAuth";
import {
  Overlay,
  DrawerContainer,
  UserSection,
  UserImage,
  UserInfo,
  UserName,
  LogoutButton,
  NavList,
  NavItem,
} from "./mobileDrawer.styles";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { path: "/todo", icon: <ListCheckIcon size={20} />, label: "list" },
  { path: "/calendar", icon: <CalendarCheckIcon size={20} />, label: "calendar" },
  { path: "/pie-chart", icon: <ChartPieIcon size={20} />, label: "chart" },
  { path: "/kanban", icon: <KanbanIcon size={20} />, label: "kanban" },
];

const MobileDrawer = ({ isOpen, onClose }: MobileDrawerProps) => {
  const [isClosing, setIsClosing] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  const handleNavigate = (path: string) => {
    navigate(path);
    handleClose();
  };

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <>
      <Overlay $isClosing={isClosing} onClick={handleClose} />
      <DrawerContainer $isClosing={isClosing}>
        <UserSection>
          <UserImage src={user?.photoURL || ""} alt="user" />
          <UserInfo>
            <UserName>{user?.displayName}</UserName>
            <LogoutButton onClick={logout}>로그아웃</LogoutButton>
          </UserInfo>
        </UserSection>
        <NavList>
          {NAV_ITEMS.map(({ path, icon, label }) => (
            <NavItem
              key={path}
              $active={pathname === path}
              onClick={() => handleNavigate(path)}
            >
              {icon}
              <span>{label}</span>
            </NavItem>
          ))}
        </NavList>
      </DrawerContainer>
    </>,
    document.body
  );
};

export default MobileDrawer;
