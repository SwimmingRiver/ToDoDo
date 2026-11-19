import type { DuplicateInfo } from "@tododo/core/dist/entitlement/index.js";
import { BannerBox, SecondaryButton } from "../pages/premiumPage.styles";

const LATER_LABEL = { paddle: "웹", apple: "App Store", google: "Google Play" } as const;

interface DuplicateSubscriptionBannerProps {
  duplicate: DuplicateInfo | null;
  onManage: () => void;
  disabled?: boolean;
}

/** 나중에 시작한 결제를 해지하도록 안내한다. 웹 구독(paddle)일 때만 포털로 갈 수 있고, 스토어 구독은 문구만 보여준다. */
const DuplicateSubscriptionBanner = ({ duplicate, onManage, disabled }: DuplicateSubscriptionBannerProps) => {
  if (!duplicate) return null;
  return (
    <BannerBox role="alert">
      <span>
        구독이 두 군데서 결제되고 있어요. 나중에 시작한 {LATER_LABEL[duplicate.laterSource]} 구독을 해지해 주세요
      </span>
      {duplicate.laterSource === "paddle" && (
        <SecondaryButton type="button" disabled={disabled} onClick={onManage}>
          구독 관리
        </SecondaryButton>
      )}
    </BannerBox>
  );
};

export default DuplicateSubscriptionBanner;
