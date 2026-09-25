import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

/** 좁은 화면에선 탭 줄과 select가 두 줄로 wrap된다. */
const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
`;

/* recurrence.styles.tsx의 TabList/TabButton 패턴을 그대로 따른다 — 필터 바는
   카드 밖 상단에 놓이므로 높이만 조금 낮게 잡는다. */
const TabList = styled.div`
  display: flex;
  flex: 1 1 280px;
  height: 36px;
  border-bottom: 1px solid ${colors.border.tertiary};
`;

const TabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: ${({ $active }) => ($active ? colors.brand.strong : colors.text.secondary)};
  border-bottom: 2px solid ${({ $active }) => ($active ? colors.brand.strong : "transparent")};
  transition: color 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: ${colors.brand.strong};
  }
`;

/* todoForm.styles.tsx의 Select와 같은 모양. */
const ProjectSelect = styled.select`
  flex: 0 1 220px;
  min-width: 160px;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};
  color: ${colors.text.primary};
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: ${colors.brand.strong};
  }
`;

export { Bar, TabList, TabButton, ProjectSelect };
