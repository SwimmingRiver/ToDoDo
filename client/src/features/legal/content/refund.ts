import type { LegalDocument } from "../types/legal.type";

/**
 * 2026-11-27 시행 판. 결제한 곳(웹 Paddle·Google Play·App Store)과 관계없이 기준은 하나이고,
 * Apple이 개발자에게 환불 권한을 주지 않는 App Store 결제만 신청처가 다르다
 * (docs/superpowers/specs/2026-11-18-mobile-iap-design.md 11절).
 * 14일은 Paddle 심사 요건(환불 기간 14~90일)과 국내 청약철회 7일을 함께 만족하는 최소 기간이다.
 */
export const REFUND: LegalDocument = {
  slug: "refund",
  title: "환불 정책",
  sections: [
    {
      heading: "환불 기간",
      items: [
        "웹, Google Play, App Store 중 어디에서 결제했든 같은 기준을 적용합니다.",
        "첫 결제와 매월 갱신 결제 모두, 결제일로부터 14일 이내에 요청하면 전액 환불합니다.",
        "결제일로부터 14일이 지나면 해당 결제는 환불되지 않습니다. 이때 구독을 해지하면 이미 결제한 기간이 끝날 때까지 프리미엄을 이용할 수 있습니다.",
        "7일 무료 체험 기간에는 결제가 없으므로 환불 대상이 아닙니다.",
      ],
    },
    {
      heading: "요청 방법",
      items: [
        "웹에서 결제한 경우: {{contactEmail}}로 가입한 이메일 주소와 결제일을 알려 주세요. Paddle이 보낸 결제 영수증 이메일의 안내 링크로 요청할 수도 있습니다.",
        "Google Play에서 결제한 경우: {{contactEmail}}로 가입한 이메일 주소와 Google Play 주문번호(GPA.로 시작)를 알려 주세요. Google Play 구매 내역에서 Google에 직접 요청할 수도 있습니다.",
        "App Store에서 결제한 경우: App Store 결제의 환불은 Apple이 결정하며, 운영자가 직접 환불할 수 없습니다. reportaproblem.apple.com에서 Apple에 요청해 주세요. 운영자는 Apple이 의견을 물으면 위 기준에 따라 답하지만, 최종 결정은 Apple의 정책에 따릅니다.",
      ],
    },
    {
      heading: "처리",
      items: [
        "환불은 결제를 처리한 곳(Paddle, Google, Apple)을 통해 원래 결제 수단으로 돌려드립니다. 실제 입금까지 걸리는 기간은 결제 수단에 따라 다릅니다.",
        "환불하면 해당 구독이 해지되고 그 결제에 따른 프리미엄 이용이 바로 끝납니다. 다른 곳에서 결제한 구독이 남아 있으면 그 구독으로 계속 이용할 수 있습니다.",
      ],
    },
  ],
};
