import { css, keyframes, styled } from "styled-components";
import { media } from "../../../../styles/breakpoints";
import { colors } from "@/styles/colors";
import { statusColors, type Status } from "@/styles/statusColors";
import { ChildTodoCardList } from "../projectCard.styles";

const slideIn = keyframes`
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 100;
  animation: ${fadeIn} 0.3s ease-out;
`;

const Panel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  width: 50%;
  height: 100vh;
  background-color: white;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  z-index: 101;
  animation: ${slideIn} 0.3s ease-out;
  display: flex;
  flex-direction: column;

  ${media.tablet} {
    width: 70%;
  }

  ${media.mobile} {
    width: 100%;
  }
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid ${colors.border.tertiary};

  ${media.mobile} {
    padding: 16px;
  }
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${colors.text.secondary};
  padding: 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background-color: #e0ede8;
    color: ${colors.brand.secondary};
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.secondary};
    outline-offset: 2px;
  }
`;

const PanelContent = styled.div`
  flex: 1;
  padding: 24px;
  overflow-y: auto;

  ${media.mobile} {
    padding: 16px;
  }
`;

const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

/**
 * 라벨과 그 행의 보조 액션을 나란히 두는 행.
 * 액션을 별도 블록으로 내리지 않고 라벨 행의 남는 오른쪽을 쓰는 이유는, 이 패널이
 * 이미 매우 긴 폼이라 세로 공간을 추가로 쓰는 비용이 크기 때문이다.
 */
const LabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 20px;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &::placeholder {
    color: ${colors.text.tertiary};
  }

  &:focus {
    border-color: ${colors.brand.secondary};
    box-shadow: 0 0 0 3px rgba(29, 158, 117, 0.12);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  line-height: 1.5;
  font-family: inherit;
  /* color를 명시하는 이유: 하이라이트 오버레이(DescriptionOverlay)가 같은 색으로
     본문을 그려야 하는데, 미지정이면 UA 기본색이라 두 값이 미세하게 달라진다. */
  color: ${colors.text.primary};
  /* 높이는 useAutoGrowTextArea가 관리한다. 수동 리사이즈 핸들은 auto-grow와 서로 싸우고,
     우하단 핸들이 라벨 행 액션과 시각적으로 충돌하기도 해서 끈다. */
  resize: none;
  overflow: hidden;
  min-height: 100px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &::placeholder {
    color: ${colors.text.tertiary};
  }

  &:focus {
    border-color: ${colors.brand.secondary};
    box-shadow: 0 0 0 3px rgba(29, 158, 117, 0.12);
  }
`;

/**
 * TextArea 위에 겹쳐 본문을 다시 그리는 레이어. 링크 구간만 색과 밑줄을 받는다.
 *
 * 아래 텍스트 박스 관련 값들은 TextArea와 **정확히 같아야** 한다. 하나라도 어긋나면
 * 줄바꿈 위치가 달라져 오버레이가 컨테이너를 넘친다. TextArea를 고칠 때 여기도 같이 고칠 것.
 */
const DescriptionOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: 8px;

  /* ↓ TextArea와 일치시켜야 하는 값들 */
  padding: 12px 14px;
  border: 1px solid transparent;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: ${colors.text.primary};
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
`;

/** 오버레이에서 링크로 인식된 구간. 색만으로 구분하지 않도록 밑줄을 함께 준다. */
const OverlayLink = styled.span`
  /* brand.secondary(#1D9E75)는 흰 배경 대비 3.39:1로 WCAG AA(4.5:1)에 미달한다.
     brand.primary(#0F6E56)는 6.20:1로 통과.
     다만 #0F6E56과 본문색(#1A1A1A)의 대비는 2.81:1이라 색만으로는 구분이 보장되지
     않는다(WCAG 1.4.1). 밑줄은 장식이 아니라 필수 요건이다. */
  color: ${colors.brand.primary};
  text-decoration: underline;
  text-underline-offset: 2px;
`;

/**
 * 설명 입력 필드와 하이라이트 오버레이를 겹치는 컨테이너.
 *
 * 포커스가 있을 때는 오버레이를 끄고 순정 textarea로 되돌린다. 한글 IME 조합, 캐럿,
 * 드래그 선택은 전부 포커스 상태에서만 일어나므로 이 상태에서는 브라우저 네이티브
 * 동작을 그대로 쓰는 것이다. 결과적으로 두 레이어가 동시에 보이는 순간이 없어,
 * 줄바꿈이 어긋나더라도 글자가 두 벌 겹쳐 보이는 고스팅이 발생할 수 없다.
 */
const DescriptionField = styled.div<{ $highlight: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;

  ${({ $highlight }) =>
    $highlight &&
    css`
      ${TextArea} {
        color: transparent;
      }

      &:focus-within ${TextArea} {
        color: ${colors.text.primary};
      }

      &:focus-within ${DescriptionOverlay} {
        opacity: 0;
      }
    `}
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 36px 12px 14px;
  font-size: 14px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus {
    border-color: ${colors.brand.secondary};
    box-shadow: 0 0 0 3px rgba(29, 158, 117, 0.12);
  }
`;

const InfoRow = styled.div`
  display: flex;
  gap: 16px;

  ${media.mobile} {
    flex-direction: column;
    gap: 12px;
  }
`;

const InfoItem = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: ${colors.text.primary};
`;

const PanelFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid ${colors.border.tertiary};

  ${media.mobile} {
    padding: 12px 16px;
  }
`;

const PanelFooterActions = styled.div`
  display: flex;
  gap: 12px;
  margin-left: auto;

  ${media.mobile} {
    flex-direction: column-reverse;
    width: 100%;
  }
`;

const Button = styled.button<{ $variant?: "primary" | "secondary" | "danger" }>`
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  min-height: 44px;
  transition: background-color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;

  &:focus-visible {
    outline: 2px solid ${colors.brand.secondary};
    outline-offset: 2px;
  }

  ${({ $variant }) =>
    $variant === "primary"
      ? `
    background-color: ${colors.brand.secondary};
    color: white;
    border: none;
    box-shadow: 0 1px 2px rgba(15, 110, 86, 0.15);

    &:hover {
      background-color: ${colors.brand.primary};
      box-shadow: 0 2px 6px rgba(15, 110, 86, 0.25);
    }

    &:active {
      background-color: ${colors.brand.primary};
      box-shadow: 0 1px 2px rgba(15, 110, 86, 0.15);
    }
  `
      : $variant === "danger"
        ? `
    background-color: white;
    color: ${colors.danger.text};
    border: 1px solid ${colors.border.danger};
    display: inline-flex;
    align-items: center;
    gap: 6px;

    &:hover {
      background-color: ${colors.danger.background};
    }

    &:active {
      background-color: ${colors.danger.subtle};
    }
  `
        : `
    background-color: white;
    color: ${colors.text.secondary};
    border: 1px solid ${colors.border.secondary};

    &:hover {
      background-color: ${colors.background.secondary};
      border-color: ${colors.text.tertiary};
    }
  `}

  ${media.mobile} {
    width: 100%;
    padding: 12px;
  }
`;

const StatusBadge = styled.span<{ $status: Status }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background-color: ${({ $status }) => statusColors[$status].light};
  color: ${({ $status }) => statusColors[$status].main};
`;

const priorityStyles = {
  high: {
    border: colors.danger.main,
    background: colors.danger.background,
    text: colors.danger.text,
  },
  medium: {
    border: "#F59E0B",
    background: "#FEF3E2",
    text: "#B45309",
  },
  low: {
    border: colors.border.tertiary,
    background: colors.background.secondary,
    text: colors.text.secondary,
  },
} as const;

const PriorityBadge = styled.span<{ $priority: keyof typeof priorityStyles }>`
  display: inline-block;
  padding: 4px 10px 4px 8px;
  border-left: 3px solid ${({ $priority }) => priorityStyles[$priority].border};
  border-radius: 0 4px 4px 0;
  font-size: 12px;
  font-weight: 500;
  background-color: ${({ $priority }) => priorityStyles[$priority].background};
  color: ${({ $priority }) => priorityStyles[$priority].text};
`;

const ErrorText = styled.span`
  color: ${colors.danger.text};
  font-size: 12px;
`;

const SubtaskSectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const SubtaskLabelGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const SubtaskCountBadge = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${colors.text.tertiary};
  background-color: ${colors.background.secondary};
  border-radius: 10px;
  padding: 1px 8px;
`;

const SubtaskHeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

const SubtaskIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: ${colors.text.secondary};
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background-color: #e0ede8;
    color: ${colors.brand.secondary};
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.secondary};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  ${media.tablet} {
    min-width: 32px;
    min-height: 32px;
  }
`;

// ChildTodoCardList(배경 없는 세로 리스트)를 그대로 재사용하되, 하위 투두가 많을 때
// 패널 자체가 무한정 길어지지 않도록 max-height + overflow-y만 얹는다.
const SubtaskListContainer = styled(ChildTodoCardList)`
  max-height: 400px;
  overflow-y: auto;
  padding: 0;

  ${media.mobile} {
    max-height: 260px;
  }
`;

const EmptyChildAddButton = styled.button`
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  padding: 8px 12px;
  color: ${colors.brand.secondary};
  font-size: 12px;
  font-weight: 500;
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export {
  Overlay,
  Panel,
  PanelHeader,
  PanelTitle,
  CloseButton,
  PanelContent,
  FormContainer,
  FormGroup,
  Label,
  LabelRow,
  Input,
  TextArea,
  DescriptionField,
  DescriptionOverlay,
  OverlayLink,
  Select,
  InfoRow,
  InfoItem,
  InfoLabel,
  InfoValue,
  PanelFooter,
  PanelFooterActions,
  Button,
  StatusBadge,
  PriorityBadge,
  ErrorText,
  SubtaskSectionHeader,
  SubtaskLabelGroup,
  SubtaskCountBadge,
  SubtaskHeaderActions,
  SubtaskIconButton,
  SubtaskListContainer,
  EmptyChildAddButton,
};
