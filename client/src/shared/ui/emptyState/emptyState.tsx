import type { LucideIcon } from "lucide-react";
import {
  Container,
  IconWrapper,
  Title,
  Description,
  ActionButton,
} from "./emptyState.styles";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: LucideIcon;
  onAction?: () => void;
}

const EmptyState = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
}: EmptyStateProps) => {
  return (
    <Container>
      <IconWrapper>
        <Icon size={36} />
      </IconWrapper>
      <Title>{title}</Title>
      <Description>{description}</Description>
      {actionLabel && onAction && (
        <ActionButton onClick={onAction}>
          {ActionIcon && <ActionIcon size={18} />}
          {actionLabel}
        </ActionButton>
      )}
    </Container>
  );
};

export default EmptyState;
