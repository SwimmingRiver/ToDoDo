import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BottomSheet } from "@/shared";
import { BILLING_ENABLED } from "@/features/billing/config";
import { useAuth } from "@/features/auth/context/useAuth";
import useModal from "@/shared/hooks/useModal";
import { TriggerButton, MenuList, MenuRow } from "./profileMenu.styles";

interface ProfileMenuProps {
  children: ReactNode;
}

/** 결제가 켜진 빌드에서만 렌더한다 — 꺼진 빌드의 기존 테스트가 라우터 없이 렌더하므로 useNavigate를 격리한다. */
const PremiumMenuRow = ({ onNavigate }: { onNavigate: () => void }) => {
  const navigate = useNavigate();
  return (
    <MenuRow
      onClick={() => {
        onNavigate();
        navigate("/premium");
      }}
    >
      프리미엄
    </MenuRow>
  );
};

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
          {BILLING_ENABLED && <PremiumMenuRow onNavigate={close} />}
          <MenuRow onClick={handleLogout}>로그아웃</MenuRow>
        </MenuList>
      </BottomSheet>
    </>
  );
};

export default ProfileMenu;
