import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { media } from "@/styles/breakpoints";

export const Heading = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${colors.text.primary};
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
`;

export const UsageText = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${colors.text.tertiary};
`;

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: ${colors.text.secondary};
`;

export const TextInput = styled.input`
  height: 36px;
  padding: 0 10px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  background: ${colors.background.primary};
  color: ${colors.text.primary};
  font-size: 14px;
  min-width: 0;
`;

export const Notice = styled.p`
  margin: 0;
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

export const Row = styled.div`
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 132px 84px 28px;
  gap: 6px;
  align-items: center;

  /* 좁은 화면에서는 체크박스+제목(+삭제)을 1줄, 날짜+우선순위를 2줄로 접는다.
     자식 순서(체크박스 → 제목 → 날짜 → 우선순위 → 삭제)는 고정이라 nth-child로
     grid-area를 배정한다. */
  ${media.mobile} {
    grid-template-columns: 20px minmax(0, 1fr) minmax(0, 1fr) 28px;
    grid-template-areas:
      "check title title delete"
      ".     date  priority .";
    row-gap: 8px;

    & > *:nth-child(1) {
      grid-area: check;
    }
    & > *:nth-child(2) {
      grid-area: title;
    }
    & > *:nth-child(3) {
      grid-area: date;
    }
    & > *:nth-child(4) {
      grid-area: priority;
    }
    & > *:nth-child(5) {
      grid-area: delete;
    }
  }
`;

export const ParentRow = styled(Row)`
  grid-template-columns: 40px minmax(0, 1fr) 132px 84px;
  padding-bottom: 8px;
  border-bottom: 1px solid ${colors.border.tertiary};

  ${media.mobile} {
    grid-template-columns: 40px minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      "label title title"
      ".     date  priority";

    & > *:nth-child(1) {
      grid-area: label;
    }
    & > *:nth-child(2) {
      grid-area: title;
    }
    & > *:nth-child(3) {
      grid-area: date;
    }
    & > *:nth-child(4) {
      grid-area: priority;
    }
  }
`;

export const RowLabel = styled.span`
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

export const Select = styled.select`
  height: 36px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  background: ${colors.background.primary};
  color: ${colors.text.primary};
`;

export const IconButton = styled.button`
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: ${colors.text.tertiary};
  cursor: pointer;
`;

export const TextButton = styled.button`
  align-self: flex-start;
  border: none;
  background: none;
  padding: 4px 0;
  color: ${colors.brand.strong};
  font-size: 13px;
  cursor: pointer;
`;

export const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-top: 12px;
`;

export const FooterGroup = styled.div`
  display: flex;
  gap: 8px;
`;

export const PrimaryButton = styled.button`
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: ${colors.brand.strong};
  color: ${colors.brand.onStrong};
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const SecondaryButton = styled.button`
  height: 40px;
  padding: 0 14px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  background: ${colors.background.primary};
  color: ${colors.text.primary};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
