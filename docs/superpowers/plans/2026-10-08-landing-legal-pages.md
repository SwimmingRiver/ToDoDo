# 랜딩 요금제 섹션 + 법적 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비로그인 랜딩에 무료/프리미엄 요금제를 보여주고, 이용약관·개인정보처리방침·환불 정책 페이지를 로그인 없이 열 수 있게 해 Paddle 도메인 심사 요건을 채운다.

**Architecture:** 새 `features/legal`이 문서 본문(데이터)·변수 치환 유틸·단일 `LegalPage`·`LegalLinks`를 가진다. `/terms`·`/privacy`·`/refund`는 `ProtectedRoute`·`RootGate` 밖의 최상위 lazy 라우트다. 랜딩은 `features/billing/config.ts`로 옮긴 `PREMIUM_BENEFITS`·가격 상수를 공유하는 `PricingSection`을 추가한다.

**Tech Stack:** React 19, react-router-dom(createBrowserRouter), styled-components, lucide-react, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-10-08-landing-legal-pages-design.md`

## Global Constraints

- 모든 명령은 `client/`에서 실행한다. 테스트는 CI 등가로 `VITE_FIREBASE_API_KEY= npx vitest run <경로>`.
- 파일명 camelCase, 스타일은 같은 이름의 `*.styles.tsx`에 둔다(기존 landing·billing 패턴).
- 색은 `@/styles/colors` 토큰만 쓴다. 글자·아이콘 강조는 `colors.brand.strong`(`brand.fill`은 글자에 쓰지 않는다 — AA 미달).
- 터치 대상(버튼·링크)은 최소 44px 높이(기존 `LoginLink` 기준), 단 푸터·드로어의 작은 텍스트 링크는 기존 푸터 링크와 같은 크기.
- 랜딩·법적 페이지 코드는 `firebase/firestore`, `@/shared/lib/firestore`, Paddle SDK(`@paddle/paddle-js`, `features/billing/lib`)를 import하지 않는다.
- 문구는 한국어 해요체(법적 문서 본문은 "~합니다"체).
- 가격 표시는 `PREMIUM_MONTHLY_PRICE_LABEL`("월 4,900원")을 쓰고 리터럴로 다시 쓰지 않는다.
- 판매자 표기·연락처·시행일·보호책임자는 `LEGAL_CONFIG`에서만 오고, 이번 작업에서는 빈 값으로 둔다.
- 커밋은 hooks를 우회하지 않는다(`--no-verify` 금지). 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 법적 문서 맨 아래 푸터에서 다른 문서 링크를 누르면 새 문서가 **맨 위부터** 보여야 한다(SPA라 스크롤이 유지되는 함정) → Task 4 테스트.
2. 로그인한 사용자가 주소창에 `/terms`를 입력해도 `/today`로 튕기지 않아야 한다 → Task 4 라우트 테스트.
3. 로그인한 모바일 화면(푸터 없음)의 드로어에서 법적 링크를 누르면 드로어가 닫히고 이동해야 한다 → Task 5 테스트.
4. `LEGAL_CONFIG`를 일부만 채우거나 공백만 넣어도 비어 있는 값은 `[… 미정]`으로 보여야 하고, 문서에 정의되지 않은 `{{토큰}}`이 남지 않아야 한다 → Task 2·3 테스트.
5. 390px·320px 폭에서 개인정보 표와 푸터 링크가 페이지 가로 스크롤을 만들지 않아야 한다 → Task 4(표를 스크롤 영역으로 감쌈 테스트) + Task 7 브라우저 실측.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `client/src/features/billing/config.ts` (수정) | `PREMIUM_BENEFITS` 추가 — 랜딩·`/premium` 공유 |
| `client/src/features/billing/pages/premiumPage.tsx` (수정) | 로컬 `BENEFITS` 제거, 공유 상수 사용 |
| `client/src/features/legal/types/legal.type.ts` | 문서 데이터 타입 |
| `client/src/features/legal/config.ts` | `LEGAL_CONFIG`(판매자 표기 등, 빈 값) |
| `client/src/features/legal/utils/fillLegalVariables.ts` | `{{토큰}}` 치환, 빈 값은 미정 표시 |
| `client/src/features/legal/content/terms.ts`·`privacy.ts`·`refund.ts` | 문서 본문 |
| `client/src/features/legal/content/index.ts` | `LEGAL_DOCUMENTS`, `LEGAL_LINKS` |
| `client/src/features/legal/pages/legalPage.tsx`(+styles) | 문서 하나를 렌더 |
| `client/src/features/legal/components/legalLinks.tsx`(+styles) | 법적 링크 3개 묶음 |
| `client/src/router.tsx` (수정) | `routes` export + 법적 라우트 3개 |
| `client/src/layouts/footer/footer.tsx` (수정) | `LegalLinks` 추가, 줄바꿈 허용 |
| `client/src/layouts/snb/mobileDrawer.tsx`(+styles) (수정) | 드로어 하단 `LegalLinks` |
| `client/src/features/landing/components/pricingSection.tsx`(+styles) | 요금제 섹션 |
| `client/src/features/landing/components/landingHeader.tsx`(+styles) (수정) | "요금제" 앵커 |
| `client/src/features/landing/components/featureGrid.tsx`(+styles) (수정) | 마감 알림 카드, 4열 그리드 |
| `client/src/features/landing/components/heroSection.tsx` (수정) | 부제 최신화 |
| `client/src/features/landing/pages/landingPage.tsx` (수정) | `PricingSection` 배치 |

---

### Task 1: 프리미엄 혜택 목록을 공유 상수로 이동

**Files:**
- Modify: `client/src/features/billing/config.ts`
- Modify: `client/src/features/billing/pages/premiumPage.tsx:1,26-30,119`
- Test: `client/src/features/billing/__tests__/config.test.ts` (Create)

**Interfaces:**
- Produces: `PREMIUM_BENEFITS: readonly { icon: LucideIcon; title: string; description: string }[]` from `@/features/billing/config` (Task 6이 사용)

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/billing/__tests__/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PREMIUM_BENEFITS } from "../config";

describe("PREMIUM_BENEFITS", () => {
  it("프리미엄 혜택 3가지를 순서대로 가진다", () => {
    expect(PREMIUM_BENEFITS.map((b) => b.title)).toEqual([
      "AI 할 일 플랜",
      "구글 캘린더 연동",
      "완료 통계",
    ]);
    for (const benefit of PREMIUM_BENEFITS) {
      expect(benefit.description.length).toBeGreaterThan(0);
      expect(benefit.icon).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/billing/__tests__/config.test.ts`
Expected: FAIL — `PREMIUM_BENEFITS`가 export되지 않음(undefined의 map)

- [ ] **Step 3: 구현**

`client/src/features/billing/config.ts` 맨 위에 import를 추가하고 파일 끝에 상수를 추가:

```ts
import { BarChart3, CalendarDays, Sparkles, type LucideIcon } from "lucide-react";
```

```ts
/** 프리미엄 혜택. 랜딩 요금제 섹션과 /premium이 같은 목록을 보여준다. */
export const PREMIUM_BENEFITS: readonly { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Sparkles, title: "AI 할 일 플랜", description: "목표를 적으면 실행 단계와 날짜를 나눠 제안해요" },
  { icon: CalendarDays, title: "구글 캘린더 연동", description: "할 일을 구글 캘린더에 동기화해요" },
  { icon: BarChart3, title: "완료 통계", description: "완료율·연속 달성일·우선순위 분포를 확인해요" },
];
```

`client/src/features/billing/pages/premiumPage.tsx`:
- 1행 `import { BarChart3, CalendarDays, Sparkles, type LucideIcon } from "lucide-react";` 삭제
- 4행을 `import { PREMIUM_BENEFITS, PREMIUM_MONTHLY_PRICE_LABEL } from "../config";`로 변경
- 26~30행 `const BENEFITS ...` 블록 삭제
- 119행 `{BENEFITS.map(` → `{PREMIUM_BENEFITS.map(`

- [ ] **Step 4: 통과 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/billing`
Expected: PASS (새 테스트 + 기존 `premiumPage.test.tsx` 전부)

- [ ] **Step 5: 커밋**

```bash
git add src/features/billing/config.ts src/features/billing/pages/premiumPage.tsx src/features/billing/__tests__/config.test.ts
git commit -m "refactor(billing): 프리미엄 혜택 목록을 공유 상수로 이동

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 법적 문서 타입·설정·변수 치환

**Files:**
- Create: `client/src/features/legal/types/legal.type.ts`
- Create: `client/src/features/legal/config.ts`
- Create: `client/src/features/legal/utils/fillLegalVariables.ts`
- Test: `client/src/features/legal/utils/__tests__/fillLegalVariables.test.ts`

**Interfaces:**
- Produces:
  - `type LegalSlug = "terms" | "privacy" | "refund"`
  - `interface LegalTable { headers: string[]; rows: string[][] }`
  - `interface LegalSection { heading: string; paragraphs?: string[]; items?: string[]; table?: LegalTable }`
  - `interface LegalDocument { slug: LegalSlug; title: string; sections: LegalSection[] }`
  - `interface LegalConfig { sellerName: string; contactEmail: string; effectiveDate: string; privacyOfficer: string }`
  - `LEGAL_CONFIG: LegalConfig` from `@/features/legal/config`
  - `LEGAL_VARIABLE_KEYS: readonly (keyof LegalConfig)[]`
  - `fillLegalVariables(text: string, config: LegalConfig): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/legal/utils/__tests__/fillLegalVariables.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fillLegalVariables } from "../fillLegalVariables";
import type { LegalConfig } from "../../config";

const EMPTY: LegalConfig = { sellerName: "", contactEmail: "", effectiveDate: "", privacyOfficer: "" };

describe("fillLegalVariables", () => {
  it("값이 있으면 토큰을 그 값으로 바꾼다", () => {
    const config = { ...EMPTY, sellerName: "홍길동", contactEmail: "a@b.com" };
    expect(fillLegalVariables("운영자 {{sellerName}}, 문의 {{contactEmail}}", config)).toBe(
      "운영자 홍길동, 문의 a@b.com",
    );
  });

  it("빈 값은 항목별 미정 표시로 바꾼다", () => {
    expect(
      fillLegalVariables("{{sellerName}}/{{contactEmail}}/{{effectiveDate}}/{{privacyOfficer}}", EMPTY),
    ).toBe("[판매자명 미정]/[연락처 미정]/[시행일 미정]/[보호책임자 미정]");
  });

  it("공백만 있는 값도 미정으로 취급한다", () => {
    expect(fillLegalVariables("{{sellerName}}", { ...EMPTY, sellerName: "   " })).toBe("[판매자명 미정]");
  });

  it("일부만 채워도 나머지는 미정으로 남는다", () => {
    const config = { ...EMPTY, sellerName: "홍길동" };
    expect(fillLegalVariables("{{sellerName}} {{privacyOfficer}}", config)).toBe("홍길동 [보호책임자 미정]");
  });

  it("정의되지 않은 토큰은 그대로 둔다(콘텐츠 테스트가 잡도록)", () => {
    expect(fillLegalVariables("{{unknown}}", EMPTY)).toBe("{{unknown}}");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/legal/utils`
Expected: FAIL — `../fillLegalVariables` 모듈 없음

- [ ] **Step 3: 구현**

`client/src/features/legal/types/legal.type.ts`:

```ts
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
}

interface LegalDocument {
  slug: LegalSlug;
  title: string;
  sections: LegalSection[];
}

export type { LegalSlug, LegalTable, LegalSection, LegalDocument };
```

`client/src/features/legal/config.ts`:

```ts
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
```

`client/src/features/legal/utils/fillLegalVariables.ts`:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/legal/utils`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/features/legal
git commit -m "feat(legal): 법적 문서 타입과 판매자 표기 변수 치환

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 문서 본문 3개

**Files:**
- Create: `client/src/features/legal/content/terms.ts`
- Create: `client/src/features/legal/content/refund.ts`
- Create: `client/src/features/legal/content/privacy.ts`
- Create: `client/src/features/legal/content/index.ts`
- Test: `client/src/features/legal/content/__tests__/content.test.ts`

**Interfaces:**
- Consumes: `LegalDocument`, `LegalSlug` (Task 2), `LEGAL_VARIABLE_KEYS` (Task 2), `PREMIUM_MONTHLY_PRICE_LABEL` from `@/features/billing/config`
- Produces:
  - `LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument>` from `@/features/legal/content`
  - `LEGAL_LINKS: readonly { to: string; label: string }[]` — `[{ to: "/terms", label: "이용약관" }, { to: "/privacy", label: "개인정보처리방침" }, { to: "/refund", label: "환불 정책" }]`

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/legal/content/__tests__/content.test.ts`:

```ts
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
});
```

- [ ] **Step 2: 실패 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/legal/content`
Expected: FAIL — `..` 모듈 없음

- [ ] **Step 3: 이용약관 본문**

`client/src/features/legal/content/terms.ts`:

```ts
import { PREMIUM_MONTHLY_PRICE_LABEL } from "@/features/billing/config";
import type { LegalDocument } from "../types/legal.type";

export const TERMS: LegalDocument = {
  slug: "terms",
  title: "이용약관",
  sections: [
    {
      heading: "제1조 (목적과 운영자)",
      paragraphs: [
        '이 약관은 {{sellerName}}(이하 "운영자")가 제공하는 할 일 관리 서비스 ToDoDo(이하 "서비스")의 이용 조건과 절차, 운영자와 이용자의 권리·의무를 정합니다.',
        "서비스에 관한 문의는 {{contactEmail}}로 받습니다.",
      ],
    },
    {
      heading: "제2조 (가입과 계정)",
      items: [
        "이용자는 Google 계정으로 로그인해 서비스에 가입합니다.",
        "만 14세 미만은 서비스에 가입할 수 없습니다.",
        "이용자는 자신의 계정을 직접 관리하며, 계정을 다른 사람과 공유하지 않습니다.",
      ],
    },
    {
      heading: "제3조 (서비스 내용)",
      paragraphs: ["서비스는 무료 서비스와 유료 구독(이하 \"프리미엄\")으로 나뉩니다."],
      items: [
        "무료: 할 일 작성·관리, Today·목록·칸반·캘린더 보기, 반복 할 일, 마감 알림",
        "프리미엄: AI 할 일 플랜, 구글 캘린더 연동, 완료 통계",
      ],
    },
    {
      heading: "제4조 (결제와 판매 주체)",
      paragraphs: [
        "프리미엄의 주문·결제·청구·세금 처리는 Paddle.com Market Limited(이하 \"Paddle\")가 판매 주체(Merchant of Record)로서 수행합니다.",
        "결제할 때 Paddle의 구매자 약관이 함께 적용되며, 카드 명세서에는 Paddle이 표시될 수 있습니다.",
      ],
    },
    {
      heading: "제5조 (구독과 갱신)",
      items: [
        `프리미엄 요금은 ${PREMIUM_MONTHLY_PRICE_LABEL}(부가세 포함)이며, 해지하기 전까지 매월 자동으로 갱신·결제됩니다.`,
        "이용자는 서비스의 프리미엄 화면에서 언제든 구독을 해지할 수 있습니다.",
        "해지해도 이미 결제한 기간이 끝날 때까지 프리미엄을 이용할 수 있습니다.",
        "운영자가 요금을 바꿀 때는 적용 30일 전까지 서비스 화면 또는 이메일로 알립니다.",
      ],
    },
    {
      heading: "제6조 (7일 무료 체험)",
      items: [
        "이용자는 카드 등록 없이 프리미엄을 7일 동안 무료로 체험할 수 있으며, 체험은 계정당 한 번입니다.",
        "체험이 끝나면 자동으로 무료 서비스로 돌아가며, 이용자의 동의 없이 결제되지 않습니다.",
      ],
    },
    {
      heading: "제7조 (환불)",
      paragraphs: ["환불은 서비스의 환불 정책(/refund)에 따릅니다."],
    },
    {
      heading: "제8조 (이용자의 의무)",
      paragraphs: ["이용자는 다음 행위를 해서는 안 됩니다."],
      items: [
        "다른 사람의 계정이나 개인정보를 무단으로 사용하는 행위",
        "서비스의 정상적인 운영을 방해하거나 보안 장치를 우회하는 행위",
        "자동화된 수단으로 서비스에 과도한 요청을 보내는 행위",
        "법령이나 공공질서에 어긋나는 내용을 저장·전송하는 행위",
      ],
    },
    {
      heading: "제9조 (서비스의 변경과 중단)",
      items: [
        "운영자는 서비스의 일부를 변경하거나 중단할 수 있으며, 이용자에게 불리한 변경은 미리 알립니다.",
        "운영자가 프리미엄 제공을 중단하면, 남은 결제 기간에 해당하는 금액을 환불합니다.",
        "설비 점검, 장애, 천재지변 등으로 서비스가 일시 중단될 수 있습니다.",
      ],
    },
    {
      heading: "제10조 (책임의 제한)",
      items: [
        "운영자는 고의 또는 중대한 과실이 없는 한, 이용자가 서비스에 저장한 정보의 손실이나 서비스 이용으로 생긴 간접 손해에 책임을 지지 않습니다.",
        "Google 캘린더 등 외부 서비스의 장애나 정책 변경으로 생긴 문제에 대해서는 운영자가 책임을 지지 않습니다.",
      ],
    },
    {
      heading: "제11조 (약관의 변경)",
      paragraphs: [
        "운영자가 약관을 바꿀 때는 시행 7일 전(이용자에게 불리한 변경은 30일 전)부터 서비스 화면에 알립니다. 변경 후에도 서비스를 계속 이용하면 변경된 약관에 동의한 것으로 봅니다.",
      ],
    },
    {
      heading: "제12조 (준거법과 관할)",
      paragraphs: [
        "이 약관은 대한민국 법에 따르며, 서비스와 관련한 분쟁은 민사소송법에 따른 관할 법원에서 해결합니다.",
      ],
    },
  ],
};
```

- [ ] **Step 4: 환불 정책 본문**

`client/src/features/legal/content/refund.ts`:

```ts
import type { LegalDocument } from "../types/legal.type";

export const REFUND: LegalDocument = {
  slug: "refund",
  title: "환불 정책",
  sections: [
    {
      heading: "환불 기간",
      items: [
        "첫 결제와 매월 갱신 결제 모두, 결제일로부터 14일 이내에 요청하면 전액 환불합니다.",
        "결제일로부터 14일이 지나면 해당 결제는 환불되지 않습니다. 이때 구독을 해지하면 이미 결제한 기간이 끝날 때까지 프리미엄을 이용할 수 있습니다.",
        "7일 무료 체험은 결제가 없으므로 환불 대상이 아닙니다.",
      ],
    },
    {
      heading: "요청 방법",
      items: [
        "{{contactEmail}}로 가입한 이메일 주소와 결제일을 알려 주세요.",
        "또는 Paddle이 보낸 결제 영수증 이메일의 안내 링크로 요청할 수 있습니다.",
      ],
    },
    {
      heading: "처리",
      items: [
        "환불은 결제를 처리한 Paddle을 통해 원래 결제 수단으로 돌려드립니다. 실제 입금까지 걸리는 기간은 결제 수단에 따라 다릅니다.",
        "환불하면 해당 구독이 해지되고 프리미엄 이용이 바로 끝납니다.",
      ],
    },
  ],
};
```

- [ ] **Step 5: 개인정보처리방침 본문**

`client/src/features/legal/content/privacy.ts`:

```ts
import type { LegalDocument } from "../types/legal.type";

export const PRIVACY: LegalDocument = {
  slug: "privacy",
  title: "개인정보처리방침",
  sections: [
    {
      heading: "1. 총칙",
      paragraphs: [
        "{{sellerName}}(이하 \"운영자\")는 ToDoDo(이하 \"서비스\")를 제공하면서 「개인정보 보호법」 등 관련 법령을 지키며, 이용자의 개인정보를 다음과 같이 처리합니다.",
      ],
    },
    {
      heading: "2. 처리하는 개인정보와 목적",
      table: {
        headers: ["항목", "목적"],
        rows: [
          ["이메일, 이름, 프로필 사진(Google 로그인)", "회원 식별, 화면 표시"],
          ["할 일(제목, 설명, 일정, 반복·알림 설정), 알림 기본값", "할 일 관리 서비스 제공"],
          ["의견 보내기 내용, 이메일", "문의 응대, 서비스 개선"],
          ["구독 상태, Paddle 고객·구독 식별자, 체험 사용 시각, 결제 기간", "프리미엄 권한 관리"],
          ["구글 캘린더 연동 여부·연결 시각, 구글 캘린더 접근 토큰", "구글 캘린더 연동(프리미엄)"],
          ["알림 받을 기기 토큰, 알림 일정, 알림 발송 기록(할 일 제목 포함)", "마감 알림 발송"],
          ["AI 플랜 요청 내용(목표 문장, 날짜, 마감일), 하루 사용 횟수", "AI 할 일 플랜 제공(프리미엄)"],
          ["오류 정보(회원 식별자, 브라우저·OS, 페이지 주소, 오류 내용)", "오류 확인과 수정"],
          ["접속 기록(IP 주소 등)", "서비스 운영과 보안"],
        ],
      },
    },
    {
      heading: "3. 수집 방법",
      items: [
        "Google 로그인 시 Google로부터 이메일, 이름, 프로필 사진을 받습니다.",
        "이용자가 서비스를 이용하며 직접 입력합니다.",
        "서비스 이용 과정에서 오류 정보와 접속 기록이 자동으로 생성됩니다.",
      ],
    },
    {
      heading: "4. 보유 기간과 파기",
      table: {
        headers: ["항목", "보유 기간"],
        rows: [
          ["계정, 할 일, 설정, 의견, 구독 정보", "삭제를 요청할 때까지"],
          ["구글 캘린더 접근 토큰", "연동 해제 또는 삭제 요청 시까지"],
          ["알림 발송 기록", "발송 후 7일"],
          ["AI 하루 사용 횟수", "2일"],
          ["오류 정보", "Sentry 보관 기간(최대 90일)"],
        ],
      },
      paragraphs: [
        "보유 기간이 지나거나 삭제를 요청하면 복구할 수 없는 방법으로 지체 없이 삭제합니다. 다만 결제 관련 기록은 판매 주체인 Paddle이 관련 법령에 따라 보관합니다.",
      ],
    },
    {
      heading: "5. 처리 위탁과 국외 이전",
      paragraphs: [
        "운영자는 서비스 제공을 위해 다음 업체에 개인정보 처리를 맡기며, 이 업체들은 국외에 있습니다. 개인정보는 서비스를 이용할 때 네트워크를 통해 전송됩니다.",
      ],
      table: {
        headers: ["받는 자(국가)", "이전 항목", "목적", "보유 기간"],
        rows: [
          ["Google LLC (미국)", "계정 정보, 할 일, 설정, 의견, 구독 정보, 알림 내용, 캘린더에 동기화하는 할 일", "데이터 저장(Firebase), 푸시 알림 발송(FCM), 구글 캘린더 동기화", "삭제 요청 시까지"],
          ["Cloudflare, Inc. (미국)", "구글 캘린더 접근 토큰, 알림 기기 토큰·일정·발송 기록, AI 사용 횟수", "서버 기능 실행", "4번 항목의 보유 기간"],
          ["Anthropic, PBC (미국)", "AI 플랜 요청 내용", "AI 할 일 플랜 생성", "Anthropic 정책에 따른 기간"],
          ["Functional Software, Inc. (Sentry, 미국)", "오류 정보", "오류 확인과 수정", "최대 90일"],
        ],
      },
    },
    {
      heading: "6. 결제 정보",
      paragraphs: [
        "프리미엄 결제는 판매 주체인 Paddle.com Market Limited(Paddle)가 직접 처리합니다. 카드 번호 등 결제 정보는 Paddle이 수집하며 운영자는 받지 않습니다.",
        "운영자는 Paddle로부터 고객·구독 식별자와 구독 상태만 받습니다. Paddle의 개인정보 처리에는 Paddle의 개인정보처리방침이 적용됩니다.",
      ],
    },
    {
      heading: "7. 이용자의 권리",
      items: [
        "이용자는 언제든 자신의 개인정보를 열람·정정·삭제하거나 처리 정지를 요구할 수 있습니다.",
        "{{contactEmail}}로 요청하면 지체 없이(10일 이내) 처리합니다. 계정 삭제를 요청하면 계정과 저장된 데이터를 모두 삭제합니다.",
      ],
    },
    {
      heading: "8. 브라우저 저장소",
      paragraphs: [
        "서비스는 광고·추적 목적의 쿠키를 쓰지 않습니다. 다음 정보만 이용자의 브라우저에 저장하며, 브라우저 설정에서 지울 수 있습니다.",
      ],
      items: [
        "로그인 상태 유지(Firebase 인증 정보)",
        "화면 테마 설정",
        "구글 캘린더 동기화 상태(할 일 식별자와 수정 시각)",
        "알림 권유를 미룬 시각, 알림 해제 재시도 표시",
      ],
    },
    {
      heading: "9. 만 14세 미만 아동",
      paragraphs: ["서비스는 만 14세 미만 아동의 가입을 받지 않습니다."],
    },
    {
      heading: "10. 안전성 확보 조치",
      items: [
        "모든 통신을 HTTPS로 암호화합니다.",
        "데이터베이스 접근 규칙으로 본인 데이터만 읽고 쓸 수 있게 제한합니다.",
        "오류 정보에는 할 일 내용과 이메일을 담지 않도록 허용된 항목만 보냅니다.",
      ],
    },
    {
      heading: "11. 개인정보 보호책임자",
      items: ["보호책임자: {{privacyOfficer}}", "연락처: {{contactEmail}}"],
      paragraphs: [
        "개인정보 침해에 대한 상담이 필요하면 개인정보분쟁조정위원회(1833-6972), 개인정보침해신고센터(118), 대검찰청(1301), 경찰청(182)에 문의할 수 있습니다.",
      ],
    },
    {
      heading: "12. 방침의 변경",
      paragraphs: ["이 방침을 바꿀 때는 시행 7일 전부터 서비스 화면에 알립니다."],
    },
  ],
};
```

- [ ] **Step 6: 인덱스**

`client/src/features/legal/content/index.ts`:

```ts
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
```

- [ ] **Step 7: 통과 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/legal`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add src/features/legal/content
git commit -m "feat(legal): 이용약관·개인정보처리방침·환불 정책 본문 초안

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: LegalPage와 공개 라우트

**Files:**
- Create: `client/src/features/legal/pages/legalPage.tsx`
- Create: `client/src/features/legal/pages/legalPage.styles.tsx`
- Modify: `client/src/router.tsx` (lazy import 추가, `routes` 배열 export, 라우트 3개)
- Test: `client/src/features/legal/pages/__tests__/legalPage.test.tsx`
- Test: `client/src/__tests__/legalRoutes.test.tsx`

**Interfaces:**
- Consumes: `LEGAL_DOCUMENTS` (Task 3), `LEGAL_CONFIG`·`fillLegalVariables` (Task 2), `Footer` from `@/layouts/footer/footer`
- Produces: `default LegalPage({ slug }: { slug: LegalSlug })`; `export const routes: RouteObject[]` from `@/router` (`router`는 `createBrowserRouter(routes)`로 그대로 export)

- [ ] **Step 1: 실패하는 페이지 테스트 작성**

`client/src/features/legal/pages/__tests__/legalPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const config = vi.hoisted(() => ({
  sellerName: "",
  contactEmail: "",
  effectiveDate: "",
  privacyOfficer: "",
}));
vi.mock("../../config", () => ({ LEGAL_CONFIG: config }));

import LegalPage from "../legalPage";

const renderPage = (slug: "terms" | "privacy" | "refund") =>
  render(
    <MemoryRouter>
      <LegalPage slug={slug} />
    </MemoryRouter>,
  );

describe("LegalPage", () => {
  beforeEach(() => {
    Object.assign(config, { sellerName: "", contactEmail: "", effectiveDate: "", privacyOfficer: "" });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  it.each([
    ["terms", "이용약관"],
    ["privacy", "개인정보처리방침"],
    ["refund", "환불 정책"],
  ] as const)("%s 문서의 제목을 h1로 보여준다", (slug, title) => {
    renderPage(slug);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("판매자 표기가 비어 있으면 미정 표시가 보인다", () => {
    renderPage("terms");
    expect(screen.getAllByText(/\[판매자명 미정\]/).length).toBeGreaterThan(0);
    expect(screen.getByText(/시행일: \[시행일 미정\]/)).toBeInTheDocument();
  });

  it("판매자 표기를 채우면 그 이름이 본문에 들어간다", () => {
    config.sellerName = "홍길동";
    renderPage("terms");
    expect(screen.getAllByText(/홍길동/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\[판매자명 미정\]/)).not.toBeInTheDocument();
  });

  it("다른 문서로 바뀌면 맨 위로 스크롤한다", () => {
    const { rerender } = renderPage("terms");
    vi.mocked(window.scrollTo).mockClear();
    rerender(
      <MemoryRouter>
        <LegalPage slug="refund" />
      </MemoryRouter>,
    );
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("표는 좁은 화면에서 가로로 스크롤되는 영역 안에 있다", () => {
    renderPage("privacy");
    const tables = screen.getAllByRole("table");
    for (const table of tables) {
      expect(table.parentElement).toHaveAttribute("role", "region");
      expect(table.parentElement).toHaveAttribute("tabindex", "0");
    }
  });

  it("로고는 홈(/)으로 가는 링크다", () => {
    renderPage("refund");
    expect(screen.getByRole("link", { name: "ToDoDo 홈" })).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/legal/pages`
Expected: FAIL — `../legalPage` 모듈 없음

- [ ] **Step 3: 스타일 작성**

`client/src/features/legal/pages/legalPage.styles.tsx`:

```tsx
import { Link } from "react-router-dom";
import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: ${colors.background.primary};
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid ${colors.border.tertiary};

  ${media.mobile} {
    padding: 12px 20px;
  }
`;

const HomeLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-size: 18px;
  font-weight: 700;
  color: ${colors.text.primary};
  text-decoration: none;
`;

const LogoMark = styled.img`
  width: 28px;
  height: 28px;
  border-radius: ${radius.md};
`;

const Article = styled.article`
  flex: 1;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 24px 64px;
  color: ${colors.text.primary};
  line-height: 1.7;

  ${media.mobile} {
    padding: 32px 16px 48px;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 28px;
  }

  h2 {
    margin: 32px 0 8px;
    font-size: 18px;
  }

  p,
  ul {
    margin: 8px 0;
    font-size: 15px;
  }

  ul {
    padding-left: 20px;
  }
`;

const EffectiveDate = styled.p`
  color: ${colors.text.secondary};
`;

const TableWrapper = styled.div`
  overflow-x: auto;
  margin: 12px 0;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};

  table {
    width: 100%;
    min-width: 520px;
    border-collapse: collapse;
    font-size: 14px;
  }

  th,
  td {
    padding: 10px 12px;
    border-bottom: 1px solid ${colors.border.tertiary};
    text-align: left;
    vertical-align: top;
  }

  th {
    color: ${colors.text.secondary};
    font-weight: 600;
  }

  tr:last-child td {
    border-bottom: none;
  }
`;

export { PageContainer, Header, HomeLink, LogoMark, Article, EffectiveDate, TableWrapper };
```

- [ ] **Step 4: 페이지 구현**

`client/src/features/legal/pages/legalPage.tsx`:

```tsx
import { useEffect } from "react";
import logo from "@/assets/logo.png";
import Footer from "@/layouts/footer/footer";
import { LEGAL_CONFIG } from "../config";
import { LEGAL_DOCUMENTS } from "../content";
import type { LegalSlug } from "../types/legal.type";
import { fillLegalVariables } from "../utils/fillLegalVariables";
import {
  Article,
  EffectiveDate,
  Header,
  HomeLink,
  LogoMark,
  PageContainer,
  TableWrapper,
} from "./legalPage.styles";

interface LegalPageProps {
  slug: LegalSlug;
}

const fill = (text: string) => fillLegalVariables(text, LEGAL_CONFIG);

/**
 * 로그인 없이 열리는 법적 문서 페이지. 앱 셸(App) 밖에서 렌더되므로 자체 헤더·푸터를 가진다.
 * 푸터에서 다른 문서로 이동하면 SPA라 스크롤이 유지되므로, 문서가 바뀔 때 맨 위로 올린다.
 */
const LegalPage = ({ slug }: LegalPageProps) => {
  const legalDocument = LEGAL_DOCUMENTS[slug];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  return (
    <PageContainer>
      <Header>
        <HomeLink to="/" aria-label="ToDoDo 홈">
          <LogoMark src={logo} alt="" />
          ToDoDo
        </HomeLink>
      </Header>
      <Article>
        <h1>{legalDocument.title}</h1>
        <EffectiveDate>시행일: {fill("{{effectiveDate}}")}</EffectiveDate>
        {legalDocument.sections.map((section) => (
          <section key={section.heading}>
            <h2>{fill(section.heading)}</h2>
            {section.paragraphs?.map((text, i) => <p key={i}>{fill(text)}</p>)}
            {section.items && (
              <ul>
                {section.items.map((text, i) => (
                  <li key={i}>{fill(text)}</li>
                ))}
              </ul>
            )}
            {section.table && (
              <TableWrapper role="region" aria-label={`${section.heading} 표`} tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      {section.table.headers.map((header) => (
                        <th key={header} scope="col">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c}>{fill(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </section>
        ))}
      </Article>
      <Footer />
    </PageContainer>
  );
};

export default LegalPage;
```

- [ ] **Step 5: 페이지 테스트 통과 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/legal/pages`
Expected: PASS

- [ ] **Step 6: 실패하는 라우트 테스트 작성**

`client/src/__tests__/legalRoutes.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { User } from "firebase/auth";
import { AuthContext } from "@/features/auth/context/authContext";

vi.mock("@/shared/lib/firebase", () => ({ auth: {}, googleProvider: {} }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));

import { routes } from "@/router";

const signedIn = { uid: "u1", email: "a@b.com", displayName: "사용자" } as User;

const renderAt = (path: string, user: User | null) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthContext.Provider value={{ user, loading: false, logout: vi.fn() }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return router;
};

describe("법적 페이지 라우트", () => {
  it.each([
    ["/terms", "이용약관"],
    ["/privacy", "개인정보처리방침"],
    ["/refund", "환불 정책"],
  ])("로그아웃 상태에서 %s가 열린다", async (path, title) => {
    const router = renderAt(path, null);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });

  it("로그인 상태에서도 /terms에 머문다(/today로 보내지 않는다)", async () => {
    const router = renderAt("/terms", signedIn);
    expect(await screen.findByRole("heading", { level: 1, name: "이용약관" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/terms");
  });
});
```

- [ ] **Step 7: 실패 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/__tests__/legalRoutes.test.tsx`
Expected: FAIL — `routes`가 export되지 않음

- [ ] **Step 8: 라우터 수정**

`client/src/router.tsx`:
- 2행을 `import { createBrowserRouter, type RouteObject } from "react-router-dom";`로 변경
- `const PremiumPage = lazy(...)` 아래에 추가:

```tsx
// 법적 페이지는 로그인 여부와 무관하게 열려야 한다(Paddle 심사자는 로그인하지 않는다).
// 그래서 RootGate·ProtectedRoute 밖의 최상위 라우트로 둔다.
const LegalPage = lazy(() => import("@/features/legal/pages/legalPage"));
```

- `export const router = createBrowserRouter([` 를 `export const routes: RouteObject[] = [`로 바꾸고, `/guest` 라우트 객체 바로 뒤에 추가:

```tsx
  { path: "/terms", element: withSuspense(<LegalPage slug="terms" />) },
  { path: "/privacy", element: withSuspense(<LegalPage slug="privacy" />) },
  { path: "/refund", element: withSuspense(<LegalPage slug="refund" />) },
```

- 파일 끝의 `]);`를 `];`로 바꾸고 그 아래에 추가:

```tsx
export const router = createBrowserRouter(routes);
```

- [ ] **Step 9: 통과 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/__tests__/legalRoutes.test.tsx src/features/legal src/features/auth`
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add src/features/legal/pages src/router.tsx src/__tests__/legalRoutes.test.tsx
git commit -m "feat(legal): 로그인 없이 열리는 법적 문서 페이지와 라우트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 푸터·모바일 드로어에 법적 링크

**Files:**
- Create: `client/src/features/legal/components/legalLinks.tsx`
- Create: `client/src/features/legal/components/legalLinks.styles.tsx`
- Modify: `client/src/layouts/footer/footer.tsx`
- Modify: `client/src/layouts/snb/mobileDrawer.tsx:90-93`
- Modify: `client/src/layouts/snb/mobileDrawer.styles.tsx` (끝에 추가)
- Test: `client/src/layouts/footer/__tests__/footer.test.tsx` (Create)
- Test: `client/src/layouts/snb/__tests__/mobileDrawer.test.tsx` (케이스 추가)

**Interfaces:**
- Consumes: `LEGAL_LINKS` (Task 3)
- Produces: `default LegalLinks({ onNavigate }: { onNavigate?: () => void })` — `<nav aria-label="약관 및 정책">` 안에 링크 3개

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/layouts/footer/__tests__/footer.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "../footer";

describe("Footer", () => {
  it("이용약관·개인정보처리방침·환불 정책 링크가 있다", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "약관 및 정책" });
    expect(within(nav).getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms");
    expect(within(nav).getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
    expect(within(nav).getByRole("link", { name: "환불 정책" })).toHaveAttribute("href", "/refund");
  });
});
```

`client/src/layouts/snb/__tests__/mobileDrawer.test.tsx` 파일 끝에 추가:

```tsx
describe("MobileDrawer 법적 링크", () => {
  it("이용약관을 누르면 드로어를 닫는다", async () => {
    const user = setupUser();
    const onClose = vi.fn();
    renderDrawer({ onClose });

    const link = screen.getByRole("link", { name: "이용약관" });
    expect(link).toHaveAttribute("href", "/terms");
    await user.click(link);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/layouts/footer src/layouts/snb`
Expected: FAIL — navigation "약관 및 정책"/link "이용약관" 없음

- [ ] **Step 3: LegalLinks 구현**

`client/src/features/legal/components/legalLinks.styles.tsx`:

```tsx
import { Link } from "react-router-dom";
import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const LinksNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
`;

const LegalLink = styled(Link)`
  color: inherit;
  text-decoration: none;

  &:hover {
    color: ${colors.text.primary};
    text-decoration: underline;
  }
`;

export { LinksNav, LegalLink };
```

`client/src/features/legal/components/legalLinks.tsx`:

```tsx
import { LEGAL_LINKS } from "../content";
import { LegalLink, LinksNav } from "./legalLinks.styles";

interface LegalLinksProps {
  /** 드로어처럼 링크를 누르면 닫혀야 하는 컨테이너가 넘긴다. */
  onNavigate?: () => void;
}

const LegalLinks = ({ onNavigate }: LegalLinksProps) => (
  <LinksNav aria-label="약관 및 정책">
    {LEGAL_LINKS.map(({ to, label }) => (
      <LegalLink key={to} to={to} onClick={onNavigate}>
        {label}
      </LegalLink>
    ))}
  </LinksNav>
);

export default LegalLinks;
```

- [ ] **Step 4: 푸터에 연결**

`client/src/layouts/footer/footer.tsx`:
- import 추가: `import LegalLinks from "@/features/legal/components/legalLinks";`
- `FooterContainer`의 `gap: 8px;` 아래에 `flex-wrap: wrap;` 추가(320px에서 줄바꿈)
- `<FooterLink href="mailto:swimmingr@gmail.com">Contact</FooterLink>` 다음 줄에 추가:

```tsx
      <Divider>|</Divider>
      <LegalLinks />
```

- [ ] **Step 5: 모바일 드로어에 연결**

`client/src/layouts/snb/mobileDrawer.styles.tsx` 끝에 추가:

```tsx
// 로그인한 모바일 화면은 Footer 대신 BottomTabBar를 보여주므로(App.tsx), 법적 링크를
// 찾을 수 있는 곳이 드로어 하단뿐이다.
export const DrawerLegalLinks = styled.div`
  padding: 12px 22px 20px;
  font-size: 13px;
  color: ${colors.text.secondary};
`;
```

`client/src/layouts/snb/mobileDrawer.tsx`:
- import 추가: `import LegalLinks from "@/features/legal/components/legalLinks";`
- 스타일 import 목록에 `DrawerLegalLinks` 추가
- `</FeedbackNavRow>` 바로 아래에 추가:

```tsx
        <DrawerLegalLinks>
          <LegalLinks onNavigate={handleClose} />
        </DrawerLegalLinks>
```

- [ ] **Step 6: 통과 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/layouts src/features/legal`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/features/legal/components src/layouts/footer src/layouts/snb
git commit -m "feat(legal): 푸터와 모바일 드로어에 약관·정책 링크

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 랜딩 요금제 섹션과 문구 최신화

**Files:**
- Create: `client/src/features/landing/components/pricingSection.tsx`
- Create: `client/src/features/landing/components/pricingSection.styles.tsx`
- Modify: `client/src/features/landing/components/landingHeader.tsx`, `landingHeader.styles.tsx`
- Modify: `client/src/features/landing/components/featureGrid.tsx`
- Modify: `client/src/features/landing/components/heroSection.tsx`
- Modify: `client/src/features/landing/pages/landingPage.tsx`
- Test: `client/src/features/landing/components/__tests__/pricingSection.test.tsx`
- Test: `client/src/features/landing/pages/__tests__/landingPage.test.tsx`

**Interfaces:**
- Consumes: `PREMIUM_BENEFITS` (Task 1), `PREMIUM_MONTHLY_PRICE_LABEL` from `@/features/billing/config`
- Produces: `default PricingSection()` — `<section id="pricing">`

- [ ] **Step 1: 실패하는 요금제 테스트 작성**

`client/src/features/landing/components/__tests__/pricingSection.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setupUser } from "@/test/setupUser";
import { PREMIUM_BENEFITS, PREMIUM_MONTHLY_PRICE_LABEL } from "@/features/billing/config";
import PricingSection from "../pricingSection";

const renderSection = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<PricingSection />} />
        <Route path="/login" element={<div>로그인 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("PricingSection", () => {
  it("#pricing 앵커를 가진다", () => {
    const { container } = renderSection();
    expect(container.querySelector("section#pricing")).not.toBeNull();
  });

  it("프리미엄 카드는 공유 가격·혜택과 체험 조건을 보여준다", () => {
    renderSection();
    const premium = screen.getByRole("article", { name: "프리미엄" });
    expect(within(premium).getByText(PREMIUM_MONTHLY_PRICE_LABEL)).toBeInTheDocument();
    expect(within(premium).getByText("부가세 포함")).toBeInTheDocument();
    for (const { title } of PREMIUM_BENEFITS) {
      expect(within(premium).getByText(title)).toBeInTheDocument();
    }
    expect(within(premium).getByText("카드 등록 없이 · 계정당 1회")).toBeInTheDocument();
  });

  it("무료 카드는 0원과 무료 기능을 보여준다", () => {
    renderSection();
    const free = screen.getByRole("article", { name: "무료" });
    expect(within(free).getByText("0원")).toBeInTheDocument();
    expect(within(free).getByText("마감 알림")).toBeInTheDocument();
  });

  it.each(["무료로 시작하기", "7일 무료 체험 시작하기"])("%s 버튼은 /login으로 간다", async (name) => {
    const user = setupUser();
    renderSection();
    await user.click(screen.getByRole("button", { name }));
    expect(screen.getByText("로그인 화면")).toBeInTheDocument();
  });

  it("환불 정책 링크와 Paddle 안내가 있다", () => {
    renderSection();
    expect(screen.getByRole("link", { name: "환불 정책" })).toHaveAttribute("href", "/refund");
    expect(screen.getByText("결제는 Paddle이 처리합니다")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/landing/components/__tests__/pricingSection.test.tsx`
Expected: FAIL — `../pricingSection` 모듈 없음

- [ ] **Step 3: 요금제 스타일 작성**

`client/src/features/landing/components/pricingSection.styles.tsx`:

```tsx
import { styled, css } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const Section = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  padding: 64px 24px;
  border-top: 1px solid ${colors.border.tertiary};
  scroll-margin-top: 16px;

  ${media.tablet} {
    padding: 40px 20px;
  }
`;

const Heading = styled.h2`
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

const Plans = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 360px));
  gap: 24px;
  width: 100%;
  justify-content: center;

  ${media.tablet} {
    grid-template-columns: minmax(0, 1fr);
    max-width: 420px;
  }
`;

const PlanCard = styled.article<{ $highlighted?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 28px 24px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  background-color: ${colors.background.primary};

  ${({ $highlighted }) =>
    $highlighted &&
    css`
      border: 2px solid ${colors.brand.strong};
    `}
`;

const PlanName = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

const PriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
`;

const PlanPrice = styled.p`
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: ${colors.text.primary};
`;

const PriceNote = styled.span`
  font-size: 13px;
  color: ${colors.text.secondary};
`;

const FeatureList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 15px;
  color: ${colors.text.primary};

  svg {
    flex-shrink: 0;
    margin-top: 3px;
    color: ${colors.brand.strong};
  }
`;

const FeatureText = styled.span`
  display: flex;
  flex-direction: column;
`;

const FeatureDescription = styled.span`
  font-size: 13px;
  color: ${colors.text.secondary};
`;

const PlanButton = styled.button<{ $variant: "primary" | "secondary" }>`
  min-height: 44px;
  padding: 0 20px;
  border-radius: ${radius.md};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  ${({ $variant }) =>
    $variant === "primary"
      ? css`
          border: none;
          background-color: ${colors.brand.strong};
          color: ${colors.brand.onStrong};

          &:hover {
            background-color: ${colors.brand.strongHover};
          }
        `
      : css`
          border: 1px solid ${colors.brand.strong};
          background-color: transparent;
          color: ${colors.brand.strong};

          &:hover {
            background-color: ${colors.brand.tint};
          }
        `}
`;

const PlanHint = styled.p`
  margin: -8px 0 0;
  font-size: 13px;
  text-align: center;
  color: ${colors.text.secondary};
`;

const Notes = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  text-align: center;
  color: ${colors.text.secondary};

  p {
    margin: 0;
  }

  a {
    color: ${colors.brand.strong};
  }
`;

export {
  Section,
  Heading,
  Plans,
  PlanCard,
  PlanName,
  PriceRow,
  PlanPrice,
  PriceNote,
  FeatureList,
  FeatureItem,
  FeatureText,
  FeatureDescription,
  PlanButton,
  PlanHint,
  Notes,
};
```

버튼 색은 같은 랜딩의 `ctaButtons.styles.tsx`(Primary: `brand.strong` 배경 + `brand.onStrong` 글자, Secondary: `brand.strong` 테두리·글자 + hover `brand.tint`)와 맞춘 것이다. 토큰 원본은 `packages/core/src/theme/light.ts`.

- [ ] **Step 4: 요금제 컴포넌트 구현**

`client/src/features/landing/components/pricingSection.tsx`:

```tsx
import { Check } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PREMIUM_BENEFITS, PREMIUM_MONTHLY_PRICE_LABEL } from "@/features/billing/config";
import {
  FeatureDescription,
  FeatureItem,
  FeatureList,
  FeatureText,
  Heading,
  Notes,
  PlanButton,
  PlanCard,
  PlanHint,
  PlanName,
  PlanPrice,
  Plans,
  PriceNote,
  PriceRow,
  Section,
} from "./pricingSection.styles";

const FREE_FEATURES = ["Today·목록·칸반·캘린더", "반복 할 일", "마감 알림"] as const;

/**
 * 비로그인 방문자에게 무료/프리미엄 차이와 가격을 보여준다. Paddle 도메인 심사는 로그인 없이
 * 가격을 볼 수 있어야 통과하므로 BILLING_ENABLED와 무관하게 항상 렌더한다. 버튼은 결제로
 * 바로 이어지지 않고 로그인으로 보낸다(체험·결제는 로그인 후 /premium에서).
 */
const PricingSection = () => {
  const navigate = useNavigate();
  const goToLogin = () => navigate("/login");

  return (
    <Section id="pricing" aria-labelledby="pricing-heading">
      <Heading id="pricing-heading">요금제</Heading>
      <Plans>
        <PlanCard aria-labelledby="plan-free">
          <PlanName id="plan-free">무료</PlanName>
          <PriceRow>
            <PlanPrice>0원</PlanPrice>
          </PriceRow>
          <FeatureList>
            {FREE_FEATURES.map((feature) => (
              <FeatureItem key={feature}>
                <Check size={16} aria-hidden="true" />
                <span>{feature}</span>
              </FeatureItem>
            ))}
          </FeatureList>
          <PlanButton type="button" $variant="secondary" onClick={goToLogin}>
            무료로 시작하기
          </PlanButton>
        </PlanCard>
        <PlanCard aria-labelledby="plan-premium" $highlighted>
          <PlanName id="plan-premium">프리미엄</PlanName>
          <PriceRow>
            <PlanPrice>{PREMIUM_MONTHLY_PRICE_LABEL}</PlanPrice>
            <PriceNote>부가세 포함</PriceNote>
          </PriceRow>
          <FeatureList>
            {PREMIUM_BENEFITS.map(({ icon: Icon, title, description }) => (
              <FeatureItem key={title}>
                <Icon size={16} aria-hidden="true" />
                <FeatureText>
                  <span>{title}</span>
                  <FeatureDescription>{description}</FeatureDescription>
                </FeatureText>
              </FeatureItem>
            ))}
          </FeatureList>
          <PlanButton type="button" $variant="primary" onClick={goToLogin}>
            7일 무료 체험 시작하기
          </PlanButton>
          <PlanHint>카드 등록 없이 · 계정당 1회</PlanHint>
        </PlanCard>
      </Plans>
      <Notes>
        <p>
          언제든 해지할 수 있어요 · 결제 후 14일 이내 전액 환불 (<Link to="/refund">환불 정책</Link>)
        </p>
        <p>결제는 Paddle이 처리합니다</p>
      </Notes>
    </Section>
  );
};

export default PricingSection;
```

- [ ] **Step 5: 요금제 테스트 통과 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/landing/components/__tests__/pricingSection.test.tsx`
Expected: PASS

- [ ] **Step 6: 실패하는 랜딩 통합 테스트 작성**

`client/src/features/landing/pages/__tests__/landingPage.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "../landingPage";

const renderLanding = () =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );

describe("LandingPage", () => {
  it("헤더의 요금제 링크가 #pricing으로 간다", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: "요금제" })).toHaveAttribute("href", "#pricing");
  });

  it("요금제 섹션과 마감 알림 기능 카드가 있다", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 2, name: "요금제" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "마감 알림" })).toBeInTheDocument();
  });

  it("부제가 최신 기능을 소개한다", () => {
    renderLanding();
    expect(screen.getByText("Today·칸반·캘린더에 마감 알림까지, 할 일을 한눈에")).toBeInTheDocument();
  });

  it("푸터에 법적 링크가 있다", () => {
    renderLanding();
    expect(screen.getByRole("navigation", { name: "약관 및 정책" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: 실패 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/landing/pages`
Expected: FAIL — 요금제 링크·섹션·마감 알림 카드·새 부제 없음 (푸터 테스트는 Task 5로 이미 통과). 기능 카드 제목은 `featureCard.styles.tsx:39`의 `CardTitle = styled.h3`이라 level 3이다.

- [ ] **Step 8: 헤더에 요금제 링크**

`client/src/features/landing/components/landingHeader.styles.tsx` — `LoginLink` 정의 위에 추가하고 export 목록에 `HeaderNav, PricingLink` 추가:

```tsx
const HeaderNav = styled.nav`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const PricingLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.secondary};
  text-decoration: none;

  &:hover {
    color: ${colors.text.primary};
  }
`;
```

`client/src/features/landing/components/landingHeader.tsx` — import에 `HeaderNav, PricingLink` 추가, `<LoginLink ...>로그인 →</LoginLink>`를 다음으로 교체:

```tsx
      <HeaderNav aria-label="랜딩 메뉴">
        <PricingLink href="#pricing">요금제</PricingLink>
        <LoginLink type="button" onClick={() => navigate("/login")}>
          로그인 →
        </LoginLink>
      </HeaderNav>
```

- [ ] **Step 9: 기능 카드·부제·배치**

`client/src/features/landing/components/featureGrid.tsx`:
- 1행을 `import { Sun, LayoutGrid, CalendarDays, Bell } from "lucide-react";`로 변경
- `FEATURES` 배열의 캘린더 항목 뒤에 추가:

```ts
  {
    icon: Bell,
    title: "마감 알림",
    description: "마감 전에 푸시 알림으로 알려줘요",
    badgeLabel: LOGIN_REQUIRED_BADGE,
  },
```

`client/src/features/landing/components/heroSection.tsx`:
- `<Subtitle>Today 리스트·칸반보드·캘린더로 할 일을 한눈에</Subtitle>` → `<Subtitle>Today·칸반·캘린더에 마감 알림까지, 할 일을 한눈에</Subtitle>`

`client/src/features/landing/pages/landingPage.tsx`:
- import 추가: `import PricingSection from "../components/pricingSection";`
- `<FeatureGrid />` 바로 아래에 `<PricingSection />` 추가

`client/src/features/landing/components/featureGrid.styles.tsx`의 `Grid`는 `repeat(3, 1fr)` 고정이라 4번째 카드가 혼자 줄바꿈된다. 다음처럼 바꾼다(데스크톱 4열 → 태블릿 2열 → 모바일 1열):

```tsx
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 64px 24px;

  ${media.tablet} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 40px 20px;
    gap: 16px;
  }

  ${media.mobile} {
    grid-template-columns: minmax(0, 1fr);
  }
`;
```

커밋 대상에 `featureGrid.styles.tsx`도 포함된다(`git add src/features/landing`).

- [ ] **Step 10: 통과 확인**

Run: `VITE_FIREBASE_API_KEY= npx vitest run src/features/landing src/features/auth`
Expected: PASS

- [ ] **Step 11: 커밋**

```bash
git add src/features/landing
git commit -m "feat(landing): 무료·프리미엄 요금제 섹션과 마감 알림 소개 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 전체 검증 (테스트·타입·번들·브라우저)

**Files:**
- Modify: 없음(발견된 문제만 해당 Task 파일에서 수정)

- [ ] **Step 1: 전체 테스트(CI 등가)**

Run: `VITE_FIREBASE_API_KEY= npx vitest run`
Expected: 전체 PASS (기존 900여 개 + 신규)

- [ ] **Step 2: 타입·린트**

Run: `npx tsc -b && npm run lint`
Expected: 에러 0

- [ ] **Step 3: 빌드와 번들 확인**

Run:
```bash
VITE_SENTRY_DSN=https://public@o0.ingest.sentry.io/0 npm run build
ls dist/assets | grep -E "legalPage|landingPage"
grep -lE "firestore.googleapis|paddle" dist/assets/legalPage-*.js dist/assets/landingPage-*.js || echo "OK: 금지 의존성 없음"
```
Expected: `legalPage-*.js`·`landingPage-*.js` 청크가 있고, 마지막 줄이 `OK: 금지 의존성 없음`. 걸리면 해당 청크의 import 경로를 추적해 Firestore/Paddle을 끌어오는 import를 제거한다.

- [ ] **Step 4: 브라우저 실측**

`npm run dev`로 띄우고(5173 점유 시 표시된 포트 사용) **로그아웃 상태**에서 확인:
1. `/` — 헤더 "요금제" 클릭 시 요금제 섹션으로 이동, 무료/프리미엄 카드, 환불 정책 링크
2. 주소창에 `/terms` 직접 입력 → 이용약관과 `[판매자명 미정]` 표시
3. `/terms` 맨 아래 푸터의 "환불 정책" 클릭 → 환불 정책이 맨 위부터 보임
4. `/privacy`를 폭 390px·320px로 — 표는 표 안에서만 가로 스크롤, 페이지 자체는 가로 스크롤 없음(`document.documentElement.scrollWidth <= window.innerWidth`를 콘솔에서 확인), 푸터 링크 줄바꿈
5. 위 1·2·4를 다크 모드(테마 토글 또는 OS 다크)로 반복 — 글자·표 테두리가 보임

로그인 상태에서:
6. 모바일 폭에서 드로어 열기 → 하단 "이용약관" → 드로어 닫히고 이용약관 표시
7. 데스크톱 앱 셸 푸터에 법적 링크 표시, `/premium`의 혜택 목록이 이전과 같음

- [ ] **Step 5: 마무리 커밋(수정이 있었다면)**

```bash
git add -A src
git commit -m "fix(legal): 브라우저 실측에서 발견한 레이아웃 수정

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

수정이 없으면 이 단계는 건너뛴다.
