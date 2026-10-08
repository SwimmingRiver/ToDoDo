type LegalSlug = "terms" | "privacy" | "refund";

interface LegalTable {
  headers: string[];
  rows: string[][];
}

/** 문서의 한 조항. 본문 문자열에는 {{sellerName}} 같은 LEGAL_CONFIG 토큰을 쓸 수 있다. */
interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  table?: LegalTable;
  /** 다른 법적 문서로 가는 앱 내부 링크. 본문 문자열 안에서는 링크를 만들 수 없어 따로 둔다. */
  links?: { to: string; label: string }[];
}

interface LegalDocument {
  slug: LegalSlug;
  title: string;
  sections: LegalSection[];
}

export type { LegalSlug, LegalTable, LegalSection, LegalDocument };
