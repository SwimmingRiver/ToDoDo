import { styled } from "styled-components";
import { NavLink } from "react-router-dom";
import { colors } from "@/styles/colors";

/** 탭바 전체 높이(약): padding 10px*2 + 아이콘 20px + gap 4px + 라벨 약 13px */
export const BOTTOM_TAB_BAR_HEIGHT = 57;

const TabBarContainer = styled.nav`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  padding: 10px 0;
  background-color: ${colors.background.primary};
  border-top: 0.5px solid ${colors.border.tertiary};
  z-index: 10;
`;

const TabNavLink = styled(NavLink)`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  font-size: 11px;
  color: ${colors.text.tertiary};
  text-decoration: none;

  &.active {
    color: ${colors.brand.primary};
    font-weight: 500;
  }
`;

export { TabBarContainer, TabNavLink };
