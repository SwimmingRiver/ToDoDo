import { ButtonGroup, PrimaryButton, SecondaryButton } from "./ctaButtons.styles";

interface CtaButtonsProps {
  onPrimaryClick: () => void;
  onSecondaryClick: () => void;
}

/**
 * 히어로/하단 재노출 섹션에서 공용으로 쓰는 2버튼 그룹.
 * desktop에서는 가로 배치, mobile(≤tablet)에서는 세로 스택 — media query로 자동 처리.
 * 탭 순서상 "Google로 시작하기"(주 전환 경로)가 먼저 오도록 DOM 순서를 고정한다.
 */
const CtaButtons = ({ onPrimaryClick, onSecondaryClick }: CtaButtonsProps) => {
  return (
    <ButtonGroup>
      <PrimaryButton type="button" onClick={onPrimaryClick}>
        Google로 시작하기
      </PrimaryButton>
      <SecondaryButton type="button" onClick={onSecondaryClick}>
        로그인 없이 체험하기
      </SecondaryButton>
    </ButtonGroup>
  );
};

export default CtaButtons;
export type { CtaButtonsProps };
