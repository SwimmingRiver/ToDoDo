import { describe, it, expect } from "vitest";
import { LEGAL_DOCUMENTS, LEGAL_EDITIONS, LEGAL_LINKS } from "..";
import { LEGAL_REVISIONS } from "../../config";
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

  describe("결제한 곳과 관계없는 환불·해지 기준(IAP 스펙 11절)", () => {
    const refundText = () => allText(LEGAL_DOCUMENTS.refund);

    it("14일 기준은 공통 문장 하나로 쓰고, 세 결제처 모두에 적용한다고 밝힌다", () => {
      const text = refundText();
      expect(text.match(/결제일로부터 14일 이내에 요청하면 전액 환불/g)).toHaveLength(1);
      expect(text).toContain("웹, Google Play, App Store 중 어디에서 결제했든 같은 기준");
    });

    it("App Store 결제는 Apple이 결정하고 Apple에 요청한다고 안내한다", () => {
      const text = refundText();
      expect(text).toContain("App Store 결제의 환불은 Apple이 결정");
      expect(text).toContain("reportaproblem.apple.com");
    });

    it("Google Play 결제는 운영자 이메일과 주문번호로 요청받는다", () => {
      expect(refundText()).toMatch(/Google Play에서 결제한 경우: \{\{contactEmail\}\}.*GPA\./);
    });

    it("환불은 결제한 곳을 통해 처리되고 다른 결제처 구독은 유지된다고 안내한다", () => {
      const text = refundText();
      expect(text).toContain("결제를 처리한 곳(Paddle, Google, Apple)");
      expect(text).toContain("다른 곳에서 결제한 구독이 남아 있으면");
    });

    it("이용약관은 앱 결제의 처리 주체·해지 위치·앱 체험 방식을 적는다", () => {
      const section = (keyword: string) =>
        allText({ ...LEGAL_DOCUMENTS.terms, sections: LEGAL_DOCUMENTS.terms.sections.filter((s) => s.heading.includes(keyword)) });
      expect(section("판매 주체")).toContain("Apple(App Store) 또는 Google(Google Play)이 결제를 처리");
      expect(section("갱신")).toContain("App Store 또는 Google Play의 구독 관리에서 해지");
      const trial = section("체험");
      expect(trial).toContain("웹과 앱을 합쳐 계정당 한 번");
      // 앱 체험은 스토어 결제 수단이 등록되고 자동 전환된다 — 웹 체험의 "동의 없이 결제되지 않음"과 섞으면 안 된다.
      expect(trial).toContain("체험이 끝나기 전에 해지하지 않으면");
    });

    it("개인정보처리방침은 스토어 구독 식별자와 Apple·Google 결제 처리를 적는다", () => {
      const text = allText(LEGAL_DOCUMENTS.privacy);
      expect(text).toContain("App Store 원거래 식별자");
      expect(text).toContain("Google Play 구매 토큰");
      expect(text).toContain("Apple Inc.(App Store) 또는 Google LLC(Google Play)");
    });
  });

  describe("본문 판(LEGAL_EDITIONS)", () => {
    const revisionDates = LEGAL_REVISIONS.map((r) => r.effectiveOn);

    it("문서마다 판이 시행일 순이고, 시행일은 LEGAL_REVISIONS의 판 시행일 중 하나다", () => {
      for (const [slug, editions] of Object.entries(LEGAL_EDITIONS)) {
        const dates = editions.map((e) => e.effectiveOn);
        expect([...dates].sort(), slug).toEqual(dates);
        expect(new Set(dates).size, slug).toBe(dates.length);
        for (const date of dates) expect(revisionDates, slug).toContain(date);
        for (const { document } of editions) expect(document.slug).toBe(slug);
      }
    });

    it("첫 본문은 첫 판과 함께 시행된다", () => {
      for (const editions of Object.values(LEGAL_EDITIONS)) {
        expect(editions[0].effectiveOn).toBe(revisionDates[0]);
      }
    });

    it("LEGAL_DOCUMENTS는 문서별 최신 본문이다", () => {
      for (const [slug, editions] of Object.entries(LEGAL_EDITIONS)) {
        expect(LEGAL_DOCUMENTS[slug as keyof typeof LEGAL_DOCUMENTS]).toBe(editions.at(-1)!.document);
      }
    });

    it("지난 본문은 옛 문장 그대로다(새 본문 시행 전까지 화면에 보인다)", () => {
      const firstRefund = allText(LEGAL_EDITIONS.refund[0].document);
      expect(firstRefund).toContain("Paddle을 통해 원래 결제 수단으로");
      expect(firstRefund).not.toContain("App Store");
    });

    it("4판(2026-12-28): 방침은 체험 사용 확인값과 1년 보관, Apple 로그인 정보를 적는다", () => {
      const latest = LEGAL_EDITIONS.privacy.at(-1)!;
      expect(latest.effectiveOn).toBe("2026-12-28");
      const text = allText(latest.document);
      expect(text).toContain("체험 사용 확인값");
      expect(text).toContain("탈퇴한 날부터 1년");
      expect(text).toContain("Apple 로그인 시 Apple로부터");
    });

    it("4판: 약관 제6조는 탈퇴 후 재가입 1년 제한을 적는다", () => {
      const latest = LEGAL_EDITIONS.terms.at(-1)!;
      expect(latest.effectiveOn).toBe("2026-12-28");
      expect(allText(latest.document)).toContain("회원 탈퇴 후 1년 안에 같은 Google 또는 Apple 계정으로 다시 가입하면 같은 이용자로 보아 체험을 다시 제공하지 않습니다");
      expect(allText(latest.document)).toContain("앱 체험은 App Store·Google Play의 체험 제공 기준도 함께 따릅니다");
    });

    it("3판 본문(2026-11-27)은 옛 문장 그대로다", () => {
      const third = LEGAL_EDITIONS.privacy.find((e) => e.effectiveOn === "2026-11-27")!;
      const text = allText(third.document);
      expect(text).not.toContain("체험 사용 확인값");
      expect(text).toContain("Google 로그인 시 Google로부터");
      const thirdTerms = LEGAL_EDITIONS.terms.find((e) => e.effectiveOn === "2026-11-27")!;
      expect(allText(thirdTerms.document)).not.toContain("탈퇴한 날부터 1년");
    });

    it("모든 판 본문이 정의된 변수 토큰만 쓴다", () => {
      for (const editions of Object.values(LEGAL_EDITIONS)) {
        for (const { document } of editions) {
          const tokens = [...allText(document).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
          for (const token of tokens) expect(LEGAL_VARIABLE_KEYS).toContain(token);
        }
      }
    });
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

  it("처리 위탁 표의 Cloudflare 행은 의견을 받아 전달하는 feedback-proxy Worker를 다룬다", () => {
    const transfer = LEGAL_DOCUMENTS.privacy.sections.find((s) => s.heading.includes("처리 위탁"));
    const row = transfer?.table?.rows.find(([name]) => name.includes("Cloudflare"));
    expect(row?.[1]).toContain("의견");
  });

  it("의견 항목은 실제로 저장하는 회원 식별자와 작성 시각까지 적는다(feedbackApi)", () => {
    const purpose = LEGAL_DOCUMENTS.privacy.sections.find((s) => s.heading.includes("목적"));
    const row = purpose?.table?.rows.find(([item]) => item.includes("의견"));
    expect(row?.[0]).toContain("회원 식별자");
    expect(row?.[0]).toContain("작성 시각");
  });

  describe("회원 탈퇴(PR #145) 동작과 일치", () => {
    const privacySection = (keyword: string) =>
      LEGAL_DOCUMENTS.privacy.sections.find((s) => s.heading.includes(keyword));

    it("이용자 권리 조항은 메뉴에서 직접 탈퇴하는 방법과 의견 익명화를 안내한다", () => {
      const rights = privacySection("권리");
      const text = [...(rights?.paragraphs ?? []), ...(rights?.items ?? [])].join("\n");
      expect(text).toContain("회원 탈퇴");
      expect(text).toContain("계정 화면");
      // 의견은 지우지 않고 회원 식별자·이메일만 지운다(billing-proxy accountDataStore) — "모두 삭제"라고 단정하지 않는다.
      expect(text).not.toContain("모두 삭제");
      expect(text).toContain("의견");
    });

    it("보유 기간 표는 탈퇴 시 삭제와 의견의 익명 보관을 구분해 적는다", () => {
      const rows = privacySection("보유 기간")?.table?.rows ?? [];
      const periodOf = (item: string) => rows.find(([name]) => name.includes(item))?.[1];
      expect(periodOf("계정")).toContain("회원 탈퇴");
      expect(rows.find(([name]) => name.includes("계정"))?.[0]).not.toContain("의견");
      expect(periodOf("의견")).toContain("회원 식별자");
      expect(rows.flat().join("\n")).not.toContain("삭제를 요청할 때까지");
    });

    it("이용약관은 탈퇴 시 구독이 즉시 해지되고 남은 기간이 사라진다고 알린다", () => {
      const account = LEGAL_DOCUMENTS.terms.sections.find((s) => s.heading.includes("계정"));
      const text = [...(account?.paragraphs ?? []), ...(account?.items ?? [])].join("\n");
      expect(text).toContain("회원 탈퇴");
      expect(text).toContain("즉시 해지");
      expect(text).toContain("남은 기간");
    });

    it("이용약관·방침은 App Store 구독이 탈퇴로 해지되지 않는다고 알린다(Apple 5.1.1(v))", () => {
      const account = LEGAL_DOCUMENTS.terms.sections.find((s) => s.heading.includes("계정"));
      const termsText = [...(account?.paragraphs ?? []), ...(account?.items ?? [])].join("\n");
      expect(termsText).toContain("App Store에서 결제한 구독은");
      expect(termsText).toContain("탈퇴해도 해지되지 않고");
      const rights = privacySection("권리");
      expect((rights?.items ?? []).join("\n")).toContain("App Store에서 결제한 구독은 Apple에서 직접 해지");
    });
  });

  it("이용약관의 환불 조항은 환불 정책 페이지로 링크한다", () => {
    const refund = LEGAL_DOCUMENTS.terms.sections.find((s) => s.heading.includes("환불"));
    expect(refund?.links).toEqual([{ to: "/refund", label: "환불 정책 보기" }]);
  });
});
