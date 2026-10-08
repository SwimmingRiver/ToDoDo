/**
 * 법적 문서에 들어가는 판매자 표기. Paddle은 약관·개인정보처리방침의 이름이 Paddle 계정의
 * 판매자 정보와 정확히 같기를 요구하므로, 문서 본문은 이 값을 토큰으로만 참조한다.
 * 비어 있으면 화면에 "[판매자명 미정]"처럼 표시된다 — 심사 신청 전에 반드시 채운다.
 */
export interface LegalConfig {
  /** 개인이면 실명, 개인사업자면 상호(대표자명). */
  sellerName: string;
  contactEmail: string;
  /** 예: "2026년 10월 20일" */
  effectiveDate: string;
  /** 개인정보 보호책임자 이름. */
  privacyOfficer: string;
}

export const LEGAL_CONFIG: LegalConfig = {
  sellerName: "",
  contactEmail: "",
  effectiveDate: "",
  privacyOfficer: "",
};
