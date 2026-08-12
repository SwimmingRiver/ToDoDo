import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";
import { urgencyColors } from "@/styles/urgencyColors";
import type { Urgency } from "@/shared/utils/due";

/** Checkbox 링 색상용 2단계(+없음) — Urgency의 "normal"은 체크박스에서 "none"과 동일하게 취급한다. */
type CheckboxUrgency = Extract<Urgency, "soon" | "danger"> | "none";

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 12px 0;
  border-bottom: 1px solid ${colors.border.tertiary};

  &:last-child {
    border-bottom: none;
  }
`;

const Checkbox = styled.button<{ $isDone: boolean; $urgency: CheckboxUrgency }>`
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -13px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;

  &::after {
    content: "";
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: ${radius.full};
    box-sizing: border-box;
    border: 1.5px solid
      ${({ $isDone, $urgency }) => {
        if ($isDone) return "transparent";
        if ($urgency === "danger") return colors.border.danger;
        if ($urgency === "soon") return urgencyColors.soon.main;
        return colors.border.secondary;
      }};
    background-color: ${({ $isDone }) =>
      $isDone ? colors.brand.fill : "transparent"};
    transition: background-color 0.15s ease;
  }

  svg {
    position: relative;
    z-index: 1;
  }
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
`;

const Title = styled.span<{ $isDone: boolean }>`
  min-width: 0;
  font-size: 14px;
  color: ${({ $isDone }) => ($isDone ? colors.text.tertiary : colors.text.primary)};
  text-decoration: ${({ $isDone }) => ($isDone ? "line-through" : "none")};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DescriptionRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  color: ${colors.text.secondary};
`;

/**
 * description에 링크가 있음을 알리는 표시.
 * 여기서 URL 자체를 링크로 만들지 않는 이유는 이 행 전체가 상세 진입 클릭 영역이라서다
 * — 잘린 URL을 탭 타겟으로 만들면 "링크 열기"와 "상세 열기"가 같은 자리에서 경쟁한다.
 */
const LinkIndicator = styled.span`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  margin-top: 3px;
  color: ${colors.brand.strong};
`;

const Description = styled.span`
  min-width: 0;
  font-size: 12px;
  /* 이제 description에 줄바꿈을 입력할 수 있으므로 pre-wrap으로 보존한다.
     다만 행이 무한정 길어지면 목록의 훑어보기 성능이 떨어지므로 2줄에서 자른다.
     긴 URL이 행 폭을 밀어내지 않도록 anywhere로 강제 줄바꿈한다. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const TimeLabel = styled.span`
  flex-shrink: 0;
  font-size: 12px;
  color: ${colors.text.secondary};
`;

const OverdueBadge = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 99px;
  background-color: ${colors.danger.background};
  color: ${colors.danger.text};
`;

const DueSoonBadge = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 99px;
  background-color: ${urgencyColors.soon.background};
  color: ${urgencyColors.soon.text};
`;

const DeleteButton = styled.button`
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -13px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: ${colors.text.tertiary};
  transition: color 0.2s ease;

  &:hover {
    color: ${colors.danger.main};
  }
`;

export {
  Row,
  Checkbox,
  Content,
  TitleRow,
  Title,
  DescriptionRow,
  LinkIndicator,
  Description,
  TimeLabel,
  OverdueBadge,
  DueSoonBadge,
  DeleteButton,
};
export type { CheckboxUrgency };
