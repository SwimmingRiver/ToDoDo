import type { LegalDocument, LegalSlug } from "../types/legal.type";
import { PRIVACY } from "./privacy";
import { REFUND } from "./refund";
import { TERMS } from "./terms";

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  terms: TERMS,
  privacy: PRIVACY,
  refund: REFUND,
};

/** 푸터·드로어·요금제 섹션이 쓰는 링크. 순서가 화면 표시 순서다. */
export const LEGAL_LINKS: readonly { to: string; label: string }[] = [
  { to: "/terms", label: TERMS.title },
  { to: "/privacy", label: PRIVACY.title },
  { to: "/refund", label: REFUND.title },
];
