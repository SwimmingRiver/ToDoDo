/**
 * 법적 문서에 들어가는 판매자 표기. Paddle은 약관·개인정보처리방침의 이름이 Paddle 계정의
 * 판매자 정보와 정확히 같기를 요구하므로, 문서 본문은 이 값을 토큰으로만 참조한다.
 * 비어 있으면 화면에 "[판매자명 미정]"처럼 표시된다 — 심사 신청 전에 반드시 채운다.
 */
export interface LegalConfig {
  /** 개인이면 실명, 개인사업자면 Paddle 판매자명과 같은 표기. */
  sellerName: string;
  contactEmail: string;
  /** 예: "2026년 10월 20일". 판 목록의 effectiveOn에서 만들어진다. */
  effectiveDate: string;
  /** 개인정보 보호책임자 이름. */
  privacyOfficer: string;
}

/**
 * 약관·방침의 한 판. 약관 11조·방침 13조는 "시행 7일 전부터 서비스 화면에 알린다"고 하므로,
 * 새 판은 시행일 7일 전 이전에 배포돼야 한다. 배포되면 시행일 전까지는 이전 판 + 변경 예정 공지가,
 * 시행일(서울 날짜)부터는 새 판이 자동으로 보인다 — 시행일 당일 배포가 필요 없다.
 * 본문 문장이 바뀌는 판은 content/index.ts LEGAL_EDITIONS에 같은 시행일로 본문을 추가한다(판매자 표기만
 * 바뀌는 판은 본문을 추가하지 않고 직전 본문을 그대로 쓴다). 본문을 여기 두지 않는 이유: 이 파일은 모든 화면의
 * 푸터가 import하므로 본문을 넣으면 약관 전문이 공유 청크에 실린다.
 */
export interface LegalRevision {
  /** 서울 기준 시행일, "YYYY-MM-DD". 이전 판보다 늦어야 한다. */
  effectiveOn: string;
  /** 변경 예정 공지·변경 이력에 쓰는 한 줄 요약. */
  change: string;
  config: Omit<LegalConfig, "effectiveDate">;
}

export const LEGAL_REVISIONS: LegalRevision[] = [
  {
    effectiveOn: "2026-11-04",
    change: "제정",
    config: {
      sellerName: "강수영",
      contactEmail: "dodonriver@gmail.com",
      privacyOfficer: "강수영",
    },
  },
  {
    effectiveOn: "2026-11-12",
    change:
      "판매자 표기를 '강수영'에서 'TODODO'로 변경(개인사업자 등록에 따른 변경, 대표자 강수영). 그 밖의 내용은 같습니다.",
    config: {
      sellerName: "TODODO",
      contactEmail: "dodonriver@gmail.com",
      privacyOfficer: "강수영",
    },
  },
  {
    // 본문이 바뀌는 판 — 본문은 content/index.ts LEGAL_EDITIONS의 같은 시행일 항목이다.
    effectiveOn: "2026-11-27",
    change:
      "앱(App Store·Google Play) 결제에 맞춰 환불·해지·체험·결제 정보 조항을 보완합니다. 결제한 곳과 관계없이 결제일로부터 14일 이내 전액 환불 기준을 같게 적용하고, App Store 결제의 환불은 Apple에 요청하며, App Store 구독은 탈퇴와 별개로 직접 해지해야 한다는 내용을 추가합니다. 웹 결제 이용자에게 적용되는 내용은 바뀌지 않습니다.",
    config: {
      sellerName: "TODODO",
      contactEmail: "dodonriver@gmail.com",
      privacyOfficer: "강수영",
    },
  },
  {
    // 본문이 바뀌는 판(약관·방침) — 본문은 content/index.ts LEGAL_EDITIONS의 같은 시행일 항목이다.
    // 이용자에게 불리한 변경(탈퇴 후 보관 항목 추가)이라 약관 제11조에 따라 30일 전부터 공지한다 → main 배포는 11-28 전.
    effectiveOn: "2026-12-28",
    change:
      "회원 탈퇴 후 같은 계정으로 다시 가입해 7일 무료 체험을 반복해서 받지 못하도록, 체험을 사용한 계정은 탈퇴 후 1년 동안 체험 사용 확인값(로그인 계정 식별자를 원래 값으로 되돌릴 수 없게 변환한 값)을 보관합니다. Apple 로그인으로 받는 정보를 추가합니다.",
    config: {
      sellerName: "TODODO",
      contactEmail: "dodonriver@gmail.com",
      privacyOfficer: "강수영",
    },
  },
];

/**
 * 전자상거래법상 통신판매업자 신원정보. 약관 본문이 아니라 푸터에 표시하는 정보라서
 * 바꿔도 사전 공지 대상이 아니다. 빈 값은 화면에서 해당 줄이 대체 문구로 표시된다.
 */
export const BUSINESS_INFO = {
  tradeName: "투도도(TODODO)",
  representative: "강수영",
  registrationNumber: "266-61-00839",
  /** 통신판매업 신고번호(김해시, 2026-11 신고 수리). 등록증 표기 그대로. */
  mailOrderNumber: "제2026-경남김해-1588호",
  address: "경상남도 김해시 경원로73번길 1, 6층 602-가8호(내동)",
  phone: "010-2054-1294",
} as const;
