import type { LegalDocument } from "../types/legal.type";

export const REFUND: LegalDocument = {
  slug: "refund",
  title: "환불 정책",
  sections: [
    {
      heading: "환불 기간",
      items: [
        "첫 결제와 매월 갱신 결제 모두, 결제일로부터 14일 이내에 요청하면 전액 환불합니다.",
        "결제일로부터 14일이 지나면 해당 결제는 환불되지 않습니다. 이때 구독을 해지하면 이미 결제한 기간이 끝날 때까지 프리미엄을 이용할 수 있습니다.",
        "7일 무료 체험은 결제가 없으므로 환불 대상이 아닙니다.",
      ],
    },
    {
      heading: "요청 방법",
      items: [
        "{{contactEmail}}로 가입한 이메일 주소와 결제일을 알려 주세요.",
        "또는 Paddle이 보낸 결제 영수증 이메일의 안내 링크로 요청할 수 있습니다.",
      ],
    },
    {
      heading: "처리",
      items: [
        "환불은 결제를 처리한 Paddle을 통해 원래 결제 수단으로 돌려드립니다. 실제 입금까지 걸리는 기간은 결제 수단에 따라 다릅니다.",
        "환불하면 해당 구독이 해지되고 프리미엄 이용이 바로 끝납니다.",
      ],
    },
  ],
};
