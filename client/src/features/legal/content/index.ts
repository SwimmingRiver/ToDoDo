import type { LegalDocument, LegalSlug } from "../types/legal.type";
import { PRIVACY_2026_11_04 } from "./editions/2026-11-04/privacy";
import { REFUND_2026_11_04 } from "./editions/2026-11-04/refund";
import { TERMS_2026_11_04 } from "./editions/2026-11-04/terms";
import { PRIVACY } from "./privacy";
import { REFUND } from "./refund";
import { TERMS } from "./terms";

export interface LegalEdition {
  /** 이 본문의 시행일. LEGAL_REVISIONS의 판 시행일 중 하나여야 한다(content 테스트가 지킨다). */
  effectiveOn: string;
  document: LegalDocument;
}

/**
 * 문서별 본문 판, 오래된 순. 판매자 표기 같은 값만 바뀌는 판(LEGAL_REVISIONS)은 본문을 새로 두지 않고
 * 직전 본문을 그대로 쓴다. 본문 문장이 바뀌는 판만 여기 추가한다.
 * 화면은 resolveLegalEdition으로 오늘(서울) 시행 중인 본문을 고른다.
 */
export const LEGAL_EDITIONS: Record<LegalSlug, LegalEdition[]> = {
  terms: [
    { effectiveOn: "2026-11-04", document: TERMS_2026_11_04 },
    { effectiveOn: "2026-11-27", document: TERMS },
  ],
  privacy: [
    { effectiveOn: "2026-11-04", document: PRIVACY_2026_11_04 },
    { effectiveOn: "2026-11-27", document: PRIVACY },
  ],
  refund: [
    { effectiveOn: "2026-11-04", document: REFUND_2026_11_04 },
    { effectiveOn: "2026-11-27", document: REFUND },
  ],
};

/** 문서별 가장 최신 판 본문. 테스트·링크 라벨 확인용이며, 화면은 시행일 기준으로 LEGAL_EDITIONS에서 고른다. */
export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  terms: TERMS,
  privacy: PRIVACY,
  refund: REFUND,
};

export { LEGAL_LINKS } from "./legalLinks";
