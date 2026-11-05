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
 * 본문 문장 자체를 바꾸는 변경은 이 구조로 표현되지 않으니(본문은 판 하나뿐) 그때는 다시 설계할 것.
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
];

/**
 * 전자상거래법상 통신판매업자 신원정보. 약관 본문이 아니라 푸터에 표시하는 정보라서
 * 바꿔도 사전 공지 대상이 아니다. 빈 값은 화면에서 해당 줄이 대체 문구로 표시된다.
 */
export const BUSINESS_INFO = {
  tradeName: "투도도(TODODO)",
  representative: "강수영",
  registrationNumber: "266-61-00839",
  /** 통신판매업 신고번호. 신고 전이면 비워 둔다 — 결제를 켜기 전에 채울 것. */
  mailOrderNumber: "",
  address: "경상남도 김해시 경원로73번길 1, 6층 602-가8호(내동)",
  phone: "010-2054-1294",
} as const;
