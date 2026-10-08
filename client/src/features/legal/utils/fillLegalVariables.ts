import type { LegalConfig } from "../config";

const MISSING_LABELS: Record<keyof LegalConfig, string> = {
  sellerName: "[판매자명 미정]",
  contactEmail: "[연락처 미정]",
  effectiveDate: "[시행일 미정]",
  privacyOfficer: "[보호책임자 미정]",
};

export const LEGAL_VARIABLE_KEYS = Object.keys(MISSING_LABELS) as (keyof LegalConfig)[];

const isLegalVariable = (key: string): key is keyof LegalConfig => key in MISSING_LABELS;

/** 본문의 {{key}}를 설정값으로 바꾼다. 비어 있으면 미정 표시를 넣어 빠뜨린 값이 화면에 드러나게 한다. */
export const fillLegalVariables = (text: string, config: LegalConfig): string =>
  text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!isLegalVariable(key)) return match;
    const value = config[key].trim();
    return value === "" ? MISSING_LABELS[key] : value;
  });
