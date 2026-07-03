import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

export const RecurrenceSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid ${colors.border.tertiary};
`;

export const CheckboxLabel = styled.label<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  user-select: none;

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: inherit;
  }
`;

export const DisabledHint = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: ${colors.text.tertiary};
  margin-top: -4px;
`;

// 기존 DetailSection의 grid-template-rows 트랜지션 패턴(todoFrom.styles.tsx) 재사용.
export const RecurrenceDetailPanel = styled.div<{ $isOpen: boolean }>`
  display: grid;
  grid-template-rows: ${({ $isOpen }) => ($isOpen ? "1fr" : "0fr")};
  transition: grid-template-rows 0.3s ease-in-out;
  overflow: hidden;
`;

export const RecurrenceDetailContent = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
`;

export const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${colors.text.secondary};
`;

export const MonthlyInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const InfoLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${colors.text.secondary};
`;

export const MonthlySubCaption = styled.span`
  font-size: 11px;
  color: ${colors.text.tertiary};
  padding-left: 20px;
`;

export const EndOptionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  font-size: 13px;
  color: ${colors.text.primary};

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  input[type="radio"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  input[type="date"] {
    padding: 6px 8px;
    font-size: 13px;
    border: 1px solid ${colors.border.secondary};
    border-radius: ${radius.sm};
    outline: none;

    &:focus {
      border-color: ${colors.brand.secondary};
    }
  }
`;

export const ErrorText = styled.span`
  font-size: 12px;
  color: ${colors.danger.text};
`;

// RecurrenceTypeTabs 전용 — kanbanBoard.styles.tsx의 MobileTabButton 패턴 재사용(재정의).
export const TabList = styled.div`
  display: flex;
  height: 44px;
  border-bottom: 1px solid ${colors.border.tertiary};
`;

export const TabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: ${({ $active }) => ($active ? colors.brand.secondary : colors.text.secondary)};
  border-bottom: 2px solid
    ${({ $active }) => ($active ? colors.brand.secondary : "transparent")};
  transition: color 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: ${colors.brand.secondary};
  }
`;

// WeekdayPicker 전용 — weekStrip.styles.tsx의 DayCell 패턴을 축소 재정의(today 피처 비종속).
export const WeekdayGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const DayChip = styled.button`
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;

  &:focus-visible {
    outline: 2px solid ${colors.brand.primary};
    outline-offset: 2px;
  }
`;

// 시각 크기는 36px(스펙 2-3절), 실제 히트 영역은 DayChip의 44px로 확보한다.
export const DayChipCircle = styled.span<{ $selected: boolean }>`
  width: 36px;
  height: 36px;
  border-radius: ${radius.full};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  background-color: ${({ $selected }) => ($selected ? colors.brand.primary : "transparent")};
  color: ${({ $selected }) => ($selected ? "#FFFFFF" : colors.text.tertiary)};
  transition: background-color 0.15s ease, color 0.15s ease;
`;
