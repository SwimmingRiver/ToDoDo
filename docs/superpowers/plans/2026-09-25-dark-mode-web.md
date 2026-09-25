# 다크모드(웹) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 클라이언트에 시스템/라이트/다크 3택 다크모드를 넣는다. 색 토큰의 원본은 `packages/core`에 하나만 둔다.

**Architecture:** 팔레트 두 벌(light/dark)과 대비·CSS 생성 순수 함수를 `packages/core/src/theme/`에 둔다. 웹은 Vite virtual 모듈로 `:root`/`:root[data-theme="dark"]` CSS 변수를 주입한다. 기존 `colors`/`statusColors`/`urgencyColors`는 같은 모양을 유지하되 값만 `var(--…)` 문자열로 바뀌므로 기존 사용처는 무수정이다. 하드코딩된 색 리터럴은 토큰으로 치환하고 ESLint로 재발을 막는다. 마지막 마일스톤에서 `index.html` 인라인 스크립트, `ThemePreferenceProvider`, 헤더 `ThemeMenu`로 스위치를 켠다.

**Tech Stack:** TypeScript, React 19, styled-components, Vite(virtual module 플러그인), Vitest + Testing Library, ESLint flat config, `@tododo/core`(file: 심링크, **dist 커밋 방식**).

**Spec:** `docs/superpowers/specs/2026-09-25-dark-mode-design.md`

## Global Constraints

- 범위: `packages/core` + `client`만. `mobile/`, `server/`, `docker-compose.yml`은 수정 금지.
- `packages/core`는 `dist/`를 git에 커밋한다. core `src`를 바꾸는 태스크는 `cd packages/core && npm run build` 후 `dist/` 변경분까지 커밋한다(client는 `dist/index.js`를 소비).
- 저장 키: `"tododo:theme"`. 값: `"system" | "light" | "dark"`. 없거나 잘못됐거나 읽다가 throw하면 `"system"`.
- CSS 변수명: 토큰 경로를 kebab-case로 `-` 연결 (`status.doing.main` → `--status-doing-main`, `brand.strongHover` → `--brand-strong-hover`).
- 다크 팔레트 값은 spec §1 표 그대로. 단 `brand.strongHover`(dark)는 `#6EE0B8`이다(spec 갱신됨; `#5DD8AE`는 strong과 1.17:1이라 hover 구분 1.2 미달).
- 신규 토큰은 `brand.onStrong`, `surface.raised`, `surface.overlay`, `scrim` 4개뿐이다. 그 밖의 새 토큰을 만들지 않는다.
- 커밋 메시지는 한국어 conventional(`feat(theme): …`)이고 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다.
- **git hooks 우회 금지.** `--no-verify` 사용 금지. pre-commit(lint-staged + vitest)이 실패하면 원인을 고친다.
- 마일스톤 = PR 경계. A(Task 1–2) → B(Task 3–8) → C(Task 9–12). 마일스톤 B까지는 사용자에게 다크가 보이면 안 된다(`data-theme`를 설정하는 코드는 C에서만 추가).

### 리터럴 → 토큰 매핑표 (Task 4–7 공통)

| 리터럴 | 쓰임 | 토큰 |
|---|---|---|
| `#fff` `#ffffff` `white` | 페이지 바탕 | `colors.background.primary` |
| 〃 | 카드·패널·리스트 아이템·입력 필드 배경 | `colors.surface.raised` |
| 〃 | 모달·바텀시트·토스트·드롭다운·팝오버 배경 | `colors.surface.overlay` |
| 〃 | `brand.strong`/`brand.fill` 솔리드 위 글자·아이콘 | `colors.brand.onStrong` |
| 〃 | `danger.main` 솔리드 위 글자 | `colors.background.primary` |
| `#f0f0f0` `#f5f5f5` `#f1f3f4` `#f8f9fa` `#f4f5f7` `#f9f9f9` `#f7f8f9` `#e8eaed`(배경) `#f4f5f6` | 보조 배경·hover 배경·스켈레톤 | `colors.background.secondary` |
| `#e0e0e0` `#e8e8e8` `#e9ecef` `#e3e6ea` `#eceff3` `#e5e7eb` | 1px 구분선 | `colors.border.tertiary` |
| `#ddd` `#d0d0d0` `#dadce0` `#d1d5db` | 입력 테두리·강한 구분선 | `colors.border.secondary` |
| `#1a1a1a` `#333` `#172b4d` `#495057` | 본문 글자 | `colors.text.primary` |
| `#666` `#5f6368` `#5e6c84` | 보조 글자 | `colors.text.secondary` |
| `#999` `#9aa0a6` `#9ca3af` | 비활성·플레이스홀더 | `colors.text.tertiary` |
| `#0f6e56` | | `colors.brand.strong` |
| `#1d9e75` `#4caf50` | | `colors.brand.fill` |
| `#e8f5ef` `#e0ede8` `#d5ede4` `#f0fbf7` `#e8f5e9` | 연한 초록 배경 | `colors.brand.tint` |
| `rgba(15, 110, 86, A)` | 브랜드 반투명(포커스 링·hover) | `` `color-mix(in srgb, ${colors.brand.strong} {A×100}%, transparent)` `` |
| `#e24b4a` `#ef4444` `#f44336` `#d32f2f` | | `colors.danger.main` |
| `#c53a39` | | `colors.danger.text` |
| `#fbeaea` `#ffebee` | | `colors.danger.background` |
| `#f5c2c1` | | `colors.danger.subtle` |
| `#f97316` `#ff9800` | | `urgencyColors.soon.main` |
| `#f59e0b` | | `urgencyColors.soon.text` |
| `#ffedd5` `#fff3e0` `#fef3e2` | | `urgencyColors.soon.background` |
| `#2196f3` | 토스트 info 강조 | `colors.text.secondary` |
| `#e3f2fd` | 토스트 info 배경 | `colors.background.secondary` |
| `#f3f4f6` `#e5faf3` `#ede9fe` 등 상태 배경 | | 해당 `statusColors.{status}.light` |
| `rgba(0, 0, 0, A)` | 모달/시트 뒤 덮개 | `colors.scrim` |
| `rgba(0, 0, 0, A)` | `box-shadow` 안 | **유지** (ESLint 허용 패턴) |
| Google 로고 색(`#ea4335` `#fbbc05` `#4285f4` `#34a853`) | 로그인 버튼 로고 | **유지** + `// eslint-disable-next-line no-restricted-syntax -- Google 브랜드 로고 고정색` |

표에 없는 값: 명도가 가장 가까운 같은 역할의 토큰을 쓴다. 그 값과 선택한 토큰을 커밋 메시지 본문에 `미매핑: #abc → colors.x.y` 형식으로 남긴다.

## Review Focus

1. **localStorage 접근이 throw하는 환경**(Safari 프라이빗, 쿠키 차단): 인라인 스크립트와 Provider 모두 크래시 없이 system으로 동작해야 한다. 테스트는 Task 9·10에서 추가.
2. **preference=system 상태에서 OS 테마 전환**: 새로고침 없이 즉시 반영돼야 하고, preference=light/dark일 때는 OS 전환을 무시해야 한다. 테스트는 Task 9에서 추가.
3. **인라인 스크립트와 `resolveScheme`의 판정 불일치**: 둘이 다르면 첫 페인트와 React 마운트 뒤 테마가 뒤바뀌며 깜빡인다. 6조합 파리티 테스트는 Task 10에서 추가.
4. **색 대신 `var()`를 받은 SVG 프레젠테이션 속성**: `fill="var(--x)"`는 브라우저마다 무시될 수 있어 차트가 검게 그려질 수 있다. `style` prop 전환 확인 테스트는 Task 6에서 추가.
5. **메뉴가 열린 채 바깥 클릭/Esc/선택 후 포커스**: 키보드 사용자가 갇히거나 포커스를 잃으면 안 된다. 테스트는 Task 11에서 추가.

---

## Milestone A — core 팔레트 (PR 1)

### Task 1: core 테마 토큰·팔레트·대비 검증

**Files:**
- Create: `packages/core/src/theme/tokens.ts`
- Create: `packages/core/src/theme/light.ts`
- Create: `packages/core/src/theme/dark.ts`
- Create: `packages/core/src/theme/contrast.ts`
- Create: `packages/core/src/theme/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/theme/__tests__/contrast.test.ts`
- Test: `packages/core/src/theme/__tests__/palette.test.ts`

**Interfaces:**
- Produces: `ThemeTokens`, `ThemeScheme = "light" | "dark"`, `ThemePreference = ThemeScheme | "system"`, `TokenRefs<T>`, `lightTokens: ThemeTokens`, `darkTokens: ThemeTokens`, `themes: Record<ThemeScheme, ThemeTokens>`, `contrast(a: string, b: string): number` (`#RRGGBB` 전용)

- [ ] **Step 1: 대비 helper 실패 테스트 작성**

`packages/core/src/theme/__tests__/contrast.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { contrast } from "../contrast";

describe("contrast", () => {
  // 공식이 틀리면 팔레트 검증이 전부 공허하게 통과하므로 먼저 고정한다.
  it("검정과 흰색은 21:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });
  it("같은 색은 1:1", () => {
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("인자 순서와 무관", () => {
    expect(contrast("#0F6E56", "#FFFFFF")).toBeCloseTo(contrast("#FFFFFF", "#0F6E56"), 5);
  });
  it("소문자 hex도 같은 값", () => {
    expect(contrast("#0f6e56", "#ffffff")).toBeCloseTo(contrast("#0F6E56", "#FFFFFF"), 5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd packages/core && npx vitest run src/theme/__tests__/contrast.test.ts`
Expected: FAIL — `Cannot find module '../contrast'`

- [ ] **Step 3: `contrast.ts` 구현**

```ts
/**
 * WCAG 2.1 대비비. 색 라이브러리 대신 직접 둔다 — 공식이 짧고 팔레트 검증에만 쓴다.
 * `#RRGGBB`만 받는다(팔레트가 전부 이 형식이다. `scrim`은 rgba라 대비 검증 대상이 아니다).
 */
const relativeLuminance = (hex: string): number => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

export const contrast = (a: string, b: string): number => {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};
```

- [ ] **Step 4: 통과 확인**

Run: `cd packages/core && npx vitest run src/theme/__tests__/contrast.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 팔레트 실패 테스트 작성**

`packages/core/src/theme/__tests__/palette.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { contrast } from "../contrast";
import { lightTokens, darkTokens, themes } from "..";

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
const statuses = ["todo", "doing", "done"] as const;

/** 두 팔레트가 같은 키 집합을 갖는지(한쪽에만 토큰을 추가하는 실수 방지). */
const leafPaths = (node: object, prefix = ""): string[] =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : leafPaths(v as object, `${prefix}${k}.`),
  );

describe("팔레트 구조", () => {
  it("light와 dark는 같은 토큰 경로를 가진다", () => {
    expect(leafPaths(darkTokens).sort()).toEqual(leafPaths(lightTokens).sort());
  });
  it("themes는 두 팔레트를 scheme 이름으로 노출한다", () => {
    expect(themes.light).toBe(lightTokens);
    expect(themes.dark).toBe(darkTokens);
  });
  it("urgency.danger는 danger 토큰을 그대로 재사용한다", () => {
    for (const t of [lightTokens, darkTokens]) {
      expect(t.urgency.danger).toEqual({ main: t.danger.main, background: t.danger.background, text: t.danger.text });
    }
  });
});

describe.each([
  ["light", lightTokens],
  ["dark", darkTokens],
] as const)("%s 팔레트 AA", (_name, t) => {
  const surfaces = [t.background.primary, t.surface.raised, t.surface.overlay];

  it.each(surfaces)("본문·보조 글자는 %s 위에서 AA", (bg) => {
    expect(contrast(t.text.primary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(t.text.secondary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("보조 글자는 background.secondary 위에서도 AA", () => {
    expect(contrast(t.text.secondary, t.background.secondary)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it.each(surfaces)("brand.strong은 %s 위 글자로 AA", (bg) => {
    expect(contrast(t.brand.strong, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("brand.strong은 tint 위에서 AA", () => {
    expect(contrast(t.brand.strong, t.brand.tint)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("onStrong은 strong·strongHover 솔리드 위에서 AA", () => {
    expect(contrast(t.brand.onStrong, t.brand.strong)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(t.brand.onStrong, t.brand.strongHover)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("strongHover는 바탕 위 글자로 AA", () => {
    expect(contrast(t.brand.strongHover, t.background.primary)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("strongHover는 strong과 1.2:1 이상 구분된다", () => {
    expect(contrast(t.brand.strong, t.brand.strongHover)).toBeGreaterThanOrEqual(1.2);
  });
  it("fill은 바탕 위 비텍스트 3:1", () => {
    expect(contrast(t.brand.fill, t.background.primary)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
  it.each(statuses)("status.%s.main은 자기 light 배경과 카드 위에서 AA", (s) => {
    expect(contrast(t.status[s].main, t.status[s].light)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(t.status[s].main, t.surface.raised)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("urgency.soon.text는 자기 배경 위에서 AA", () => {
    expect(contrast(t.urgency.soon.text, t.urgency.soon.background)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("danger.main은 카드 위 비텍스트 3:1", () => {
    expect(contrast(t.danger.main, t.surface.raised)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe("light 전용 불변식", () => {
  it("light fill은 글자색으로 쓸 수 없다(fill/strong을 나누는 이유)", () => {
    // 다크에서는 밝은 fill이 어두운 바탕 위에서 글자 대비를 넘기므로 light에만 적용한다.
    expect(contrast(lightTokens.brand.fill, "#FFFFFF")).toBeLessThan(AA_TEXT);
  });
});
```

> 참고: light의 `danger.text`(`#C53A39`)는 `danger.background`(`#FBEAEA`) 위에서 4.47:1이라 AA에 0.03 못 미친다. 기존부터 있던 값이고 이 플랜 범위 밖이라 해당 쌍은 테스트하지 않는다(최종 보고에 포함).

- [ ] **Step 6: 실패 확인**

Run: `cd packages/core && npx vitest run src/theme/__tests__/palette.test.ts`
Expected: FAIL — `Cannot find module '..'` 또는 export 없음

- [ ] **Step 7: 토큰 타입·팔레트 구현**

`packages/core/src/theme/tokens.ts`:
```ts
export type ThemeScheme = "light" | "dark";
export type ThemePreference = ThemeScheme | "system";

interface StatusSwatch { main: string; light: string; border: string }
interface UrgencySwatch { main: string; background: string; text: string }

/** 의미 토큰. light/dark가 같은 모양임을 타입으로 강제한다. */
export interface ThemeTokens {
  brand: { strong: string; strongHover: string; fill: string; tint: string; onStrong: string };
  danger: { main: string; subtle: string; background: string; text: string };
  background: { primary: string; secondary: string };
  surface: { raised: string; overlay: string };
  text: { primary: string; secondary: string; tertiary: string };
  border: { secondary: string; tertiary: string; danger: string };
  status: { todo: StatusSwatch; doing: StatusSwatch; done: StatusSwatch };
  urgency: { soon: UrgencySwatch; danger: UrgencySwatch };
  scrim: string;
}

/** 같은 모양, 값은 CSS 변수 참조 문자열. */
export type TokenRefs<T> = { [K in keyof T]: T[K] extends string ? string : TokenRefs<T[K]> };
```

`packages/core/src/theme/light.ts` (값은 현재 `client/src/styles/*.ts`에서 그대로 이관, 주석의 대비 근거도 옮긴다):
```ts
import type { ThemeTokens } from "./tokens";

const danger = { main: "#E24B4A", subtle: "#F5C2C1", background: "#FBEAEA", text: "#C53A39" };

export const lightTokens: ThemeTokens = {
  brand: {
    /** 글자·아이콘, 흰 글자를 얹는 솔리드 배경, 포커스. 흰색과 6.20:1. */
    strong: "#0F6E56",
    /** strong hover/active. 흰색과 9.69:1. */
    strongHover: "#0A4E3C",
    /** 흰/회색 배경 위, 글자를 얹지 않는 장식 전용. 흰색과 3.39:1이라 글자 금지. */
    fill: "#1D9E75",
    /** 연한 배경. 반복 배지, 활성 내비, hover 배경. */
    tint: "#E8F5EF",
    /** strong/strongHover 솔리드 위 글자. */
    onStrong: "#FFFFFF",
  },
  danger,
  background: { primary: "#FFFFFF", secondary: "#F4F5F6" },
  surface: { raised: "#FFFFFF", overlay: "#FFFFFF" },
  text: { primary: "#1A1A1A", secondary: "#5F6368", tertiary: "#9AA0A6" },
  border: { secondary: "#D1D5DB", tertiary: "#E5E7EB", danger: "#E24B4A" },
  status: {
    // main은 light 배경·흰 배경 위 텍스트로도 쓰여 AA 4.5를 만족해야 한다.
    todo: { main: "#4b5563", light: "#f3f4f6", border: "#9ca3af" },
    // brand.fill과 같은 hue 160°대 — 프로젝트 카드 "진행중" 점과 통일.
    doing: { main: "#117453", light: "#e5faf3", border: "#5ae2b5" },
    // "완료=초록" 통념과 충돌하지 않으면서 doing/todo와 뚜렷이 구분되는 보라.
    done: { main: "#6d28d9", light: "#ede9fe", border: "#a78bfa" },
  },
  urgency: {
    soon: { main: "#F97316", background: "#FFEDD5", text: "#C2410C" },
    danger: { main: danger.main, background: danger.background, text: danger.text },
  },
  scrim: "rgba(0, 0, 0, 0.4)",
};
```

`packages/core/src/theme/dark.ts`:
```ts
import type { ThemeTokens } from "./tokens";

// 뉴트럴 그레이 + 층 간 명도차: 바탕 #121212 → 카드 #1E1E1E → 모달 #262626.
// 다크에선 그림자가 거의 안 보이므로 층 구분을 명도로 한다.
const danger = { main: "#FF7A78", subtle: "#5C2B2B", background: "#3A1C1C", text: "#FF8E8C" };

export const darkTokens: ThemeTokens = {
  brand: {
    /** 어두운 바탕에서 진한 초록은 묻히므로 밝은 초록으로 반전. 카드 위 8.1:1. */
    strong: "#3CCB9A",
    /** strong과 1.28:1 — hover 인지 가능. */
    strongHover: "#6EE0B8",
    fill: "#2FB386",
    tint: "#16352B",
    /** 밝은 초록 솔리드 위 거의 검정 글자. strong 위 8.1:1. */
    onStrong: "#06231A",
  },
  danger,
  background: { primary: "#121212", secondary: "#181818" },
  surface: { raised: "#1E1E1E", overlay: "#262626" },
  text: { primary: "#E8EAED", secondary: "#A8ADB3", tertiary: "#7C8187" },
  border: { secondary: "#3A3A3A", tertiary: "#2C2C2C", danger: "#FF7A78" },
  status: {
    todo: { main: "#C4C9D0", light: "#2A2D31", border: "#5B6168" },
    doing: { main: "#4FD1A5", light: "#123A2E", border: "#2A8F6D" },
    done: { main: "#B79CFF", light: "#2A2145", border: "#7C5FD6" },
  },
  urgency: {
    soon: { main: "#FB923C", background: "#3A2412", text: "#FDBA74" },
    danger: { main: danger.main, background: danger.background, text: danger.text },
  },
  scrim: "rgba(0, 0, 0, 0.6)",
};
```

`packages/core/src/theme/index.ts`:
```ts
import { lightTokens } from "./light";
import { darkTokens } from "./dark";
import type { ThemeScheme, ThemeTokens } from "./tokens";

export type { ThemeTokens, ThemeScheme, ThemePreference, TokenRefs } from "./tokens";
export { lightTokens, darkTokens };
export { contrast } from "./contrast";

export const themes: Record<ThemeScheme, ThemeTokens> = { light: lightTokens, dark: darkTokens };
```

`packages/core/src/index.ts` 끝에 추가:
```ts
export * from "./theme";
```

- [ ] **Step 8: 통과 확인**

Run: `cd packages/core && npx vitest run src/theme`
Expected: PASS (contrast 4 + palette 전부)

- [ ] **Step 9: core 전체 테스트·빌드**

Run: `cd packages/core && npm test && npm run build`
Expected: 전부 PASS. `dist/theme/*.js`, `dist/theme/*.d.ts`가 생성됨.

- [ ] **Step 10: 커밋**

```bash
git add packages/core/src/theme packages/core/src/index.ts packages/core/dist
git commit -m "feat(theme): core에 light/dark 의미 토큰 팔레트와 두 테마 AA 검증 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: scheme 판정·CSS 변수 생성 순수 함수

**Files:**
- Create: `packages/core/src/theme/resolveScheme.ts`
- Create: `packages/core/src/theme/css.ts`
- Modify: `packages/core/src/theme/index.ts`
- Test: `packages/core/src/theme/__tests__/resolveScheme.test.ts`
- Test: `packages/core/src/theme/__tests__/css.test.ts`

**Interfaces:**
- Consumes: `ThemeTokens`, `ThemePreference`, `ThemeScheme`, `TokenRefs`, `lightTokens`, `darkTokens` (Task 1)
- Produces:
  - `THEME_STORAGE_KEY = "tododo:theme"`
  - `parsePreference(raw: unknown): ThemePreference` (잘못된 값 → `"system"`)
  - `resolveScheme(preference: ThemePreference, osPrefersDark: boolean): ThemeScheme`
  - `toCssVarName(path: readonly string[]): string`
  - `toCssVarRefs<T extends object>(tokens: T): TokenRefs<T>`
  - `buildThemeCss(light: ThemeTokens, dark: ThemeTokens): string`

- [ ] **Step 1: 실패 테스트 작성**

`packages/core/src/theme/__tests__/resolveScheme.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveScheme, parsePreference, THEME_STORAGE_KEY } from "..";

describe("resolveScheme", () => {
  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
  ] as const)("preference=%s, osDark=%s → %s", (pref, osDark, expected) => {
    expect(resolveScheme(pref, osDark)).toBe(expected);
  });
});

describe("parsePreference", () => {
  it.each(["system", "light", "dark"] as const)("유효값 %s는 그대로", (v) => {
    expect(parsePreference(v)).toBe(v);
  });
  it.each([null, undefined, "", "Dark", "auto", 1, {}])("잘못된 값 %s는 system", (v) => {
    expect(parsePreference(v)).toBe("system");
  });
});

it("저장 키는 tododo:theme", () => {
  expect(THEME_STORAGE_KEY).toBe("tododo:theme");
});
```

`packages/core/src/theme/__tests__/css.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toCssVarName, toCssVarRefs, buildThemeCss, lightTokens, darkTokens } from "..";

const leafPaths = (node: object, prefix: string[] = []): string[][] =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === "string" ? [[...prefix, k]] : leafPaths(v as object, [...prefix, k]),
  );

describe("toCssVarName", () => {
  it("경로를 kebab-case로 잇는다", () => {
    expect(toCssVarName(["status", "doing", "main"])).toBe("--status-doing-main");
    expect(toCssVarName(["brand", "strongHover"])).toBe("--brand-strong-hover");
    expect(toCssVarName(["scrim"])).toBe("--scrim");
  });
});

describe("toCssVarRefs", () => {
  it("모든 leaf를 var(--경로)로 바꾸고 모양은 유지한다", () => {
    const refs = toCssVarRefs(lightTokens);
    expect(refs.brand.strong).toBe("var(--brand-strong)");
    expect(refs.status.done.light).toBe("var(--status-done-light)");
    expect(refs.scrim).toBe("var(--scrim)");
    expect(leafPaths(refs)).toEqual(leafPaths(lightTokens));
  });
});

describe("buildThemeCss", () => {
  const css = buildThemeCss(lightTokens, darkTokens);
  it("light는 :root, dark는 :root[data-theme=\"dark\"]에 선언한다", () => {
    expect(css).toMatch(/:root\s*\{[^}]*--brand-strong:\s*#0F6E56;/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*--brand-strong:\s*#3CCB9A;/);
  });
  it("각 블록에 color-scheme을 선언한다", () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light;/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark;/);
  });
  it("모든 토큰 경로가 두 블록에 모두 선언된다", () => {
    for (const path of leafPaths(lightTokens)) {
      const name = toCssVarName(path);
      expect(css.split(`${name}:`).length - 1).toBe(2);
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd packages/core && npx vitest run src/theme/__tests__/resolveScheme.test.ts src/theme/__tests__/css.test.ts`
Expected: FAIL — export 없음

- [ ] **Step 3: 구현**

`packages/core/src/theme/resolveScheme.ts`:
```ts
import type { ThemePreference, ThemeScheme } from "./tokens";

export const THEME_STORAGE_KEY = "tododo:theme";

export const parsePreference = (raw: unknown): ThemePreference =>
  raw === "light" || raw === "dark" || raw === "system" ? raw : "system";

/**
 * client/index.html의 인라인 스크립트가 같은 규칙을 복제한다(첫 페인트 전이라 모듈을
 * import할 수 없다). 규칙을 바꾸면 그쪽도 함께 바꾸고 파리티 테스트를 돌릴 것.
 */
export const resolveScheme = (preference: ThemePreference, osPrefersDark: boolean): ThemeScheme =>
  preference === "system" ? (osPrefersDark ? "dark" : "light") : preference;
```

`packages/core/src/theme/css.ts`:
```ts
import type { ThemeTokens, TokenRefs } from "./tokens";

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export const toCssVarName = (path: readonly string[]): string => `--${path.map(kebab).join("-")}`;

const mapLeaves = (node: object, path: string[], fn: (path: string[], value: string) => string): object =>
  Object.fromEntries(
    Object.entries(node).map(([k, v]) => [
      k,
      typeof v === "string" ? fn([...path, k], v) : mapLeaves(v as object, [...path, k], fn),
    ]),
  );

/** 같은 모양의 객체를 값만 `var(--경로)`로 바꿔 돌려준다. */
export const toCssVarRefs = <T extends object>(tokens: T): TokenRefs<T> =>
  mapLeaves(tokens, [], (path) => `var(${toCssVarName(path)})`) as TokenRefs<T>;

const declarations = (tokens: ThemeTokens): string => {
  const lines: string[] = [];
  mapLeaves(tokens, [], (path, value) => {
    lines.push(`  ${toCssVarName(path)}: ${value};`);
    return value;
  });
  return lines.join("\n");
};

export const buildThemeCss = (light: ThemeTokens, dark: ThemeTokens): string =>
  `:root {\n  color-scheme: light;\n${declarations(light)}\n}\n` +
  `:root[data-theme="dark"] {\n  color-scheme: dark;\n${declarations(dark)}\n}\n`;
```

`packages/core/src/theme/index.ts`에 추가:
```ts
export { THEME_STORAGE_KEY, parsePreference, resolveScheme } from "./resolveScheme";
export { toCssVarName, toCssVarRefs, buildThemeCss } from "./css";
```

- [ ] **Step 4: 통과 확인 + 빌드**

Run: `cd packages/core && npm test && npm run build`
Expected: 전부 PASS, `dist/theme/css.js`·`resolveScheme.js` 생성

- [ ] **Step 5: 커밋**

```bash
git add packages/core/src/theme packages/core/dist
git commit -m "feat(theme): scheme 판정과 CSS 변수 생성 순수 함수 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 마일스톤 A PR** — `feat/dark-mode` 브랜치를 push하고 develop 대상 PR을 연다(제목 `feat(theme): core 다크모드 팔레트`). 이후 마일스톤 B는 이 브랜치에서 `feat/dark-mode-web-infra`를 만들어 이어간다.

---

## Milestone B — 웹 CSS 변수 인프라 + 하드코딩 정리 (PR 2, 라이트 고정)

### Task 3: client 토큰을 CSS 변수 참조로 전환

**Files:**
- Create: `client/src/styles/themeCssPlugin.ts`
- Modify: `client/vite.config.ts`
- Modify: `client/src/main.tsx`
- Modify: `client/src/index.css`
- Modify: `client/src/styles/colors.ts`
- Modify: `client/src/styles/statusColors.ts`
- Modify: `client/src/styles/urgencyColors.ts`
- Delete: `client/src/styles/__tests__/brandContrast.test.ts` (core `palette.test.ts`로 이관 완료)
- Delete: `client/src/styles/__tests__/statusColorsContrast.test.ts` (〃)
- Modify: `client/src/styles/__tests__/statusColors.test.ts`
- Test: `client/src/styles/__tests__/themeTokens.test.ts`

**Interfaces:**
- Consumes: `lightTokens`, `darkTokens`, `toCssVarRefs`, `buildThemeCss` (Task 1–2)
- Produces:
  - `colors: { brand, danger, background, surface, text, border, scrim }` (값은 `var(--…)`)
  - `statusColors: { todo, doing, done }`, `type Status`, `getStatusColor(status)` (시그니처 불변)
  - `urgencyColors: { soon, danger }`
  - Vite virtual 모듈 `"virtual:theme.css"`

- [ ] **Step 1: 실패 테스트 작성**

`client/src/styles/__tests__/themeTokens.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { lightTokens } from "@tododo/core";
import { colors } from "../colors";
import { statusColors } from "../statusColors";
import { urgencyColors } from "../urgencyColors";

const leaves = (node: object): string[] =>
  Object.values(node).flatMap((v) => (typeof v === "string" ? [v] : leaves(v as object)));

describe("client 토큰 모듈", () => {
  it("모든 값이 CSS 변수 참조다(리터럴 색이 섞이면 다크에서 안 바뀐다)", () => {
    for (const v of [...leaves(colors), ...leaves(statusColors), ...leaves(urgencyColors)]) {
      expect(v).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });
  it("colors는 기존 그룹 + 신규 surface/scrim을 노출한다", () => {
    expect(Object.keys(colors).sort()).toEqual(
      ["background", "border", "brand", "danger", "scrim", "surface", "text"],
    );
    expect(colors.brand.onStrong).toBe("var(--brand-on-strong)");
    expect(colors.surface.overlay).toBe("var(--surface-overlay)");
  });
  it("statusColors·urgencyColors는 core 팔레트와 같은 키를 가진다", () => {
    expect(Object.keys(statusColors)).toEqual(Object.keys(lightTokens.status));
    expect(Object.keys(urgencyColors)).toEqual(Object.keys(lightTokens.urgency));
  });
});
```

`client/src/styles/__tests__/statusColors.test.ts`에서 hex를 단정하는 세 테스트(`todo 상태는 회색…`, `doing…초록…`, `done…보라…`)를 아래로 교체한다(색상 값 자체의 검증은 core `palette.test.ts`가 맡는다):
```ts
    it('각 상태 색은 CSS 변수 참조다', () => {
      expect(statusColors.todo.main).toBe('var(--status-todo-main)')
      expect(statusColors.doing.main).toBe('var(--status-doing-main)')
      expect(statusColors.done.main).toBe('var(--status-done-main)')
    })
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/styles`
Expected: FAIL — `colors.brand.strong`이 `#0F6E56` 등 리터럴

- [ ] **Step 3: 토큰 모듈 교체**

`client/src/styles/colors.ts` 전체:
```ts
import { lightTokens, toCssVarRefs } from "@tododo/core";

/**
 * 색 토큰. 실제 값은 packages/core/src/theme/{light,dark}.ts가 원본이고, 여기선
 * `var(--…)` 참조만 내보낸다. 테마 전환은 <html data-theme>가 바꾸는 CSS 변수로
 * 일어나므로 이 객체를 import하는 컴포넌트는 리렌더 없이 색이 바뀐다.
 * 용도·대비 근거는 core 팔레트 파일 주석 참고.
 */
const { brand, danger, background, surface, text, border, scrim } = toCssVarRefs(lightTokens);

export const colors = { brand, danger, background, surface, text, border, scrim } as const;
```

`client/src/styles/statusColors.ts` 전체:
```ts
import { lightTokens, toCssVarRefs } from "@tododo/core";

/** 상태 색. 값·대비 근거는 packages/core/src/theme 참고. */
export const statusColors = toCssVarRefs(lightTokens).status;

export type Status = keyof typeof statusColors;

export const getStatusColor = (status: Status) => statusColors[status];
```

`client/src/styles/urgencyColors.ts` 전체:
```ts
import { lightTokens, toCssVarRefs } from "@tododo/core";

/** "마감 임박" 2단계 강조 색(Today 화면). danger는 colors.danger와 같은 변수를 가리킨다. */
export const urgencyColors = toCssVarRefs(lightTokens).urgency;
```

- [ ] **Step 4: 이관된 대비 테스트 삭제 후 통과 확인**

```bash
git rm client/src/styles/__tests__/brandContrast.test.ts client/src/styles/__tests__/statusColorsContrast.test.ts
```
Run: `cd client && npx vitest run src/styles`
Expected: PASS

- [ ] **Step 5: CSS 주입 플러그인**

`client/src/styles/themeCssPlugin.ts`:
```ts
import type { Plugin } from "vite";
// vite.config에서 로드된다. @tododo/core 루트는 firebase까지 끌어오고, dist는 확장자 없는
// 상대 import라 Node ESM이 직접 못 읽는다. 그래서 core의 theme 소스를 상대 경로로 가져와
// Vite의 config 번들러(esbuild)가 함께 번들하게 한다. 런타임(client 코드)은 여전히 dist를 쓰며,
// 둘이 같은 src에서 나오는지는 Task 12의 dist 최신성 검사가 보장한다.
import { buildThemeCss, lightTokens, darkTokens } from "../../../packages/core/src/theme/index";

const ID = "virtual:theme.css";
const RESOLVED = `\0${ID}`;

/**
 * core 팔레트로 :root / [data-theme="dark"] CSS 변수 선언을 만들어 가상 CSS 모듈로 제공한다.
 * 빌드 시 추출 CSS에 포함되므로 JS 실행 전(첫 페인트 전)에 변수가 존재한다.
 */
export const themeCssPlugin = (): Plugin => ({
  name: "tododo-theme-css",
  resolveId: (id) => (id === ID ? RESOLVED : undefined),
  load: (id) => (id === RESOLVED ? buildThemeCss(lightTokens, darkTokens) : undefined),
});
```

`client/vite.config.ts`: import 추가 후 `plugins` 배열 첫 항목으로 등록.
```ts
import { themeCssPlugin } from './src/styles/themeCssPlugin'
// ...
  plugins: [
    themeCssPlugin(),
    react(),
```

`client/tsconfig.node.json`의 `"include"`를 `["vite.config.ts", "src/styles/themeCssPlugin.ts"]`로 바꾼다.

`client/src/main.tsx`: `import "./index.css";` **바로 위**에 추가(변수 선언이 사용처보다 먼저 오도록).
```ts
import "virtual:theme.css";
```

`client/src/index.css`의 `body` 규칙을 다음으로 교체한다. 지금은 body 배경이 지정돼 있지 않아서 다크에서 흰 바탕이 드러나기 때문이다.
```css
body {
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background-color: var(--background-primary);
  color: var(--text-primary);
}
```

- [ ] **Step 6: 타입체크·빌드·전체 테스트**

Run: `cd client && npx tsc -b && npm run build && npm test`
Expected: 모두 성공. `grep -o -- '--brand-strong:[^;]*' dist/assets/*.css`가 `#0F6E56`과 `#3CCB9A` 두 줄을 출력.

- [ ] **Step 7: 라이트 화면 불변 확인**

Run: `cd client && npm run dev` → 브라우저에서 `/today`, `/todo`, `/calendar`를 연다. 화면이 develop과 동일하게 보여야 한다(아직 리터럴 치환 전이므로 변화가 없어야 정상). DevTools 콘솔에서 `document.documentElement.dataset.theme = "dark"`를 실행하면 토큰을 쓰는 부분만 어두워지고 리터럴 부분은 흰 채로 남는다. 이것이 Task 4–7의 작업 대상이다. 확인이 끝나면 속성을 지운다.

- [ ] **Step 8: 커밋**

```bash
git add client/src/styles client/vite.config.ts client/tsconfig.node.json client/src/main.tsx client/src/index.css
git commit -m "feat(theme): client 색 토큰을 core 기반 CSS 변수 참조로 전환

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 리터럴 치환 — shared/ui · layouts · App 셸

**Files (Modify):**
`client/src/shared/ui/toast/toast.styles.tsx`, `confirmModal/confirmModal.styles.tsx`, `bottomSheet/bottomSheet.styles.tsx`, `modal/modal.styles.tsx`, `skeleton/{kanbanSkeleton,checkboxSkeleton,calendarSkeleton,insightsSkeleton}.styles.tsx`, `emptyState/emptyState.styles.tsx`, `separator/separator.styles.tsx`, `recurrenceBadge/recurrenceBadge.styles.tsx`, `recurrenceMissedBadge/recurrenceMissedBadge.styles.tsx`, `panel/panel.styles.tsx`, `errorBoundary/errorBoundary.styles.tsx`, `client/src/layouts/snb/{snb.tsx,mobileDrawer.styles.tsx}`, `client/src/layouts/header/header.tsx`, `client/src/layouts/footer/footer.tsx`, `client/src/App.styles.tsx`

**Interfaces:**
- Consumes: `colors`, `statusColors`, `urgencyColors` (Task 3)

- [ ] **Step 1: 현재 리터럴 목록 확보**

Run: `cd client && grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|\bwhite\b" src/shared/ui src/layouts src/App.styles.tsx -r --include='*.tsx' | grep -v __tests__ | grep -v "white-space"`
결과를 매핑표(Global Constraints)에 따라 한 줄씩 치환한다. 치환 예시:

```ts
// toast.styles.tsx — 컨테이너(오버레이 층)
background: ${colors.surface.overlay};
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);   // 그림자는 유지

// toast 타입별 강조(배경 / 아이콘·진행바)
case "success": return colors.brand.tint;        //  / colors.brand.fill
case "error":   return colors.danger.background; //  / colors.danger.main
case "warning": return urgencyColors.soon.background; // / urgencyColors.soon.main
case "info":    return colors.background.secondary;   // / colors.text.secondary

// 모달·바텀시트 뒤 덮개
background-color: ${colors.scrim};

// snb.tsx
background-color: ${colors.background.secondary};   // #f1f3f4
border-right: 1px solid ${colors.border.tertiary};  // #e0e0e0
&:hover { background-color: ${colors.brand.tint}; } // #e0ede8

// 브랜드 반투명 포커스 링
box-shadow: 0 0 0 3px color-mix(in srgb, ${colors.brand.strong} 15%, transparent);
```
`colors` 등을 import하지 않던 파일은 `import { colors } from "@/styles/colors";`를 추가한다.

- [ ] **Step 2: 잔여 리터럴 0 확인**

Run: `cd client && grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/shared/ui src/layouts src/App.styles.tsx --include='*.tsx' | grep -v __tests__ | grep -vE "rgba\(0, ?0, ?0,"`
Expected: 출력 없음(그림자용 `rgba(0, 0, 0, …)`은 마지막 필터로 제외됨. macOS grep은 `-P`가 없어 룩어헤드 대신 필터를 쓴다)

- [ ] **Step 3: 테스트·타입체크**

Run: `cd client && npx tsc -b && npx vitest run src/shared src/layouts`
Expected: PASS

- [ ] **Step 4: 다크 강제 육안 확인**

`npm run dev` → 콘솔에서 `document.documentElement.dataset.theme="dark"` → 헤더·SNB·모바일 드로어(창 폭 480px 이하)·토스트(할 일 완료 토글로 발생)·확인 모달(삭제 버튼)·바텀시트에 흰 면이 남지 않았는지 본다. 남은 곳이 있으면 Step 1로 돌아간다.

- [ ] **Step 5: 커밋**

```bash
git add client/src/shared client/src/layouts client/src/App.styles.tsx
git commit -m "refactor(theme): shared/ui·레이아웃 하드코딩 색을 토큰으로 치환

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(표에 없던 값이 있었다면 본문에 `미매핑: …` 줄을 추가한다.)

---

### Task 5: 리터럴 치환 — todo 기능

**Files (Modify):**
`client/src/features/todo/components/todoDetail/{todoDetail.styles.tsx,descriptionLinkAction.styles.tsx}`, `todoListItem/{todoListItem.styles.tsx,statusSelect.styles.tsx}`, `todoSearch.styles.tsx`, `projectCard.styles.tsx`, `dueTodo.tsx`, `todoForm/todoForm.styles.tsx`, `todoList.styles.tsx`, `recurrence/recurrence.styles.tsx`

**Interfaces:**
- Consumes: `colors`, `urgencyColors` (Task 3)

- [ ] **Step 1: 치환**

Run: `cd client && grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|\bwhite\b" src/features/todo --include='*.tsx' | grep -v __tests__ | grep -v white-space`
매핑표대로 치환한다. 마감 3단계 색(`dueTodo.tsx:85`, `todoListItem.styles.tsx:119`)은 다음과 같이 바꾼다.
```ts
color: ${({ $daysLeft }) =>
  $daysLeft < 0 ? colors.danger.main : $daysLeft === 0 ? urgencyColors.soon.main : urgencyColors.soon.text};
```

- [ ] **Step 2: 잔여 0 확인**

Run: `cd client && grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/features/todo --include='*.tsx' | grep -v __tests__ | grep -vE "rgba\(0, ?0, ?0,"`
Expected: 출력 없음

- [ ] **Step 3: 테스트**

Run: `cd client && npx tsc -b && npx vitest run src/features/todo`
Expected: PASS

- [ ] **Step 4: 다크 강제 육안 확인** — `/todo`에서 프로젝트 카드, 하위 할 일, 상태 선택 드롭다운, 검색, 할 일 추가/수정 폼(반복 설정 포함), 상세 패널, 설명 링크 액션을 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo
git commit -m "refactor(theme): todo 기능 하드코딩 색을 토큰으로 치환

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 리터럴 치환 — today · kanban · dashboard(FullCalendar) · insights(SVG)

**Files (Modify):**
`client/src/features/today/{pages/todayPage.styles.tsx,components/weekStrip.styles.tsx,components/todayTodoItem.styles.tsx,components/todayTodoItem.tsx,components/periodBadge.styles.tsx}`, `client/src/features/kanban/components/{kanbanBoard.styles.tsx,kanbanCardMenu.styles.tsx}`, `client/src/features/dashboard/components/{calendar.styles.tsx,calendar.tsx}`, `client/src/features/insights/components/{insightsFilterBar.styles.tsx,charts/barChart.tsx,charts/horizontalBars.tsx,charts/stackedBar.tsx}`
- Test: `client/src/features/insights/components/charts/__tests__/svgColorStyle.test.tsx`

**Interfaces:**
- Consumes: `colors`, `statusColors` (Task 3)

- [ ] **Step 1: SVG 실패 테스트 작성**

`client/src/features/insights/components/charts/__tests__/svgColorStyle.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BarChart, HorizontalBars, StackedBar } from "..";

/**
 * fill/stroke에 var(--…)를 프레젠테이션 속성으로 주면 일부 브라우저가 무시해 검게 그린다.
 * 색은 반드시 style로 전달돼야 한다.
 */
const assertNoVarAttributes = (container: HTMLElement) => {
  for (const el of container.querySelectorAll("svg *")) {
    for (const attr of ["fill", "stroke"]) {
      expect(el.getAttribute(attr) ?? "").not.toMatch(/var\(/);
    }
  }
};

describe("차트 색 전달", () => {
  it("BarChart", () => {
    const { container } = render(
      <BarChart buckets={[{ label: "월", value: 3 }, { label: "화", value: 1 }]} width={300} ariaLabel="t" />,
    );
    assertNoVarAttributes(container);
  });
  it("HorizontalBars", () => {
    const { container } = render(
      <HorizontalBars rows={[{ label: "높음", value: 2 }]} width={300} ariaLabel="t" />,
    );
    assertNoVarAttributes(container);
  });
  it("StackedBar", () => {
    const { container } = render(
      <StackedBar
        segments={[{ key: "done", label: "완료", value: 1 }]}
        colorOf={() => "var(--status-done-main)"}
        width={300}
        ariaLabel="t"
      />,
    );
    assertNoVarAttributes(container);
    expect(container.querySelector("rect[style]")?.getAttribute("style")).toContain("var(--status-done-main)");
  });
});
```
> 실행 전에 `charts/index.ts` export 이름과 각 컴포넌트의 실제 props 이름을 확인하고(기존 `__tests__/barChart.test.tsx` 등 참고), 이 테스트의 props를 그 이름에 맞춘다. 단정문 자체는 바꾸지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/features/insights/components/charts/__tests__/svgColorStyle.test.tsx`
Expected: FAIL — `fill` 속성에 `var(--…)` 존재

- [ ] **Step 3: SVG 색을 style로 전환**

세 차트 파일의 `fill={X}` → `style={{ fill: X }}`, `stroke={X}` → `style={{ stroke: X }}`로 바꾼다(9곳). 예:
```tsx
<rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={3} style={{ fill: colors.brand.strong }}>
```
`stackedBar.test.tsx:10`의 `colorOf`는 hex 대신 `"var(--status-done-main)"`/`"var(--status-todo-main)"`를 반환하도록 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/features/insights`
Expected: PASS

- [ ] **Step 5: FullCalendar 변수 연결 + 나머지 치환**

`calendar.styles.tsx`의 FC 래퍼 styled 컴포넌트 최상단에 추가:
```ts
  --fc-page-bg-color: ${colors.surface.raised};
  --fc-neutral-bg-color: ${colors.background.secondary};
  --fc-border-color: ${colors.border.tertiary};
  --fc-today-bg-color: ${colors.brand.tint};
  --fc-list-event-hover-bg-color: ${colors.background.secondary};
  --fc-neutral-text-color: ${colors.text.secondary};
  --fc-button-text-color: ${colors.brand.onStrong};
  --fc-button-bg-color: ${colors.brand.strong};
  --fc-button-border-color: ${colors.brand.strong};
  --fc-button-hover-bg-color: ${colors.brand.strongHover};
  --fc-button-hover-border-color: ${colors.brand.strongHover};
  --fc-button-active-bg-color: ${colors.brand.strongHover};
  --fc-button-active-border-color: ${colors.brand.strongHover};
```
그 다음 today/kanban/dashboard/insights 나머지 리터럴을 매핑표대로 치환한다. 치환 대상 목록은 `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|\bwhite\b" src/features/{today,kanban,dashboard,insights} --include='*.tsx' | grep -v __tests__ | grep -v white-space`로 얻는다.

- [ ] **Step 6: 잔여 0 + 테스트**

Run: `cd client && grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/features/{today,kanban,dashboard,insights} --include='*.tsx' | grep -v __tests__ | grep -vE "rgba\(0, ?0, ?0,"; npx tsc -b && npx vitest run src/features/today src/features/kanban src/features/dashboard src/features/insights`
Expected: grep 출력 없음, 테스트 PASS

- [ ] **Step 7: 다크 강제 육안 확인** — `/today`(주간 스트립·기간 배지), `/kanban`(카드 메뉴 포함), `/calendar`(월 뷰·"+N개" 바텀시트·오늘 칸 강조·이벤트 색), `/insights`(필터 바의 네이티브 select·세 차트)를 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add client/src/features/today client/src/features/kanban client/src/features/dashboard client/src/features/insights
git commit -m "refactor(theme): today·kanban·캘린더·통계 색 토큰화, SVG 색은 style로 전달

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 리터럴 치환 — 나머지 기능

**Files (Modify):**
`client/src/features/auth/pages/{loginPage.styles.tsx,loginPage.tsx}`, `client/src/features/landing/components/{featureCard.styles.tsx,ctaButtons.styles.tsx}`, `client/src/features/guest/components/{guestHeader.styles.tsx,guestBanner.styles.tsx,guestAddTodoInput.styles.tsx}`, `client/src/features/feedback/components/feedbackForm.styles.tsx`, `client/src/features/entitlement/components/premiumLockedNotice.styles.tsx`, `client/src/features/calendarIntegration/components/calendarConnectionButton.styles.tsx`

- [ ] **Step 1: 치환**

Run: `cd client && grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|\bwhite\b" src/features/{auth,landing,guest,feedback,entitlement,calendarIntegration} --include='*.tsx' | grep -v __tests__ | grep -v white-space`
매핑표대로 치환한다. `loginPage.tsx`의 Google 로고 SVG 색은 유지하고 각 줄 위에 `// eslint-disable-next-line no-restricted-syntax -- Google 브랜드 로고 고정색`을 단다(JSX 속성이면 `{/* eslint-disable-next-line no-restricted-syntax -- … */}`).

- [ ] **Step 2: 잔여 확인** — Task 6 Step 6의 grep을 이 경로들에 적용한다. 출력은 Google 로고 줄만 있어야 한다.

- [ ] **Step 3: 테스트**

Run: `cd client && npx tsc -b && npm test`
Expected: 전체 PASS

- [ ] **Step 4: 다크 강제 육안 확인** — 로그아웃 상태에서 `/`(랜딩), `/login`, 게스트 모드 화면. 로그인 상태에서 의견 보내기 폼, 프리미엄 잠금 안내(`/insights`, 비프리미엄 계정), 캘린더 연동 버튼.

- [ ] **Step 5: 커밋**

```bash
git add client/src/features
git commit -m "refactor(theme): 인증·랜딩·게스트·피드백·프리미엄·캘린더연동 색 토큰화

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 하드코딩 색 재발 방지 ESLint 규칙

**Files:**
- Modify: `client/eslint.config.js`
- Test: `client/src/styles/__tests__/noHardcodedColorRule.test.ts`

**Interfaces:**
- Produces: ESLint `no-restricted-syntax` 규칙(메시지 `하드코딩 색 금지 — @/styles의 토큰을 쓰세요`)

- [ ] **Step 1: 실패 테스트 작성**

`client/src/styles/__tests__/noHardcodedColorRule.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";

const eslint = new ESLint({ cwd: path.resolve(__dirname, "../../..") });
const lint = async (code: string, file = "src/features/x/probe.tsx") => {
  const [result] = await eslint.lintText(code, { filePath: path.resolve(__dirname, "../../..", file) });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax").length;
};

describe("하드코딩 색 규칙", () => {
  it("문자열 hex를 막는다", async () => {
    expect(await lint(`export const a = "#1a1a1a";`)).toBe(1);
  });
  it("템플릿 리터럴(styled) 안 hex와 브랜드 rgba를 막는다", async () => {
    expect(await lint("export const a = `color: #fff; background: rgba(15, 110, 86, 0.1);`;")).toBe(1);
  });
  it("그림자용 검정 rgba는 허용한다", async () => {
    expect(await lint("export const a = `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);`;")).toBe(0);
  });
  it("토큰 참조는 허용한다", async () => {
    expect(await lint("export const a = `color: ${'var(--text-primary)'};`;")).toBe(0);
  });
  it("styles 폴더와 테스트 파일은 예외다", async () => {
    expect(await lint(`export const a = "#1a1a1a";`, "src/styles/probe.ts")).toBe(0);
    expect(await lint(`export const a = "#1a1a1a";`, "src/features/x/__tests__/probe.test.ts")).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/styles/__tests__/noHardcodedColorRule.test.ts`
Expected: FAIL — 처음 두 케이스가 0

- [ ] **Step 3: 규칙 추가**

`client/eslint.config.js`의 `tseslint.config([...])` 배열 끝에 추가:
```js
  {
    // 하드코딩 색은 다크모드에서 바뀌지 않는다. 그림자용 rgba(0,0,0,a)만 허용.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/styles/**', 'src/**/__tests__/**', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b|rgba?\\((?!\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,)/]',
          message: '하드코딩 색 금지 — @/styles의 토큰을 쓰세요',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b|rgba?\\((?!\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,)/]',
          message: '하드코딩 색 금지 — @/styles의 토큰을 쓰세요',
        },
      ],
    },
  },
```

- [ ] **Step 4: 통과 확인 + 전체 lint**

Run: `cd client && npx vitest run src/styles/__tests__/noHardcodedColorRule.test.ts && npm run lint`
Expected: 테스트 PASS. lint 에러 0. lint 에러가 나면 Task 4–7에서 놓친 리터럴이다. 매핑표대로 고친다. `#id` 앵커처럼 색이 아닌 오탐은 `// eslint-disable-next-line no-restricted-syntax -- 색 아님(앵커)`로 처리한다.

- [ ] **Step 5: 전체 검증**

Run: `cd client && npx tsc -b && npm run build && npm run check:bundle && npm test`
Expected: 전부 성공

- [ ] **Step 6: 커밋 + 마일스톤 B PR**

```bash
git add client/eslint.config.js client/src
git commit -m "chore(theme): 하드코딩 색 재발 방지 ESLint 규칙 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
`feat/dark-mode-web-infra`를 push하고 develop 대상 PR을 연다(마일스톤 A가 아직 머지 전이면 base를 `feat/dark-mode`로). PR 본문에 "사용자 체감: 라이트 회색 미세 조정, 토스트 info가 파랑→중립 회색, 다크는 아직 노출 안 됨"을 명시한다. 마일스톤 C는 이 브랜치에서 `feat/dark-mode-toggle`을 만들어 이어간다.

---

## Milestone C — 테마 선택 활성화 (PR 3, 다크모드 출시)

### Task 9: ThemePreferenceProvider

**Files:**
- Create: `client/src/shared/theme/themePreference.tsx`
- Create: `client/src/shared/theme/useThemePreference.ts`
- Modify: `client/src/main.tsx`
- Test: `client/src/shared/theme/__tests__/themePreference.test.tsx`

**Interfaces:**
- Consumes: `THEME_STORAGE_KEY`, `parsePreference`, `resolveScheme`, `ThemePreference`, `ThemeScheme`, `lightTokens`, `darkTokens` (core)
- Produces:
  - `ThemePreferenceProvider: FC<{ children: ReactNode }>`
  - `useThemePreference(): { preference: ThemePreference; scheme: ThemeScheme; setPreference(p: ThemePreference): void }` (Provider 밖에서 호출하면 throw)
  - 부수효과: `document.documentElement.dataset.theme = scheme`, `<meta name="theme-color">` content = 해당 scheme의 `background.primary`

- [ ] **Step 1: 실패 테스트 작성**

`client/src/shared/theme/__tests__/themePreference.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemePreferenceProvider } from "../themePreference";
import { useThemePreference } from "../useThemePreference";

let osDark = false;
let listeners: Array<(e: { matches: boolean }) => void> = [];
const setOsDark = (v: boolean) => {
  osDark = v;
  listeners.forEach((l) => l({ matches: v }));
};

beforeEach(() => {
  osDark = false;
  listeners = [];
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.appendChild(meta);
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() { return osDark; },
    media: query,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => {
      listeners = listeners.filter((x) => x !== l);
    },
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const Probe = () => {
  const { preference, scheme, setPreference } = useThemePreference();
  return (
    <>
      <span data-testid="pref">{preference}</span>
      <span data-testid="scheme">{scheme}</span>
      <button onClick={() => setPreference("dark")}>dark</button>
      <button onClick={() => setPreference("system")}>system</button>
    </>
  );
};
const renderProbe = () => render(<ThemePreferenceProvider><Probe /></ThemePreferenceProvider>);
const themeAttr = () => document.documentElement.dataset.theme;
const metaColor = () => document.head.querySelector('meta[name="theme-color"]')?.getAttribute("content");

describe("ThemePreferenceProvider", () => {
  it("저장값이 없으면 system이고 OS를 따른다", () => {
    osDark = true;
    renderProbe();
    expect(screen.getByTestId("pref")).toHaveTextContent("system");
    expect(themeAttr()).toBe("dark");
    expect(metaColor()).toBe("#121212");
  });

  it("저장된 선택값을 읽는다", () => {
    window.localStorage.setItem("tododo:theme", "dark");
    renderProbe();
    expect(screen.getByTestId("scheme")).toHaveTextContent("dark");
  });

  it("잘못된 저장값은 system", () => {
    window.localStorage.setItem("tododo:theme", "purple");
    renderProbe();
    expect(screen.getByTestId("pref")).toHaveTextContent("system");
  });

  it("localStorage가 throw해도 system으로 동작하고 선택도 된다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    renderProbe();
    expect(screen.getByTestId("pref")).toHaveTextContent("system");
    await userEvent.click(screen.getByText("dark"));
    expect(themeAttr()).toBe("dark");
  });

  it("setPreference는 저장하고 data-theme·meta를 즉시 갱신한다", async () => {
    renderProbe();
    await userEvent.click(screen.getByText("dark"));
    expect(window.localStorage.getItem("tododo:theme")).toBe("dark");
    expect(themeAttr()).toBe("dark");
    expect(metaColor()).toBe("#121212");
  });

  it("system일 때 OS 전환을 즉시 반영한다", () => {
    renderProbe();
    expect(themeAttr()).toBe("light");
    act(() => setOsDark(true));
    expect(themeAttr()).toBe("dark");
    expect(screen.getByTestId("scheme")).toHaveTextContent("dark");
  });

  it("light/dark를 고른 뒤에는 OS 전환을 무시한다", async () => {
    renderProbe();
    await userEvent.click(screen.getByText("dark"));
    act(() => setOsDark(false));
    expect(themeAttr()).toBe("dark");
  });

  it("matchMedia가 없는 환경에서도 라이트로 렌더된다", () => {
    vi.stubGlobal("matchMedia", undefined);
    renderProbe();
    expect(themeAttr()).toBe("light");
  });

  it("Provider 밖에서 훅을 쓰면 throw", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/shared/theme`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`client/src/shared/theme/themePreference.tsx`:
```tsx
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  THEME_STORAGE_KEY, parsePreference, resolveScheme, themes,
  type ThemePreference, type ThemeScheme,
} from "@tododo/core";

export interface ThemePreferenceValue {
  preference: ThemePreference;
  scheme: ThemeScheme;
  setPreference: (p: ThemePreference) => void;
}

export const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

// 프라이빗 모드·쿠키 차단에서 localStorage 접근 자체가 throw할 수 있다.
const readStored = (): ThemePreference => {
  try {
    return parsePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
};
const writeStored = (p: ThemePreference) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, p);
  } catch {
    // 저장 실패 시 이번 세션에서만 유지된다.
  }
};
const mediaQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;

const applyScheme = (scheme: ThemeScheme) => {
  document.documentElement.dataset.theme = scheme;
  document.head
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themes[scheme].background.primary);
};

export const ThemePreferenceProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored);
  const [osDark, setOsDark] = useState<boolean>(() => mediaQuery()?.matches ?? false);

  useEffect(() => {
    const mq = mediaQuery();
    if (!mq) return;
    const onChange = (e: { matches: boolean }) => setOsDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const scheme = resolveScheme(preference, osDark);

  useEffect(() => {
    applyScheme(scheme);
  }, [scheme]);

  const setPreference = useCallback((p: ThemePreference) => {
    writeStored(p);
    setPreferenceState(p);
  }, []);

  const value = useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme, setPreference]);
  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
};
```

`client/src/shared/theme/useThemePreference.ts`:
```ts
import { useContext } from "react";
import { ThemePreferenceContext, type ThemePreferenceValue } from "./themePreference";

export const useThemePreference = (): ThemePreferenceValue => {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error("useThemePreference는 ThemePreferenceProvider 안에서만 쓸 수 있습니다");
  return ctx;
};
```

`client/src/main.tsx`에서 import하고 `<ErrorBoundary>` 바로 안쪽을 감싼다(랜딩·로그인 포함 전 화면 적용).
```tsx
import { ThemePreferenceProvider } from "@/shared/theme/themePreference";
// ...
    <ErrorBoundary>
      <ThemePreferenceProvider>
        <QueryClientProvider client={queryClient}>
          {/* 기존 내용 그대로 */}
        </QueryClientProvider>
      </ThemePreferenceProvider>
    </ErrorBoundary>
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/shared/theme && npx tsc -b`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add client/src/shared/theme client/src/main.tsx
git commit -m "feat(theme): 시스템/라이트/다크 선택을 관리하는 ThemePreferenceProvider 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 첫 페인트 전 인라인 스크립트

**Files:**
- Modify: `client/index.html`
- Test: `client/src/shared/theme/__tests__/inlineThemeScript.test.ts`

**Interfaces:**
- Consumes: `resolveScheme`, `lightTokens`, `darkTokens` (core) — 테스트에서 파리티 기준으로만 사용

- [ ] **Step 1: 실패 테스트 작성**

`client/src/shared/theme/__tests__/inlineThemeScript.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveScheme, themes } from "@tododo/core";

const html = readFileSync(path.resolve(__dirname, "../../../../index.html"), "utf8");
const script = html.match(/<script data-theme-init>([\s\S]*?)<\/script>/)?.[1];

const run = (stored: string | null | "throw", osDark: boolean) => {
  document.documentElement.removeAttribute("data-theme");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    if (stored === "throw") throw new Error("blocked");
    return stored;
  });
  vi.stubGlobal("matchMedia", () => ({ matches: osDark }));
  new Function(script!)();
  return document.documentElement.dataset.theme;
};

beforeEach(() => {
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.appendChild(meta);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("index.html 테마 초기화 스크립트", () => {
  it("head 안, 모듈 스크립트보다 앞에 있다", () => {
    expect(script).toBeTruthy();
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toContain("data-theme-init");
    expect(html.indexOf("data-theme-init")).toBeLessThan(html.indexOf('type="module"'));
  });

  it.each([
    ["system", false], ["system", true], ["light", false],
    ["light", true], ["dark", false], ["dark", true],
  ] as const)("stored=%s osDark=%s → resolveScheme과 같은 결과", (stored, osDark) => {
    expect(run(stored, osDark)).toBe(resolveScheme(stored, osDark));
  });

  it("저장값 없음·잘못된 값·접근 throw는 system으로 판정", () => {
    expect(run(null, true)).toBe("dark");
    expect(run("purple", false)).toBe("light");
    expect(run("throw", true)).toBe("dark");
  });

  it("theme-color meta를 scheme 바탕색으로 맞춘다", () => {
    run("dark", false);
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute("content"))
      .toBe(themes.dark.background.primary);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/shared/theme/__tests__/inlineThemeScript.test.ts`
Expected: FAIL — `script`가 undefined

- [ ] **Step 3: index.html 수정**

`<meta name="viewport" …>` 다음 줄에 추가:
```html
    <meta name="theme-color" content="#FFFFFF" />
    <!-- 첫 페인트 전에 data-theme을 정해 새로고침 시 흰 화면 번쩍임을 막는다.
         판정 규칙은 packages/core/src/theme/resolveScheme.ts와 같아야 한다(파리티 테스트:
         src/shared/theme/__tests__/inlineThemeScript.test.ts). 바탕색도 core 팔레트 값과 같다. -->
    <script data-theme-init>
      (function () {
        var pref = "system";
        try {
          var v = localStorage.getItem("tododo:theme");
          if (v === "light" || v === "dark" || v === "system") pref = v;
        } catch (e) {}
        var dark = pref === "dark" ||
          (pref === "system" && !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
        var scheme = dark ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", scheme);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", dark ? "#121212" : "#FFFFFF");
      })();
    </script>
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/shared/theme`
Expected: PASS

- [ ] **Step 5: 새로고침 번쩍임 수동 확인**

`npm run build && npm run preview` → 브라우저 콘솔에서 `localStorage.setItem("tododo:theme","dark")` → 새로고침을 여러 번 한다. 흰 화면이 한 프레임도 보이지 않아야 한다(DevTools Performance 탭 스크린샷 스트립으로 확인). 확인 후 `localStorage.removeItem("tododo:theme")`.

- [ ] **Step 6: 커밋**

```bash
git add client/index.html client/src/shared/theme/__tests__/inlineThemeScript.test.ts
git commit -m "feat(theme): 첫 페인트 전 테마 결정 인라인 스크립트 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 헤더 ThemeMenu

**Files:**
- Create: `client/src/layouts/themeMenu/themeMenu.tsx`
- Create: `client/src/layouts/themeMenu/themeMenu.styles.tsx`
- Modify: `client/src/layouts/header/header.tsx`
- Modify: `client/src/layouts/mobileHeader/mobileHeader.tsx`
- Modify: `client/src/layouts/mobileHeader/mobileHeader.styles.tsx`
- Test: `client/src/layouts/themeMenu/__tests__/themeMenu.test.tsx`

**Interfaces:**
- Consumes: `useThemePreference()` (Task 9), `colors`, `radius`
- Produces: `ThemeMenu` default export (props 없음)

- [ ] **Step 1: 실패 테스트 작성**

`client/src/layouts/themeMenu/__tests__/themeMenu.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemePreferenceProvider } from "@/shared/theme/themePreference";
import ThemeMenu from "../themeMenu";

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => vi.unstubAllGlobals());

const setup = () =>
  render(
    <ThemePreferenceProvider>
      <ThemeMenu />
      <button>outside</button>
    </ThemePreferenceProvider>,
  );
const trigger = () => screen.getByRole("button", { name: /화면 테마/ });

describe("ThemeMenu", () => {
  it("현재 선택을 라벨에 담고, 처음엔 닫혀 있다", () => {
    setup();
    expect(trigger()).toHaveAccessibleName("화면 테마: 시스템");
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("열면 3항목이 있고 현재 항목만 checked", async () => {
    setup();
    await userEvent.click(trigger());
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["라이트", "시스템", "다크"]);
    expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
  });

  it("항목을 고르면 적용되고 닫히며 포커스가 트리거로 돌아간다", async () => {
    setup();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitemradio", { name: "다크" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAccessibleName("화면 테마: 다크");
  });

  it("열면 현재 항목에 포커스, ↑↓로 순환 이동, Enter로 선택", async () => {
    setup();
    await userEvent.click(trigger());
    expect(screen.getByRole("menuitemradio", { name: "시스템" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "다크" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "라이트" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitemradio", { name: "다크" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("Esc로 닫히고 포커스가 트리거로 돌아간다", async () => {
    setup();
    await userEvent.click(trigger());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("바깥 클릭으로 닫히고 선택은 바뀌지 않는다", async () => {
    setup();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveAccessibleName("화면 테마: 시스템");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run src/layouts/themeMenu`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`client/src/layouts/themeMenu/themeMenu.styles.tsx`:
```tsx
import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

export const Wrapper = styled.div`
  position: relative;
`;

export const Trigger = styled.button`
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid ${colors.border.tertiary};
  border-radius: ${radius.md};
  color: ${colors.text.secondary};
  cursor: pointer;

  &:hover {
    background-color: ${colors.background.secondary};
    color: ${colors.text.primary};
  }
  &:focus-visible {
    outline: 2px solid ${colors.brand.strong};
    outline-offset: 2px;
  }
`;

export const Menu = styled.ul`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
  min-width: 140px;
  padding: 4px;
  list-style: none;
  background-color: ${colors.surface.overlay};
  border: 1px solid ${colors.border.secondary};
  border-radius: ${radius.md};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
`;

export const Item = styled.li<{ $checked: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: ${radius.sm};
  font-size: 14px;
  cursor: pointer;
  color: ${({ $checked }) => ($checked ? colors.brand.strong : colors.text.primary)};
  background-color: ${({ $checked }) => ($checked ? colors.brand.tint : "transparent")};
  font-weight: ${({ $checked }) => ($checked ? 600 : 400)};

  &:hover,
  &:focus-visible {
    outline: none;
    background-color: ${({ $checked }) => ($checked ? colors.brand.tint : colors.background.secondary)};
  }
`;
```
> `radius.sm`/`radius.md`가 `client/src/styles/radius.ts`에 없으면 실제로 있는 키 중 가장 가까운 값을 쓴다.

`client/src/layouts/themeMenu/themeMenu.tsx`:
```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import type { ThemePreference } from "@tododo/core";
import { useThemePreference } from "@/shared/theme/useThemePreference";
import { Wrapper, Trigger, Menu, Item } from "./themeMenu.styles";

const OPTIONS: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "라이트", Icon: Sun },
  { value: "system", label: "시스템", Icon: Monitor },
  { value: "dark", label: "다크", Icon: Moon },
];

const ThemeMenu = () => {
  const { preference, setPreference } = useThemePreference();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[1];

  const close = (restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    itemRefs.current[OPTIONS.indexOf(current)]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // current는 열리는 순간의 값만 필요하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const choose = (value: ThemePreference) => {
    setPreference(value);
    close(true);
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const index = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      itemRefs.current[(index + delta + OPTIONS.length) % OPTIONS.length]?.focus();
    } else if ((e.key === "Enter" || e.key === " ") && index >= 0) {
      e.preventDefault();
      choose(OPTIONS[index].value);
    }
  };

  return (
    <Wrapper ref={wrapperRef}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label={`화면 테마: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        <current.Icon size={18} aria-hidden="true" />
      </Trigger>
      {isOpen && (
        <Menu role="menu" aria-label="화면 테마" onKeyDown={onMenuKeyDown}>
          {OPTIONS.map(({ value, label, Icon }, i) => (
            <Item
              key={value}
              ref={(el) => { itemRefs.current[i] = el; }}
              role="menuitemradio"
              aria-checked={value === preference}
              tabIndex={-1}
              $checked={value === preference}
              onClick={() => choose(value)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Item>
          ))}
        </Menu>
      )}
    </Wrapper>
  );
};

export default ThemeMenu;
```
> 테스트의 `menuitemradio` 이름은 텍스트 "라이트/시스템/다크"로 계산된다(아이콘은 `aria-hidden`).

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run src/layouts/themeMenu`
Expected: PASS

- [ ] **Step 5: 헤더에 배치**

`header.tsx`: `import ThemeMenu from "@/layouts/themeMenu/themeMenu";`를 추가한다. 로고 오른쪽의 `<UserInfo>`와 `<HamburgerMenuButton>`을 새 `RightGroup`으로 감싸고, 맨 앞에 `<ThemeMenu />`를 둔다. 이렇게 하면 태블릿 폭에서 UserInfo가 숨겨져도 ThemeMenu는 보인다.
```tsx
      <RightGroup>
        <ThemeMenu />
        <UserInfo>…기존…</UserInfo>
        <HamburgerMenuButton …>…</HamburgerMenuButton>
      </RightGroup>
// ...
const RightGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;
```
`mobileHeader.tsx`: `<AvatarButton>`을 `RightGroup`(styles 파일에 같은 정의 추가, gap 4px)으로 감싸고 앞에 `<ThemeMenu />`를 둔다.

- [ ] **Step 6: 레이아웃 테스트 회귀 확인**

Run: `cd client && npx vitest run src/layouts src/App && npx tsc -b`
Expected: PASS. Header/MobileHeader를 렌더하는 기존 테스트가 "useThemePreference는 Provider 안에서만…" 에러로 깨지면, 그 테스트의 render wrapper에 `ThemePreferenceProvider`를 추가한다. 이때 테스트 단정문은 수정하지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add client/src/layouts
git commit -m "feat(theme): 헤더 우측 화면 테마 선택 메뉴(시스템/라이트/다크) 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 전체 검증과 마일스톤 C PR

**Files:** 없음(검증). 발견한 잔여 흰 조각은 해당 파일에서 매핑표대로 고치고 `fix(theme): …`로 커밋한다.

- [ ] **Step 1: 전체 정적 검증**

Run: `cd client && npm run lint && npx tsc -b && npm run build && npm run check:bundle && npm test && TZ=America/New_York npm test`
Run: `cd packages/core && npm test && npm run build && git status --short dist` (dist 변경분이 없어야 함 = 커밋된 dist가 최신)
Expected: 전부 성공

- [ ] **Step 2: 라이트/다크 스크린샷 검증 (로그인 상태)**

`cd client && npm run dev`로 띄우고 실제 계정으로 로그인한다. Playwright(또는 claude-in-chrome)로 다음 화면을 **light/dark 각각** 1440px, 390px 폭에서 스크린샷하고 흰 조각(다크에서 `#FFFFFF`에 가까운 면)이 없는지 본다.
`/today`, `/todo`(프로젝트 펼침 + 상세 패널), `/calendar`(월 뷰 + "+N개" 바텀시트), `/kanban`(카드 메뉴 열림), `/insights`(필터 select 열림), 할 일 추가 모달, 삭제 확인 모달, 토스트, 모바일 드로어, ThemeMenu 드롭다운.
로그아웃 상태: `/`, `/login`, 게스트 화면.

- [ ] **Step 3: 시스템 추종 확인**

preference가 "시스템"인 상태에서 OS 다크모드를 켜고 끈다(macOS: 시스템 설정 → 화면 모드). 새로고침 없이 즉시 바뀌어야 한다. "라이트"를 고른 뒤 OS를 다크로 바꿔도 라이트가 유지돼야 한다.

- [ ] **Step 4: PR**

`feat/dark-mode-toggle`을 push하고 develop 대상 PR을 연다(이전 PR이 머지 전이면 base를 `feat/dark-mode-web-infra`로). PR 본문에는 다음을 넣는다.
- 스크린샷: light/dark × 오늘/캘린더/통계
- 사용자 체감: 헤더 우측 테마 메뉴, 기본값은 시스템
- 알려진 이슈: light `danger.text`/`danger.background` 대비 4.47:1(기존부터, 범위 밖)
- 후속: 모바일(RN) 다크모드 — spec §3
