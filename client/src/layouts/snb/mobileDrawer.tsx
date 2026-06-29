import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ListCheckIcon,
  CalendarCheckIcon,
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
  NavNavLink,
} from "./mobileDrawer.styles";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { path: "/todo", icon: <ListCheckIcon size={20} />, label: "목록" },
  { path: "/calendar", icon: <CalendarCheckIcon size={20} />, label: "캘린더" },
  { path: "/kanban", icon: <KanbanIcon size={20} />, label: "칸반" },
];

const MobileDrawer = ({ isOpen, onClose }: MobileDrawerProps) => {
  const [isClosing, setIsClosing] = useState(false);
  const { user, logout } = useAuth();

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

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
            <NavNavLink
              key={path}
              to={path}
              onClick={handleClose}
            >
              {icon}
              <span>{label}</span>
            </NavNavLink>
          ))}
        </NavList>
      </DrawerContainer>
    </>,
    document.body
  );
};

export default MobileDrawer;
