import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ListTodo,
  CalendarDays,
  Kanban,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/useAuth";
import ProfileMenu from "@/layouts/profileMenu/profileMenu";
import {
  Overlay,
  DrawerContainer,
  UserSection,
  UserImage,
  UserInfo,
  UserName,
  NavList,
  NavNavLink,
  FeedbackNavRow,
} from "./mobileDrawer.styles";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onFeedbackClick: () => void;
}

const NAV_ITEMS = [
  { path: "/todo", icon: <ListTodo size={20} />, label: "목록" },
  { path: "/calendar", icon: <CalendarDays size={20} />, label: "캘린더" },
  { path: "/kanban", icon: <Kanban size={20} />, label: "칸반" },
];

const MobileDrawer = ({ isOpen, onClose, onFeedbackClick }: MobileDrawerProps) => {
  const [isClosing, setIsClosing] = useState(false);
  const { user } = useAuth();

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  const handleFeedbackClick = () => {
    // FeedbackForm은 이 드로어 밖(App)에서 상태를 소유한다 — 드로어는 닫히면
    // 서브트리 전체가 언마운트되므로, 폼 상태가 그 자식이면 방금 열리려던
    // 상태까지 같이 사라진다(프로필 메뉴에서 실제로 겪은 버그).
    onFeedbackClick();
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
          <ProfileMenu>
            <UserImage src={user?.photoURL || ""} alt="user" />
            <UserInfo>
              <UserName>{user?.displayName}</UserName>
            </UserInfo>
          </ProfileMenu>
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
        <FeedbackNavRow type="button" onClick={handleFeedbackClick}>
          <MessageSquare size={20} />
          <span>의견 보내기</span>
        </FeedbackNavRow>
      </DrawerContainer>
    </>,
    document.body
  );
};

export default MobileDrawer;
