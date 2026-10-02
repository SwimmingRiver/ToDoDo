import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

// 행 규칙은 오늘 화면 할 일 목록(todayTodoItem.styles의 Row)과 맞춘다:
// 위아래 12px·좌우 0, 앞 표시와 내용 사이 12px, 최소 높이 44px. 구분선은 두지 않는다.
// 호버 배경만 글자 밖으로 8px 넓게 칠하려고 List에 좌우 8px 여백을 두고 버튼을 그만큼 바깥으로 뺀다
// (List가 overflow-y: auto라 음수 여백이 List 밖으로 나가면 가로 스크롤이 생긴다).
export const List = styled.ul`
  margin: 0 -8px;
  padding: 0 8px;
  list-style: none;
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

export const ItemButton = styled.button`
  width: calc(100% + 16px);
  margin: 0 -8px;
  min-height: 44px;
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  column-gap: 12px;
  align-items: center;
  padding: 12px 8px;
  border: none;
  border-radius: ${radius.sm};
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background-color: ${colors.background.secondary};
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: -2px;
  }
`;

export const TextBlock = styled.span`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const UnreadDot = styled.span<{ $visible: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $visible }) => ($visible ? colors.brand.strong : "transparent")};
`;

export const Title = styled.span`
  display: block;
  font-size: 14px;
  color: ${colors.text.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Meta = styled.span`
  display: block;
  font-size: 12px;
  color: ${colors.text.secondary};
`;

export const Message = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.text.secondary};
`;

export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;
