import { styled, keyframes } from "styled-components";
import { NavLink } from "react-router-dom";
import { colors } from "@/styles/colors";

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;
const fadeOut = keyframes`from { opacity: 1; } to { opacity: 0; }`;
const slideIn = keyframes`from { transform: translateX(-100%); } to { transform: translateX(0); }`;
const slideOut = keyframes`from { transform: translateX(0); } to { transform: translateX(-100%); }`;

export const Overlay = styled.div<{ $isClosing: boolean }>`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 9998;
  animation: ${({ $isClosing }) => ($isClosing ? fadeOut : fadeIn)} 0.2s ease forwards;
`;

export const DrawerContainer = styled.div<{ $isClosing: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: 280px;
  height: 100vh;
  background-color: #fff;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  animation: ${({ $isClosing }) => ($isClosing ? slideOut : slideIn)} 0.25s ease forwards;
`;

export const UserSection = styled.div`
  padding: 24px 20px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #f0f0f0;
`;

export const UserImage = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 50%;
`;

export const UserInfo = styled.div`
  flex: 1;
`;

export const UserName = styled.p`
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
`;

export const LogoutButton = styled.button`
  font-size: 13px;
  background: none;
  border: none;
  color: #5f6368;
  cursor: pointer;
  padding: 0;
  margin-top: 2px;

  &:hover {
    color: ${colors.brand.secondary};
  }
`;

export const NavList = styled.nav`
  padding: 8px 12px;
  flex: 1;
`;

export const NavItem = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 10px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: ${({ $active }) => ($active ? colors.brand.secondary : "#1a1a1a")};
  background-color: ${({ $active }) => ($active ? "#E8F5EF" : "transparent")};
  border-radius: 8px;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: ${({ $active }) => ($active ? "#D5EDE4" : "#f1f3f4")};
  }
`;

export const NavNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 10px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: #1a1a1a;
  background-color: transparent;
  border-radius: 8px;
  text-decoration: none;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: #f1f3f4;
  }

  &.active {
    color: ${colors.brand.secondary};
    background-color: #E8F5EF;

    &:hover {
      background-color: #D5EDE4;
    }
  }
`;
