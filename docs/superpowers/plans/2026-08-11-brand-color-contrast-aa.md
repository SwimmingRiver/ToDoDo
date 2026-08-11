# 브랜드 컬러 대비 AA 확보 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `colors.brand`를 역할 기반 토큰(`strong`/`strongHover`/`fill`/`tint`)으로 재정의하고, 32개 파일 150개 참조를 용도에 맞게 옮겨 WCAG AA 대비 위반을 없앤다.

**Architecture:** 신규 토큰을 기존 토큰 **옆에 먼저 추가**해서 모든 중간 상태가 컴파일되게 한다. 그다음 디렉토리 단위로 참조를 옮기고, 마지막에 구 토큰을 삭제한다. 구 토큰 삭제 시 `tsc`가 남은 참조를 전부 열거해 주므로 **컴파일러가 누락 검사기 역할**을 한다.

**Tech Stack:** TypeScript, styled-components v6, Vitest, ESLint

**스펙:** `docs/superpowers/specs/2026-08-11-brand-color-contrast-aa-design.md`

## Global Constraints

- 토큰 값은 정확히 이것들이다. 임의로 조정하지 않는다.
  - `strong: "#0F6E56"` / `strongHover: "#0A4E3C"` / `fill: "#1D9E75"` / `tint: "#E8F5EF"`
- 모든 명령은 `client/` 디렉토리에서 실행한다.
- 파일명 컨벤션은 `camelCase.tsx`다.
- `server/`와 `docker-compose.yml`은 건드리지 않는다.
- `statusColors.ts`의 `#1D9E75`는 **스코프 밖**이다. 별도 색 체계다.
- 연한 초록 7종(`#E0EDE8`, `#D5EDE4`, `#D9ECE4`, `#F0FBF7`, `#D1F5E8` 등) 통합은 **스코프 밖**이다. 단 `#E8F4F1`와 `#e8f0fe`는 예외로 이번에 흡수한다(각각 토큰과 사실상 같은 값이거나, 브랜드와 무관한 파란색이라).
- 토스트의 `#4CAF50`/`#E8F5E9`, 로그인의 `#34A853`은 브랜드색이 아니므로 건드리지 않는다.

## 변환 규칙 (전 태스크 공통)

**1단계 — 일괄 치환.** 해당 태스크의 파일들에서:

| 기존 | 변경 |
|---|---|
| `colors.brand.background` | `colors.brand.tint` |
| `colors.brand.secondary` | `colors.brand.strong` |
| `colors.brand.primary` | `colors.brand.strong` |

**2단계 — 예외 되돌리기.** 각 태스크에 나열된 `fill` / `strongHover` 대상만 다시 고친다.

- **`fill`로 가는 것** — 글자를 얹지 않는 장식. 전 코드베이스에 **8곳뿐**이다.
- **`strongHover`로 가는 것** — 솔리드 버튼·링크의 `&:hover` / `&:active` 블록. **11곳**이다.
- 나머지는 전부 `strong`이다. 테두리·밑줄·좌측 바가 옆 글자와 짝을 이루면 글자를 따라 `strong`으로 간다.

**3단계 — 하드코딩 흡수.** 각 태스크에 나열된 리터럴을 토큰으로 바꾼다.

---

## File Structure

**생성**
- `client/src/styles/__tests__/brandContrast.test.ts` — 토큰 값이 각 역할의 대비 기준을 만족하는지 검증

**수정**
- `client/src/styles/colors.ts` — 토큰 재정의 (Task 1에서 추가, Task 8에서 구 토큰 삭제)
- `colors.brand`를 참조하는 32개 파일 — Task 2~7에서 디렉토리별로
- `client/src/styles/statusColors.ts` — 주석만 (구 토큰 이름 언급)
- `client/src/styles/__tests__/statusColors.test.ts` — 주석만
- `CLAUDE.md` — "디자인 요소" 절

---

### Task 1: 토큰 추가 + 대비 테스트

신규 토큰을 기존 토큰과 **공존**시킨다. 이 태스크만으로는 화면이 전혀 바뀌지 않는다.

**Files:**
- Create: `client/src/styles/__tests__/brandContrast.test.ts`
- Modify: `client/src/styles/colors.ts`

**Interfaces:**
- Produces: `colors.brand.strong`, `colors.brand.strongHover`, `colors.brand.fill`, `colors.brand.tint` — Task 2~7이 전부 이 이름들을 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/styles/__tests__/brandContrast.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { colors } from "../colors";

/**
 * WCAG 2.1 상대 휘도. 색 계산 라이브러리를 들이는 대신 여기 직접 둔다 —
 * 테스트 전용이라 번들과 무관하고, 공식이 20줄이라 의존성이 과하다.
 */
const relativeLuminance = (hex: string): number => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (a: string, b: string): number => {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
};

const WHITE = "#FFFFFF";
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe("대비 계산 helper", () => {
  // 공식이 틀리면 아래 토큰 검증이 전부 무의미하게 통과할 수 있어 먼저 고정한다.
  it("검정과 흰색의 대비는 21:1이다", () => {
    expect(contrast("#000000", WHITE)).toBeCloseTo(21, 1);
  });

  it("같은 색끼리의 대비는 1:1이다", () => {
    expect(contrast(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it("인자 순서와 무관하게 같은 값을 낸다", () => {
    expect(contrast("#0F6E56", WHITE)).toBeCloseTo(contrast(WHITE, "#0F6E56"), 5);
  });
});

describe("brand 토큰 대비", () => {
  it("strong은 흰 배경 위 글자로 AA를 만족한다", () => {
    expect(contrast(colors.brand.strong, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("strong은 흰 글자를 얹는 배경으로도 AA를 만족한다", () => {
    // 대비는 대칭이라 위 검증과 같은 수식이지만, 솔리드 버튼이라는
    // 별개 용도를 명시적으로 고정해 둔다.
    expect(contrast(WHITE, colors.brand.strong)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("strong은 tint 배경 위에서도 AA를 만족한다", () => {
    expect(contrast(colors.brand.strong, colors.brand.tint)).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it("strongHover는 흰 배경·흰 글자 양쪽으로 AA를 만족한다", () => {
    expect(contrast(colors.brand.strongHover, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("strongHover는 strong과 눈에 띄게 구분된다", () => {
    // 1.2:1 미만이면 hover가 바뀐 걸 인지하기 어렵다.
    expect(
      contrast(colors.brand.strong, colors.brand.strongHover),
    ).toBeGreaterThanOrEqual(1.2);
  });

  it("fill은 흰 배경 위 비텍스트 기준(3:1)을 만족한다", () => {
    expect(contrast(colors.brand.fill, WHITE)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("fill은 글자색으로 쓸 수 없다", () => {
    // 이 테스트가 깨진다면 fill이 밝기를 잃은 것이다. 그렇다면 fill과 strong을
    // 나눌 이유 자체가 사라지므로 토큰 구조를 다시 봐야 한다.
    expect(contrast(colors.brand.fill, WHITE)).toBeLessThan(AA_TEXT);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npm run test -- brandContrast
```

Expected: FAIL. `colors.brand.strong` 등이 없어 타입 에러 또는 `undefined` 접근으로 실패한다.

- [ ] **Step 3: 토큰 추가**

`client/src/styles/colors.ts`의 `brand` 블록을 아래로 교체한다. **구 토큰 3개를 남겨둔다** — 아직 32개 파일이 참조 중이다.

```ts
  brand: {
    /**
     * 진한 브랜드색. 글자·아이콘, 흰 글자를 얹는 솔리드 배경, 포커스 신호에 쓴다.
     * 흰색과 6.20:1이라 어느 방향으로도 AA를 만족한다.
     */
    strong: "#0F6E56",
    /** strong을 쓴 요소의 hover / active. 흰색과 9.69:1. */
    strongHover: "#0A4E3C",
    /**
     * 밝은 브랜드색. **흰색 또는 회색 배경 위에, 글자를 얹지 않는** 장식에만 쓴다.
     * 흰색과 3.39:1이라 글자에 쓰면 AA 미달이고, 연한 초록 배경 위에 놓으면
     * 비텍스트 3:1마저 깨진다.
     */
    fill: "#1D9E75",
    /** 연한 배경. 반복 배지, 활성 내비, hover 배경. */
    tint: "#E8F5EF",

    // --- 아래 3개는 마이그레이션 중에만 존재한다. Task 8에서 삭제한다. ---
    primary: "#0F6E56",
    secondary: "#1D9E75",
    background: "#E8F5EF",
  },
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- brandContrast
```

Expected: PASS, 10개.

- [ ] **Step 5: 기존 테스트가 깨지지 않았는지 확인**

```bash
npm run test && npx tsc --noEmit && npm run lint
```

Expected: 유닛 425개 통과(기존 415 + 신규 10), 타입 에러 0, lint 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add client/src/styles/colors.ts client/src/styles/__tests__/brandContrast.test.ts
git commit -m "feat: 역할 기반 brand 토큰 추가 + 대비 검증 테스트

strong/strongHover/fill/tint를 기존 토큰 옆에 추가한다. 구 토큰은
32개 파일이 아직 참조 중이라 마이그레이션이 끝나는 시점에 뺀다.

대비 테스트는 WCAG 공식을 직접 구현했다. 공식 자체가 틀리면 토큰
검증이 무의미하게 통과하므로 검정-흰색 21:1을 먼저 고정한다."
```

---

### Task 2: `shared/ui` 마이그레이션

**Files:**
- Modify: `client/src/shared/ui/bottomSheet/bottomSheet.styles.tsx`
- Modify: `client/src/shared/ui/emptyState/emptyState.styles.tsx`
- Modify: `client/src/shared/ui/errorBoundary/errorBoundary.styles.tsx`
- Modify: `client/src/shared/ui/modal/modal.styles.tsx`
- Modify: `client/src/shared/ui/recurrenceBadge/recurrenceBadge.styles.tsx`
- Modify: `client/src/shared/ui/skeleton/checkboxSkeleton.styles.tsx`
- Modify: `client/src/shared/ui/skeleton/kanbanSkeleton.styles.tsx`

**Interfaces:**
- Consumes: Task 1의 `colors.brand.strong` / `strongHover` / `fill` / `tint`

- [ ] **Step 1: 일괄 치환**

```bash
cd client
grep -rl 'colors\.brand\.\(primary\|secondary\|background\)' src/shared/ui \
  | xargs sed -i '' \
    -e 's/colors\.brand\.background/colors.brand.tint/g' \
    -e 's/colors\.brand\.secondary/colors.brand.strong/g' \
    -e 's/colors\.brand\.primary/colors.brand.strong/g'
```

- [ ] **Step 2: `fill` 예외 2곳 되돌리기**

`checkboxSkeleton.styles.tsx`의 `CheckMark` — 스켈레톤 체크 표시 stroke:

```ts
    stroke: ${colors.brand.fill};
```

`kanbanSkeleton.styles.tsx`의 `CardCheckbox` — 스켈레톤 체크박스 배경:

```ts
  background-color: ${colors.brand.fill};
```

- [ ] **Step 3: `strongHover` 예외 2곳 되돌리기**

`errorBoundary.styles.tsx`의 `ReloadButton` `&:hover`:

```ts
  &:hover {
    background-color: ${colors.brand.strongHover};
  }
```

`emptyState.styles.tsx`의 `ActionButton` `&:hover`:

```ts
  &:hover {
    background-color: ${colors.brand.strongHover};
  }
```

- [ ] **Step 4: 하드코딩 흡수 — `bottomSheet.styles.tsx`의 `OptionItem`**

선택된 항목 배경이 `#e8f0fe`(파란색)다. 브랜드 tint로 바꾼다. `colors` import가 이미 있는지 확인하고 없으면 추가한다.

```ts
  background-color: ${({ $selected }) =>
    $selected ? colors.brand.tint : "transparent"};
```

- [ ] **Step 5: 구 토큰이 남지 않았는지 확인**

```bash
grep -rn 'colors\.brand\.\(primary\|secondary\|background\)\|#e8f0fe' src/shared/ui
```

Expected: 출력 없음.

- [ ] **Step 6: 검증**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

Expected: 전부 통과.

- [ ] **Step 7: 커밋**

```bash
git add client/src/shared/ui
git commit -m "refactor: shared/ui를 역할 기반 brand 토큰으로 이관

솔리드 버튼 2곳(ReloadButton, ActionButton)과 모달 제출 버튼이
흰 글자를 3.39:1로 얹고 있던 것을 strong으로 올린다.
bottomSheet 선택 항목의 #e8f0fe는 브랜드와 무관한 파란색이라
tint로 교체한다."
```

---

### Task 3: `layouts` 마이그레이션

하드코딩이 가장 많은 구역이다. 활성 내비게이션의 글자·배경·좌측 바가 서로 다른 리터럴로 흩어져 있다.

**Files:**
- Modify: `client/src/layouts/bottomTabBar/bottomTabBar.styles.tsx`
- Modify: `client/src/layouts/header/header.tsx`
- Modify: `client/src/layouts/mobileHeader/mobileHeader.styles.tsx`
- Modify: `client/src/layouts/snb/snb.tsx`
- Modify: `client/src/layouts/snb/mobileDrawer.styles.tsx`

- [ ] **Step 1: 일괄 치환**

```bash
cd client
grep -rl 'colors\.brand\.\(primary\|secondary\|background\)' src/layouts \
  | xargs sed -i '' \
    -e 's/colors\.brand\.background/colors.brand.tint/g' \
    -e 's/colors\.brand\.secondary/colors.brand.strong/g' \
    -e 's/colors\.brand\.primary/colors.brand.strong/g'
```

이 구역에는 `fill`·`strongHover` 예외가 없다. 전부 `strong`이다.

- [ ] **Step 2: `snb.tsx` 하드코딩 흡수**

세 군데다. `#E8F4F1`은 브랜드 tint(`#E8F5EF`)와 사실상 같은 값이고, `#1D9E75` 좌측 바는 바로 옆 글자가 `strong`이 되므로 함께 올린다.

접힌 상태의 활성 아이콘 래퍼:

```ts
  ${({ $isopen, $active }) =>
    !$isopen && $active
      ? `background-color: ${colors.brand.tint}; color: ${colors.brand.strong};`
      : ""}
```

`SidebarNavLink`의 `&.active`:

```ts
  &.active {
    color: ${colors.brand.strong};
    background-color: ${({ $isopen }) =>
      $isopen ? colors.brand.tint : "transparent"};
    ${({ $isopen }) =>
      $isopen
        ? `
      border-left: 3px solid ${colors.brand.strong};
      border-radius: 0 8px 8px 0;
      padding-left: 7px;
    `
        : ""}
```

- [ ] **Step 3: `mobileDrawer.styles.tsx` 하드코딩 흡수**

`$active` 항목 배경 `#E8F5EF` → `colors.brand.tint`, `&.active`의 배경 `#E8F4F1` → `colors.brand.tint`, 좌측 바 `#1D9E75` → `colors.brand.strong`.

```ts
  background-color: ${({ $active }) =>
    $active ? colors.brand.tint : "transparent"};
```

```ts
  &.active {
    color: ${colors.brand.strong};
    background-color: ${colors.brand.tint};
    border-left: 3px solid ${colors.brand.strong};
```

- [ ] **Step 4: 확인**

```bash
grep -rn 'colors\.brand\.\(primary\|secondary\|background\)\|#E8F4F1\|#1D9E75' src/layouts
```

Expected: 출력 없음. (hover 배경 `#E0EDE8`·`#D5EDE4`는 스코프 밖이라 남아 있어야 정상이다.)

- [ ] **Step 5: 검증**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

- [ ] **Step 6: 커밋**

```bash
git add client/src/layouts
git commit -m "refactor: layouts를 역할 기반 brand 토큰으로 이관

활성 내비게이션의 글자·배경·좌측 바가 각각 다른 리터럴로 흩어져
있던 것을 토큰으로 모은다. #E8F4F1은 브랜드 tint와 사실상 같은
값이라 흡수하고, 좌측 바는 짝이 되는 글자를 따라 strong으로 간다."
```

---

### Task 4: `features/landing` + `features/guest` 마이그레이션

랜딩 주 CTA — 이 작업에서 가장 눈에 띄는 변화다.

**Files:**
- Modify: `client/src/features/landing/components/ctaButtons.styles.tsx`
- Modify: `client/src/features/landing/components/featureCard.styles.tsx`
- Modify: `client/src/features/landing/components/landingHeader.styles.tsx`
- Modify: `client/src/features/guest/components/guestAddTodoInput.styles.tsx`
- Modify: `client/src/features/guest/components/guestBanner.styles.tsx`
- Modify: `client/src/features/guest/components/guestHeader.styles.tsx`

- [ ] **Step 1: 일괄 치환**

```bash
cd client
grep -rl 'colors\.brand\.\(primary\|secondary\|background\)' src/features/landing src/features/guest \
  | xargs sed -i '' \
    -e 's/colors\.brand\.background/colors.brand.tint/g' \
    -e 's/colors\.brand\.secondary/colors.brand.strong/g' \
    -e 's/colors\.brand\.primary/colors.brand.strong/g'
```

- [ ] **Step 2: `strongHover` 예외 5곳 되돌리기**

전부 `&:hover` 블록 안의 `background-color`(또는 `color`)다.

| 파일 | 컴포넌트 | 속성 |
|---|---|---|
| `ctaButtons.styles.tsx` | `PrimaryButton` | `background-color` |
| `landingHeader.styles.tsx` | `LoginLink` | `color` |
| `guestHeader.styles.tsx` | `LoginButton` | `background-color` |
| `guestBanner.styles.tsx` | `LoginButton` | `background-color` |
| `guestAddTodoInput.styles.tsx` | `AddButton` | `background-color` |

각각 `colors.brand.strongHover`로 바꾼다. 예:

```ts
  &:hover {
    background-color: ${colors.brand.strongHover};
  }
```

- [ ] **Step 3: `ctaButtons.styles.tsx`의 `SecondaryButton` 확인**

글자와 테두리가 짝이므로 **둘 다 `strong`**이어야 한다. Step 1의 일괄 치환으로 이미 그렇게 됐는지 눈으로 확인한다. `&:hover`의 배경은 `colors.brand.tint`(구 `background`)로, 이건 hover가 아니라 배경이므로 `strongHover`가 아니다.

```ts
const SecondaryButton = styled.button`
  color: ${colors.brand.strong};
  background-color: transparent;
  border: 1px solid ${colors.brand.strong};

  &:hover {
    background-color: ${colors.brand.tint};
  }
```

- [ ] **Step 4: 확인**

```bash
grep -rn 'colors\.brand\.\(primary\|secondary\|background\)' src/features/landing src/features/guest
```

Expected: 출력 없음.

- [ ] **Step 5: 검증**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

- [ ] **Step 6: 커밋**

```bash
git add client/src/features/landing client/src/features/guest
git commit -m "refactor: landing/guest를 역할 기반 brand 토큰으로 이관

랜딩 주 CTA가 #1D9E75 배경에 흰 글자를 3.39:1로 얹고 있었다.
앱에 처음 들어온 사람이 가장 먼저 누르는 버튼이라 영향이 크다.
게스트 화면의 로그인·추가 버튼도 같은 패턴이었다."
```

---

### Task 5: `features/today` 마이그레이션

**Files:**
- Modify: `client/src/features/today/components/dailyProgress.styles.tsx`
- Modify: `client/src/features/today/components/todayTodoItem.styles.tsx`
- Modify: `client/src/features/today/components/weekStrip.styles.tsx`
- Modify: `client/src/features/today/pages/todayPage.styles.tsx`

- [ ] **Step 1: 일괄 치환**

```bash
cd client
grep -rl 'colors\.brand\.\(primary\|secondary\|background\)' src/features/today \
  | xargs sed -i '' \
    -e 's/colors\.brand\.background/colors.brand.tint/g' \
    -e 's/colors\.brand\.secondary/colors.brand.strong/g' \
    -e 's/colors\.brand\.primary/colors.brand.strong/g'
```

- [ ] **Step 2: `fill` 예외 2곳 되돌리기**

`dailyProgress.styles.tsx`의 `ProgressBarFill` — 진행률 채움. 회색 트랙(`background.secondary`) 위에 있고 글자가 없다:

```ts
  background-color: ${colors.brand.fill};
```

`todayTodoItem.styles.tsx`의 `Checkbox` — 완료 상태 배경. 체크 아이콘만 얹히고 글자는 없다:

```ts
    background-color: ${({ $isDone }) =>
      $isDone ? colors.brand.fill : "transparent"};
```

- [ ] **Step 3: `todayPage.styles.tsx`의 `Fab` 하드코딩 흡수**

`&:hover`의 `background-color: #0d5e49`가 사실상 `strongHover`다:

```ts
  &:hover {
    background-color: ${colors.brand.strongHover};
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    transform: translateY(-1px);
  }
```

`&:active` 블록에도 브랜드색이 있으면 같은 기준으로 처리한다 — 눌린 상태는 hover와 같거나 더 어두우므로 `strongHover`다.

- [ ] **Step 4: `LinkIndicator` 확인**

`todayTodoItem.styles.tsx`의 `LinkIndicator`는 아이콘 색이다. 비텍스트 3:1로는 통과하지만 여유가 0.39뿐이라 **`strong`으로 간다** — Step 1의 일괄 치환 결과가 맞다. 되돌리지 않는다.

- [ ] **Step 5: 확인**

```bash
grep -rn 'colors\.brand\.\(primary\|secondary\|background\)\|#0d5e49' src/features/today
```

Expected: 출력 없음.

- [ ] **Step 6: 검증**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

Expected: `weekStrip.test.tsx`(12개), `todayTodoItem.test.tsx`(3개), `dailyProgress.test.tsx`(4개), `todayPage.test.tsx`(20개) 포함 전부 통과. 색만 바뀌므로 깨질 이유가 없다 — 깨진다면 테스트가 색 리터럴을 단언하고 있다는 뜻이니 그 단언을 새 값으로 갱신한다.

- [ ] **Step 7: 커밋**

```bash
git add client/src/features/today
git commit -m "refactor: today를 역할 기반 brand 토큰으로 이관

진행률 채움과 완료 체크 배경은 글자를 얹지 않으므로 fill로 남긴다.
Fab의 하드코딩된 hover(#0d5e49)는 사실상 strongHover라 흡수한다."
```

---

### Task 6: `features/todo` 마이그레이션

가장 큰 구역이다. 포커스 글로우의 `rgba` 하드코딩도 여기 있다.

**Files:**
- Modify: `client/src/features/todo/components/projectCard.styles.tsx`
- Modify: `client/src/features/todo/components/recurrence/recurrence.styles.tsx`
- Modify: `client/src/features/todo/components/todoDetail/descriptionLinkAction.styles.tsx`
- Modify: `client/src/features/todo/components/todoDetail/todoDetail.styles.tsx`
- Modify: `client/src/features/todo/components/todoForm/todoFrom.styles.tsx`
- Modify: `client/src/features/todo/components/todoList.styles.tsx`
- Modify: `client/src/features/todo/components/todoSearch.styles.tsx`

- [ ] **Step 1: 일괄 치환**

```bash
cd client
grep -rl 'colors\.brand\.\(primary\|secondary\|background\)' src/features/todo \
  | xargs sed -i '' \
    -e 's/colors\.brand\.background/colors.brand.tint/g' \
    -e 's/colors\.brand\.secondary/colors.brand.strong/g' \
    -e 's/colors\.brand\.primary/colors.brand.strong/g'
```

- [ ] **Step 2: `fill` 예외 3곳 되돌리기**

`projectCard.styles.tsx`의 `ColorDot` — 프로젝트 식별 점, 8px 원, 글자 없음:

```ts
  background-color: ${({ $isOverdue }) =>
    $isOverdue ? colors.danger.main : colors.brand.fill};
```

`projectCard.styles.tsx`의 `ProgressFill` — 진행률 채움:

```ts
  background-color: ${({ $isOverdue }) =>
    $isOverdue ? colors.danger.main : colors.brand.fill};
```

`todoSearch.styles.tsx`의 `LoadingSpinner` — 회전 인디케이터:

```ts
  border-top-color: ${colors.brand.fill};
```

- [ ] **Step 3: `strongHover` 예외 3곳 되돌리기**

`todoDetail.styles.tsx`의 `$variant === "primary"` 블록 — `&:hover`와 `&:active` 둘 다:

```ts
    &:hover {
      background-color: ${colors.brand.strongHover};
      box-shadow: 0 2px 6px rgba(15, 110, 86, 0.25);
    }

    &:active {
      background-color: ${colors.brand.strongHover};
      box-shadow: 0 1px 2px rgba(15, 110, 86, 0.15);
    }
```

`todoList.styles.tsx`의 `AddButton` `&:hover` — 하드코딩 `#0d5e49`:

```ts
  &:hover {
    background-color: ${colors.brand.strongHover};
  }
```

- [ ] **Step 4: 포커스 글로우 `rgba` 4곳 교체**

`rgba(29, 158, 117, …)`는 `#1D9E75`의 RGB다. 바로 옆 `border-color`가 `strong`으로 갔으므로 글로우도 `#0F6E56`의 RGB인 `rgba(15, 110, 86, …)`가 되어야 한다. **알파값은 각 위치의 기존 값을 유지한다.**

| 파일 | 컴포넌트 | 기존 알파 |
|---|---|---|
| `todoSearch.styles.tsx` | 검색 입력 `&:focus` | `0.1` |
| `todoDetail.styles.tsx` | 제목 입력 `&:focus` | `0.12` |
| `todoDetail.styles.tsx` | 설명 박스 `&:focus-within` | `0.12` |
| `todoDetail.styles.tsx` | 선택 입력 `&:focus` | `0.12` |

예:

```ts
  &:focus {
    border-color: ${colors.brand.strong};
    box-shadow: 0 0 0 3px rgba(15, 110, 86, 0.12);
  }
```

- [ ] **Step 5: `recurrence.styles.tsx`의 `TabButton` 확인 — `strongHover`가 아니다**

`&:hover { color: … }`가 있지만 이건 "브랜드 요소를 더 진하게"가 아니라 "비활성 탭이 hover에서
브랜드색을 띤다"는 의미다. 목적지가 활성 상태의 색이므로 **`strong`**이 맞다. Step 1의 일괄
치환 결과를 그대로 둔다.

활성 탭의 글자(`color`)와 밑줄(`border-bottom`)은 짝이므로 둘 다 `strong`이다.

```ts
export const TabButton = styled.button<{ $active: boolean }>`
  color: ${({ $active }) => ($active ? colors.brand.strong : colors.text.secondary)};
  border-bottom: 2px solid
    ${({ $active }) => ($active ? colors.brand.strong : "transparent")};

  &:hover {
    color: ${colors.brand.strong};
  }
`;
```

**규칙 정리:** `&:hover` 안에 있다고 무조건 `strongHover`가 아니다. `strongHover`는 **이미
브랜드색인 요소가 hover에서 더 진해질 때만** 쓴다. 중립 상태에서 브랜드색으로 *변하는*
hover는 `strong`이다.

- [ ] **Step 6: `todoSearch.styles.tsx`의 `CancelSearchButton` hover 흡수**

`background-color: #e8f0fe`가 파란색이다:

```ts
  &:hover {
    background-color: ${colors.brand.tint};
  }
```

- [ ] **Step 7: 낡은 주석 갱신**

`descriptionLinkAction.styles.tsx`와 `todoDetail.styles.tsx`에 구 토큰 이름을 설명하는 주석이 있다. 사라진 이름을 가리키므로 새 이름으로 고친다.

- `brand.secondary(#1D9E75)` → `brand.fill(#1D9E75)`
- `brand.primary(#0F6E56)` → `brand.strong(#0F6E56)`

대비 수치(3.39:1, 6.20:1, 5.54:1, 2.81:1)는 값이 안 바뀌었으므로 그대로 둔다.

- [ ] **Step 8: 확인**

```bash
grep -rn 'colors\.brand\.\(primary\|secondary\|background\)\|#0d5e49\|#e8f0fe\|rgba(29, 158, 117' src/features/todo
```

Expected: 출력 없음.

- [ ] **Step 9: 검증**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

- [ ] **Step 10: 커밋**

```bash
git add client/src/features/todo
git commit -m "refactor: todo를 역할 기반 brand 토큰으로 이관

포커스 글로우가 #1D9E75의 RGB를 rgba로 풀어 하드코딩하고 있었다.
바로 옆 border-color가 strong으로 가므로 글로우도 같이 옮긴다.
색 점과 진행률 채움은 글자를 얹지 않아 fill로 남는다."
```

---

### Task 7: `features/dashboard` + `features/kanban` 마이그레이션

**Files:**
- Modify: `client/src/features/dashboard/components/calendar.styles.tsx`
- Modify: `client/src/features/dashboard/components/calendar.tsx`
- Modify: `client/src/features/kanban/components/kanbanBoard.styles.tsx`

- [ ] **Step 1: 일괄 치환**

```bash
cd client
grep -rl 'colors\.brand\.\(primary\|secondary\|background\)' src/features/dashboard src/features/kanban \
  | xargs sed -i '' \
    -e 's/colors\.brand\.background/colors.brand.tint/g' \
    -e 's/colors\.brand\.secondary/colors.brand.strong/g' \
    -e 's/colors\.brand\.primary/colors.brand.strong/g'
```

- [ ] **Step 2: `fill` 예외 1곳 되돌리기**

`calendar.tsx`의 `Spinner` — 회전 인디케이터:

```ts
  border-top-color: ${colors.brand.fill};
```

- [ ] **Step 3: `calendar.styles.tsx`의 `ViewButton` 확인**

`$active`일 때 배경에 **흰 글자**를 얹는다. 테두리·배경 모두 `strong`이어야 한다. Step 1의 결과가 맞는지 확인한다.

```ts
  border: 1px solid
    ${({ $active }) => ($active ? colors.brand.strong : colors.border.secondary)};
  background-color: ${({ $active }) =>
    $active ? colors.brand.strong : "transparent"};
  color: ${({ $active }) => ($active ? "#ffffff" : colors.text.secondary)};
```

- [ ] **Step 4: `calendar.styles.tsx`의 `#e8f5ef !important` 흡수**

소문자 리터럴이 브랜드 tint와 같은 값이다. `!important`는 FullCalendar 기본 스타일을 이기기 위한 것이므로 유지한다.

```ts
  background-color: ${colors.brand.tint} !important;
```

- [ ] **Step 5: 칸반 필터 탭 확인**

`kanbanBoard.styles.tsx`의 활성 필터 탭은 글자와 밑줄(`border-bottom`)이 짝이다. **둘 다 `strong`**이어야 한다. `&:hover`의 글자색도 활성 상태를 유지하는 용도이므로 `strong`이지 `strongHover`가 아니다.

- [ ] **Step 6: 확인**

```bash
grep -rn 'colors\.brand\.\(primary\|secondary\|background\)\|#e8f5ef' src/features/dashboard src/features/kanban
```

Expected: 출력 없음. (`#F0FBF7`, `#D1F5E8`은 스코프 밖이라 남아 있어야 정상이다.)

- [ ] **Step 7: 검증**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

Expected: `calendar.test.tsx`(4개), `kanbanFilters.test.ts`(3개), `useKanbanDrag.test.tsx`(19개) 포함 전부 통과.

- [ ] **Step 8: 커밋**

```bash
git add client/src/features/dashboard client/src/features/kanban
git commit -m "refactor: dashboard/kanban을 역할 기반 brand 토큰으로 이관

캘린더 뷰 전환 버튼이 활성 상태에서 흰 글자를 3.39:1로 얹고
있었다. 칸반 필터 탭은 글자와 밑줄이 짝이라 함께 strong으로 간다."
```

---

### Task 8: 구 토큰 삭제 + 문서 갱신

**컴파일러가 누락 검사기 역할을 하는 태스크다.** 구 토큰을 지웠을 때 `tsc`가 깨끗하면 마이그레이션이 완전한 것이다.

**Files:**
- Modify: `client/src/styles/colors.ts`
- Modify: `client/src/styles/statusColors.ts` (주석만)
- Modify: `client/src/styles/__tests__/statusColors.test.ts` (주석만)
- Modify: `CLAUDE.md`

- [ ] **Step 1: 전역에 구 토큰 참조가 없는지 먼저 확인**

```bash
cd client
grep -rn 'colors\.brand\.\(primary\|secondary\|background\)' src
```

Expected: 출력 없음. 남아 있으면 해당 파일이 속한 태스크로 돌아간다.

- [ ] **Step 2: 구 토큰 삭제**

`client/src/styles/colors.ts`에서 마이그레이션용 3줄과 그 위 주석을 제거한다:

```ts
    // --- 아래 3개는 마이그레이션 중에만 존재한다. Task 8에서 삭제한다. ---
    primary: "#0F6E56",
    secondary: "#1D9E75",
    background: "#E8F5EF",
```

- [ ] **Step 3: 타입체크로 누락 검증**

```bash
npx tsc --noEmit
```

Expected: 에러 0. 에러가 나면 그 파일이 아직 구 토큰을 참조하는 것이므로 규칙에 따라 고친다.

- [ ] **Step 4: `statusColors` 주석 갱신**

`statusColors.ts`의 `done.main` 주석이 "브랜드 secondary 틸 색상"을 언급한다. 사라진 이름이다:

```ts
    main: "#1D9E75", // 초록(틸) - 완료, 리브랜딩 스펙 1-4 통일값 (brand.fill과 같은 값이나 별도 체계)
```

`statusColors.test.ts`의 같은 취지 주석도 함께 고친다:

```ts
      // 리브랜딩 스펙(1-4) 기준 브랜드 틸 색상으로 통일됨. brand.fill과 값은 같지만
      // 할 일 상태를 나타내는 별도 체계라 brand 토큰을 참조하지 않는다.
```

- [ ] **Step 5: `CLAUDE.md` 갱신**

"디자인 요소" 절이 사라진 이름을 서술하고 값도 반대다. 아래로 교체한다:

```markdown
## 디자인 요소

브랜드색은 역할로 나뉩니다. 이름이 용도를 말하므로 값 대신 역할로 고르세요.

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `brand.strong` | `#0F6E56` | 글자·아이콘, 흰 글자를 얹는 솔리드 배경, 포커스 신호 |
| `brand.strongHover` | `#0A4E3C` | 위 요소들의 hover / active |
| `brand.fill` | `#1D9E75` | 흰색·회색 배경 위에, **글자를 얹지 않는** 장식 |
| `brand.tint` | `#E8F5EF` | 연한 배경 |

`brand.fill`은 흰색과 3.39:1이라 글자에 쓰면 WCAG AA(4.5:1)에 미달합니다.
연한 초록 배경 위에서는 비텍스트 기준(3:1)마저 깨집니다.
근거는 `docs/superpowers/specs/2026-08-11-brand-color-contrast-aa-design.md` 참고.
```

- [ ] **Step 6: 전체 검증**

```bash
npx tsc --noEmit && npm run lint && npm run test && npm run build
```

Expected: 타입 에러 0, lint 에러 0, 유닛 425개 통과, 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add client/src/styles CLAUDE.md
git commit -m "refactor: 구 brand 토큰 제거 + 문서 갱신

primary/secondary/background를 삭제한다. tsc가 깨끗하다는 것이
150개 참조가 모두 이관됐다는 증거다.

CLAUDE.md의 디자인 요소 절은 값이 colors.ts와 반대로 적혀 있었다.
역할 기반 이름으로 바꾸면서 그 불일치도 없어진다."
```

---

### Task 9: 시각 확인

자동 검증이 닿지 않는 부분이다. 대비 테스트는 토큰 값만 보고 사용처는 못 본다.

**Files:** 없음 (확인만)

- [ ] **Step 1: 개발 서버 실행**

```bash
cd client && npm run dev
```

- [ ] **Step 2: 화면별 확인**

| 화면 | 볼 것 |
|---|---|
| `/` (랜딩) | 주 CTA 버튼이 진해졌는지, hover에서 더 진해지는지, 보조 CTA의 글자·테두리가 같은 색인지 |
| `/guest` | 로그인 버튼, 할 일 추가 버튼, 배너 |
| `/login` | 구글 버튼은 `#34A853`이라 **안 바뀌어야** 정상 |
| 오늘 | 진행률 바가 **밝은 채로 남았는지**(fill), 완료 체크 배경, FAB hover, 링크 아이콘 |
| 목록 | "새 프로젝트" 링크, 추가 버튼 hover, 프로젝트 색 점이 **밝은 채로 남았는지**, 진행률 바 |
| 상세 | 제목·설명 입력 포커스 시 테두리와 글로우가 같은 색인지, 주 버튼 hover/active |
| 검색 | 입력 포커스, 결과 개수 강조, 취소 버튼 hover가 **파란색이 아닌지** |
| 칸반 | 활성 필터 탭의 글자와 밑줄이 같은 색인지 |
| 캘린더 | 뷰 전환 버튼 활성 상태(흰 글자 가독성), 반복 하이라이트 배경 |
| SNB / 모바일 드로어 | 활성 항목의 글자·배경·좌측 바가 어긋나지 않는지 |
| 빈 상태 / 에러 / 모달 | 액션 버튼과 hover |

- [ ] **Step 3: E2E**

```bash
npm run test:e2e
```

로컬에서는 `JAVA_HOME`을 JDK 21로 바꿔야 Firestore 에뮬레이터가 뜬다. 기본 java 17이면 조용히 실패한다.

Expected: 24개 통과.

- [ ] **Step 4: 판단**

기준은 통과했는데 브랜드가 죽어 보인다면 그건 대비표로 풀 문제가 아니다. 그 경우 진행을 멈추고 어느 화면이 문제인지 기록한 뒤 설계를 다시 논의한다. **임의로 토큰 값을 조정하지 않는다** — Global Constraints의 값이 스펙의 근거와 묶여 있다.

---

## 완료 조건

- `grep -rn 'colors\.brand\.\(primary\|secondary\|background\)' client/src` → 출력 없음
- `npx tsc --noEmit` → 에러 0
- `npm run lint` → 에러 0
- `npm run test` → 425개 통과 (기존 415 + 대비 10)
- `npm run test:e2e` → 24개 통과
- `npm run build` → 성공, 번들 예산 통과
- 시각 확인 완료
