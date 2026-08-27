import type { ReactNode } from "react";
import { BottomSheet } from "@/shared";
import { useAuth } from "@/features/auth/context/useAuth";
import FeedbackButton from "@/features/feedback/components/feedbackButton";
import useModal from "@/shared/hooks/useModal";
import { TriggerButton, MenuList, MenuRow } from "./profileMenu.styles";

interface ProfileMenuProps {
  children: ReactNode;
}

const ProfileMenu = ({ children }: ProfileMenuProps) => {
  const { isOpen, setIsOpen } = useModal();
  const { user, logout } = useAuth();

  const close = () => setIsOpen(false);

  const handleLogout = () => {
    close();
    logout();
  };

  return (
    <>
      <TriggerButton type="button" onClick={() => setIsOpen(true)}>
        {children}
      </TriggerButton>
      <BottomSheet isOpen={isOpen} onClose={close} title={user?.displayName ?? "메뉴"}>
        <MenuList>
          <MenuRow onClick={close}>
            <FeedbackButton />
          </MenuRow>
          <MenuRow onClick={handleLogout}>로그아웃</MenuRow>
        </MenuList>
      </BottomSheet>
    </>
  );
};

export default ProfileMenu;
