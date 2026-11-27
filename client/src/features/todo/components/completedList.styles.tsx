import { css, styled } from "styled-components";
import { colors } from "@/styles/colors";
import { statusColors } from "@/styles/statusColors";

// ── 탭 ──────────────────────────────────────────────

export const TabList = styled.div`
  display: flex;
  gap: 4px;
  padding: 3px;
  margin-bottom: 12px;
  border-radius: 10px;
  background: ${colors.background.secondary};
  flex-shrink: 0;
`;

export const TabButton = styled.button`
  flex: 1;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: ${colors.text.secondary};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    color: ${colors.text.primary};
  }

  &[aria-selected="true"] {
    background: ${colors.surface.raised};
    color: ${colors.brand.strong};
    box-shadow: 0 0 0 0.5px ${colors.border.tertiary};
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 1px;
  }
`;

// ── 월 묶음 ──────────────────────────────────────────

export const MonthSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
`;

export const MonthHeading = styled.h3`
  margin: 8px 2px 0;
  font-size: 12px;
  font-weight: 600;
  color: ${colors.text.tertiary};
`;

export const ArchiveNotice = styled.p`
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: ${colors.danger.background};
  color: ${colors.danger.text};
  flex-shrink: 0;
`;

export const ArchiveLoadingHint = styled.p`
  margin: 0;
  padding: 4px 2px;
  font-size: 12px;
  color: ${colors.text.tertiary};
  flex-shrink: 0;
`;

// ── 완료 카드 ────────────────────────────────────────

export const CompletedCardContainer = styled.div`
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  border: 0.5px solid ${colors.border.tertiary};
`;

export const CardToggle = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;

  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: -2px;
  }
`;

export const CheckMark = styled.span`
  display: flex;
  flex-shrink: 0;
  color: ${statusColors.done.main};
`;

export const CardTitleGroup = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
`;

export const CardTitle = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${colors.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const CardSubtitle = styled.span`
  margin-top: 2px;
  font-size: 11px;
  color: ${colors.text.tertiary};
`;

export const DoneDate = styled.span`
  flex-shrink: 0;
  font-size: 12px;
  color: ${colors.text.secondary};
  white-space: nowrap;
`;

export const Chevron = styled.span`
  display: flex;
  flex-shrink: 0;
  color: ${colors.text.secondary};
`;

export const ExpandedArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-top: 0.5px solid ${colors.border.tertiary};
  background: ${colors.background.secondary};
  max-height: 260px;
  overflow-y: auto;

  @media (min-width: 768px) {
    max-height: 400px;
  }
`;

export const Description = styled.p`
  margin: 0;
  padding: 2px 4px 4px;
  font-size: 13px;
  color: ${colors.text.secondary};
  white-space: pre-wrap;
  word-break: break-word;
`;

export const EmptyExpandedMessage = styled.p`
  margin: 0;
  padding: 8px 4px;
  font-size: 12px;
  color: ${colors.text.tertiary};
  text-align: center;
`;

export const ChildRow = styled.div<{ $dimmed: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: ${colors.background.primary};
  border: 0.5px solid ${colors.border.tertiary};

  ${({ $dimmed }) =>
    $dimmed &&
    css`
      opacity: 0.45;
    `}
`;

export const ChildStatusDot = styled.span<{ $status: keyof typeof statusColors }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: ${({ $status }) => statusColors[$status].main};
`;

export const ChildTitle = styled.span`
  min-width: 0;
  font-size: 13px;
  color: ${colors.text.primary};
  overflow-wrap: anywhere;
`;
