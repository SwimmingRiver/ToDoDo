import { describe, it, expect } from "vitest";
import { LEGAL_DOCUMENTS, LEGAL_LINKS } from "..";
import { LEGAL_VARIABLE_KEYS } from "../../utils/fillLegalVariables";
import type { LegalDocument } from "../../types/legal.type";

const allText = (doc: LegalDocument): string =>
  doc.sections
    .flatMap((s) => [
      s.heading,
      ...(s.paragraphs ?? []),
      ...(s.items ?? []),
      ...(s.table ? [...s.table.headers, ...s.table.rows.flat()] : []),
    ])
    .join("\n");

describe("법적 문서 본문", () => {
  it("세 문서 모두 제목과 조항이 있고 slug가 키와 같다", () => {
    for (const [slug, doc] of Object.entries(LEGAL_DOCUMENTS)) {
      expect(doc.slug).toBe(slug);
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.sections.length).toBeGreaterThan(0);
    }
  });

  it("정의된 변수 토큰만 쓴다", () => {
    for (const doc of Object.values(LEGAL_DOCUMENTS)) {
      const tokens = [...allText(doc).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      for (const token of tokens) expect(LEGAL_VARIABLE_KEYS).toContain(token);
    }
  });

  it("표의 각 행은 헤더와 칸 수가 같다", () => {
    for (const doc of Object.values(LEGAL_DOCUMENTS)) {
      for (const section of doc.sections) {
        for (const row of section.table?.rows ?? []) {
          expect(row).toHaveLength(section.table!.headers.length);
        }
      }
    }
  });

  it("이용약관은 판매자와 Paddle 판매 주체(MoR)를 명시한다 — Paddle 심사 필수", () => {
    const text = allText(LEGAL_DOCUMENTS.terms);
    expect(text).toContain("{{sellerName}}");
    expect(text).toContain("Merchant of Record");
    expect(text).toContain("Paddle");
  });

  it("환불 정책은 14일 전액 환불을 명시한다", () => {
    expect(allText(LEGAL_DOCUMENTS.refund)).toContain("14일 이내");
  });

  it("개인정보처리방침은 국외 이전 대상과 Paddle 안내를 모두 담는다", () => {
    const text = allText(LEGAL_DOCUMENTS.privacy);
    for (const name of ["Google", "Cloudflare", "Anthropic", "Sentry", "Paddle"]) {
      expect(text).toContain(name);
    }
    expect(text).toContain("{{privacyOfficer}}");
  });

  it("링크 3개가 문서 3개를 가리킨다", () => {
    expect(LEGAL_LINKS.map((l) => l.to)).toEqual(["/terms", "/privacy", "/refund"]);
    expect(LEGAL_LINKS.map((l) => l.label)).toEqual(
      LEGAL_LINKS.map((l) => LEGAL_DOCUMENTS[l.to.slice(1) as keyof typeof LEGAL_DOCUMENTS].title),
    );
  });

  it("개인정보처리방침의 보유 기간 표가 Cloudflare로 이전하는 알림 데이터를 모두 다룬다", () => {
    const retention = LEGAL_DOCUMENTS.privacy.sections.find((s) => s.heading.includes("보유 기간"));
    const rows = retention?.table?.rows ?? [];
    const periodOf = (item: string) => rows.find(([name]) => name.includes(item))?.[1];
    expect(periodOf("알림 기기 토큰")).toBeDefined();
    expect(periodOf("알림 일정")).toBeDefined();
    // 7일이 지난 발송 기록은 다음 알림 처리 때 정리된다(reminder-proxy alarmRunner) — "7일 후 삭제"로 단정하지 않는다.
    expect(periodOf("알림 발송 기록")).toContain("다음 알림 처리");
  });

  it("의견 항목은 실제로 저장하는 회원 식별자와 작성 시각까지 적는다(feedbackApi)", () => {
    const purpose = LEGAL_DOCUMENTS.privacy.sections.find((s) => s.heading.includes("목적"));
    const row = purpose?.table?.rows.find(([item]) => item.includes("의견"));
    expect(row?.[0]).toContain("회원 식별자");
    expect(row?.[0]).toContain("작성 시각");
  });

  it("이용약관의 환불 조항은 환불 정책 페이지로 링크한다", () => {
    const refund = LEGAL_DOCUMENTS.terms.sections.find((s) => s.heading.includes("환불"));
    expect(refund?.links).toEqual([{ to: "/refund", label: "환불 정책 보기" }]);
  });
});
