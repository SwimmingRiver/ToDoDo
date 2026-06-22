import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Container = styled.div`
  display: flex;
  align-items: center;
  padding: 8px;
  gap: 4px;
`;

const StripScroll = styled.div`
  display: flex;
  flex: 1;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const ArrowButton = styled.button`
  flex-shrink: 0;
  width: 28px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: ${colors.text.tertiary};
  border-radius: ${radius.md};

  &:hover {
    color: ${colors.text.primary};
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.primary};
    outline-offset: 2px;
  }
`;

const TodayChip = styled.button`
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${colors.brand.primary};
  color: #ffffff;
  border: none;
  border-radius: ${radius.md};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;

  &:focus-visible {
    outline: 2px solid ${colors.brand.primary};
    outline-offset: 2px;
  }
`;

const DayCell = styled.div<{ $isSelected: boolean; $isToday: boolean }>`
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: ${radius.md};
  cursor: pointer;
  box-sizing: border-box;
  background-color: ${({ $isSelected }) =>
    $isSelected ? colors.brand.primary : "transparent"};
  border: 1.5px solid
    ${({ $isSelected, $isToday }) =>
      !$isSelected && $isToday ? colors.brand.primary : "transparent"};

  &:focus-visible {
    outline: 2px solid ${colors.brand.primary};
    outline-offset: 2px;
  }
`;

const DayLabel = styled.span<{ $isSelected: boolean }>`
  font-size: 11px;
  color: ${({ $isSelected }) => ($isSelected ? "#FFFFFF" : colors.text.tertiary)};
`;

const DateLabel = styled.span<{ $isSelected: boolean; $isToday: boolean }>`
  font-size: 14px;
  font-weight: 500;
  color: ${({ $isSelected, $isToday }) =>
    $isSelected
      ? "#FFFFFF"
      : $isToday
        ? colors.brand.primary
        : colors.text.primary};
`;

const Dot = styled.span<{
  $marker: "none" | "normal" | "danger";
  $onColoredBackground: boolean;
}>`
  width: 4px;
  height: 4px;
  border-radius: ${radius.full};
  background-color: ${({ $marker, $onColoredBackground }) => {
    if ($marker === "none") return "transparent";
    if ($onColoredBackground) return "#FFFFFF";
    return $marker === "danger" ? colors.danger.main : colors.brand.primary;
  }};
`;

export { Container, StripScroll, ArrowButton, TodayChip, DayCell, DayLabel, DateLabel, Dot };
