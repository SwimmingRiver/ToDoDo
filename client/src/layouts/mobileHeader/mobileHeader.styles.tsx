import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const HeaderContainer = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  background-color: ${colors.background.primary};
  border-bottom: 1px solid ${colors.border.tertiary};
`;

const LogoGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LogoMark = styled.span`
  width: 24px;
  height: 24px;
  border-radius: ${radius.md};
  background-color: ${colors.brand.primary};
`;

const LogoText = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const AvatarButton = styled.button`
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
`;

const AvatarImage = styled.img`
  width: 28px;
  height: 28px;
  border-radius: ${radius.full};
  background-color: ${colors.background.secondary};
  object-fit: cover;
`;

export { HeaderContainer, LogoGroup, LogoMark, LogoText, AvatarButton, AvatarImage };
