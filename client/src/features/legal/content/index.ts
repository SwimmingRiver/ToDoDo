import type { LegalDocument, LegalSlug } from "../types/legal.type";
import { PRIVACY } from "./privacy";
import { REFUND } from "./refund";
import { TERMS } from "./terms";

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  terms: TERMS,
  privacy: PRIVACY,
  refund: REFUND,
};

export { LEGAL_LINKS } from "./legalLinks";
