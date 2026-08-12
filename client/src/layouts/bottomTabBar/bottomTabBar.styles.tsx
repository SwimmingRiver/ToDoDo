import { styled } from "styled-components";
import { NavLink } from "react-router-dom";
import { colors } from "@/styles/colors";

/**
 * 탭바 전체 높이: padding 10px*2 + border-top 0.5px + TabNavLink 내용 높이.
 * TabNavLink는 아이콘(20px)+gap(4px)+라벨(~13px)=37px보다 터치 타겟
 * min-height: 44px가 더 크므로 실제 내용 높이는 44px가 기준이 된다.
 * 20 + 0.5 + 44 = 64.5px → 서브픽셀 반올림 오차로 인한 겹침을 피하기 위해
 * 65px로 올림한다. (기존에 37px 기준으로 계산한 57px는 실제보다 낮아
 * 하단 고정 버튼이 탭바에 7px 이상 가려지는 버그의 원인이었다)
 */
export const BOTTOM_TAB_BAR_HEIGHT = 65;

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
    color: ${colors.brand.strong};
    font-weight: 500;
  }
`;

export { TabBarContainer, TabNavLink };
