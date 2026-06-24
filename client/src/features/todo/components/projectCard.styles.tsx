import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import type { Status } from "@/styles/statusColors";
import { statusColors } from "@/styles/statusColors";

export const CardContainer = styled.div<{ $isOverdue?: boolean }>`
  border-radius: 12px;
  overflow: hidden;
  border: 0.5px solid
    ${({ $isOverdue }) =>
      $isOverdue ? colors.danger.subtle : "var(--color-border-tertiary, #E5E7EB)"};
`;

export const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  cursor: pointer;
`;

export const CardLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
`;

export const ColorDot = styled.span<{ $isOverdue?: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $isOverdue }) =>
    $isOverdue ? colors.danger.main : colors.brand.secondary};
  flex-shrink: 0;
`;

export const CardTitleGroup = styled.div`
  min-width: 0;
`;

export const CardTitle = styled.p`
  font-size: 14px;
  font-weight: 500;
  margin: 0;
  color: var(--color-text-primary, ${colors.text.primary});
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const CardSubtitle = styled.p`
  font-size: 11px;
  color: var(--color-text-tertiary, ${colors.text.tertiary});
  margin: 2px 0 0;
`;

export const CardRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

export const OverdueBadge = styled.span`
  font-size: 11px;
  padding: 3px 8px;
  border-radius: var(--border-radius-md, 6px);
  background: var(--color-background-danger, ${colors.danger.background});
  color: var(--color-text-danger, ${colors.danger.text});
  white-space: nowrap;
`;

export const IconButton = styled.button<{
  $variant?: "default" | "danger" | "expand";
}>`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 15px;
  padding: 0;
  color: ${({ $variant }) =>
    $variant === "danger"
      ? colors.danger.main
      : $variant === "expand"
        ? colors.text.secondary
        : colors.text.tertiary};

  &:hover {
    color: ${({ $variant }) =>
      $variant === "danger"
        ? colors.danger.text
        : $variant === "expand"
          ? colors.text.primary
          : colors.text.secondary};
  }

`;

export const ProgressBar = styled.div`
  height: 3px;
  background: var(--color-background-secondary, ${colors.background.secondary});
`;

export const ProgressFill = styled.div<{
  $progress: number;
  $isOverdue?: boolean;
}>`
  width: ${({ $progress }) => $progress}%;
  height: 100%;
  background-color: ${({ $isOverdue }) =>
    $isOverdue ? colors.danger.main : colors.brand.secondary};
  transition: width 0.3s ease;
`;

export const ExpandedArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-top: 0.5px solid var(--color-border-tertiary, #e5e7eb);
  background: ${colors.background.secondary};
  max-height: 260px;
  overflow-y: auto;
`;

export const ChildTodoCardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
`;

export const EmptyChildMessage = styled.p`
  margin: 0;
  padding: 8px 4px;
  font-size: 12px;
  color: ${colors.text.tertiary};
  text-align: center;
`;

export const ChildCardWrapper = styled.div<{ $status: Status }>`
  border-radius: 10px;
  border: 0.5px solid ${({ $status }) => statusColors[$status].border};
  overflow: hidden;
  background: ${colors.background.primary};
`;

export const ChildCardContainer = styled.div`
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const InlineStatusRow = styled.div`
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-top: 0.5px solid var(--color-border-tertiary, ${colors.border.tertiary});
  background: ${colors.background.secondary};
`;

export const StatusPill = styled.button<{ $status: Status; $isActive: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid ${({ $status }) => statusColors[$status].border};
  background: ${({ $isActive, $status }) =>
    $isActive ? statusColors[$status].light : "transparent"};
  color: ${({ $status }) => statusColors[$status].main};
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background: ${({ $status }) => statusColors[$status].light};
  }
`;

export const StatusDotTrigger = styled.button`
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: 50%;
`;

export const StatusDotButton = styled.button`
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: 50%;
`;

export const ChildCardLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
`;

export const ChildCardStatusDot = styled.span<{ $status: Status }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $status }) => statusColors[$status].main};
  flex-shrink: 0;
`;

export const ChildCardTitle = styled.p`
  font-size: 13px;
  font-weight: 400;
  margin: 0;
  color: ${colors.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
`;

export const ChildCardRight = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
`;

export const SheetDeleteButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 14px 16px;
  background: none;
  border: none;
  border-top: 0.5px solid var(--color-border-tertiary, ${colors.border.tertiary});
  color: ${colors.danger.main};
  font-size: 14px;
  cursor: pointer;
  &:hover {
    color: ${colors.danger.text};
  }
`;

