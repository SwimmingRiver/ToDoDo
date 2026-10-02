import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";
import { media } from "@/styles/breakpoints";

export { Wrapper, Trigger } from "@/layouts/themeMenu/themeMenu.styles";

export const Panel = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
  width: 340px;
  max-width: calc(100vw - 32px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: ${colors.surface.overlay};
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.md};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);

  /* 모바일 헤더에선 벨 오른쪽에 테마·아바타 버튼이 있어(360px 화면에서 벨 오른쪽 끝 ≈ 256px)
     벨 기준으로 왼쪽으로 펼치면 화면 밖으로 넘친다. 좁은 화면에선 화면 좌우에 맞춰 고정한다.
     top = 모바일 헤더 높이(56px) + 6px. */
  ${media.mobile} {
    position: fixed;
    top: 62px;
    left: 16px;
    right: 16px;
    width: auto;
    max-width: none;
  }
`;

export const StatusText = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${colors.text.secondary};
`;

export const EnableButton = styled.button`
  padding: 8px 12px;
  border: none;
  border-radius: ${radius.sm};
  background-color: ${colors.brand.strong};
  color: ${colors.brand.onStrong};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: ${colors.brand.strongHover};
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const FieldLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

// 크롬의 기본 셀렉트 화살표는 padding을 무시하고 오른쪽 테두리에 붙는다(실측).
// 기본 화살표를 숨기고 테마 색을 따르는 아이콘을 직접 얹어 여백을 맞춘다.
export const SelectField = styled.div`
  position: relative;
  display: flex;
`;

export const DefaultSelect = styled.select`
  width: 100%;
  appearance: none;
  padding: 6px 32px 6px 12px;
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.sm};
  background-color: ${colors.background.primary};
  color: ${colors.text.primary};
  font-size: 14px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const SelectArrow = styled.span`
  position: absolute;
  top: 50%;
  right: 12px;
  display: flex;
  transform: translateY(-50%);
  color: ${colors.text.secondary};
  pointer-events: none;
`;

export const TriggerSlot = styled.span`
  position: relative;
  display: inline-flex;
`;

// danger.main 위 흰 글자는 라이트 3.93:1, 다크 2.53:1로 AA 미달이라 brand.strong/onStrong 조합을 쓴다.
export const Badge = styled.span`
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background-color: ${colors.brand.strong};
  color: ${colors.brand.onStrong};
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
`;

export const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
`;

export const PanelTitle = styled.h2`
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

export const HeaderButton = styled.button`
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: ${radius.sm};
  background: none;
  color: ${colors.text.secondary};
  cursor: pointer;

  /* 버튼(28px) 안 아이콘(16px)이 본문 가장자리보다 6px 안쪽에 보이므로, 헤더 양끝 버튼은 바깥으로 당겨 맞춘다. */
  &:first-child {
    margin-left: -6px;
  }
  &:last-child {
    margin-right: -6px;
  }

  &:hover {
    background-color: ${colors.background.secondary};
    color: ${colors.text.primary};
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;
