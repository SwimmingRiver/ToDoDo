import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const Container = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  /* 라벨 행의 남는 오른쪽 공간을 쓴다 — 세로 공간을 추가로 차지하지 않기 위해서다. */
  margin-left: auto;
  min-width: 0;
`;

/**
 * 링크 액션 트리거. 44px 터치 타겟을 확보하되 라벨 행 높이를 밀어 올리지 않도록
 * 음수 마진으로 흡수한다(todayTodoItem의 Checkbox/DeleteButton과 같은 기법).
 */
const trigger = `
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 44px;
  margin: -12px 0;
  padding: 0 10px;
  max-width: 100%;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  text-decoration: none;
  /* 13px는 WCAG large text(18.66px bold / 24px)가 아니므로 대비 4.5:1이 적용된다.
     brand.fill(#1D9E75)는 흰 배경에서 3.39:1로 미달이라 쓸 수 없다.
     brand.strong(#0F6E56)는 흰 배경 6.20:1, tint 배경(#E8F5EF) 위에서도 5.54:1로 통과. */
  color: ${colors.brand.strong};
  background-color: ${colors.brand.tint};
  transition: background-color 0.15s ease;

  &:hover {
    background-color: #d9ece4;
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

const OpenLink = styled.a`
  ${trigger}
`;

const ToggleButton = styled.button`
  ${trigger}
`;

const TriggerLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Popover = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 10;
  min-width: 220px;
  max-width: min(320px, 80vw);
  padding: 4px;
  display: flex;
  flex-direction: column;
  background-color: ${colors.background.primary};
  border: 1px solid ${colors.border.tertiary};
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
`;

const PopoverLink = styled.a`
  display: flex;
  align-items: center;
  gap: 8px;
  /* 팝오버 항목도 각각 44px 터치 타겟을 지킨다. */
  min-height: 44px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13px;
  color: ${colors.text.primary};
  text-decoration: none;

  &:hover {
    background-color: ${colors.background.secondary};
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: -2px;
  }
`;

const PopoverLinkText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export {
  Container,
  OpenLink,
  ToggleButton,
  TriggerLabel,
  Popover,
  PopoverLink,
  PopoverLinkText,
};
