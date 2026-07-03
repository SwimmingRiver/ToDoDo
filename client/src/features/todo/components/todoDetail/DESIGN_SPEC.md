# Todo 상세 페이지 리브랜딩 — 디자인 스펙

- 대상 파일: `client/src/features/todo/components/todoDetail/`
- 작성일: 2026-07-02
- 상태: **사용자 검토 대기** — 승인 후 ui-ux-improver가 구현

---

## 0. 변경 범위 요약

| 항목 | 현재 | 변경 후 |
|---|---|---|
| StatusBadge 색상 | todo=파랑(#1976d2), doing=주황(#f57c00), done=초록(#388e3c) — 임의 배색, 브랜드 컬러 미반영 | `styles/statusColors.ts` 토큰 재사용. done만 브랜드 그린(#1D9E75), todo/doing은 기존 앱 전역과 동일한 회색/파랑 유지 |
| PriorityBadge 색상 | high=빨강, medium=주황, low=초록 — StatusBadge와 팔레트 중복(특히 초록/주황), 두 뱃지 의미 혼동 가능 | 필 색상(pill) 대신 **좌측 보더 accent + 중립 배경** 형태로 전면 재설계. StatusBadge와 시각적으로 다른 형태(pill vs. chip)로 구분 |
| Panel 헤더/타이틀/보더 | `#333`, `#e0e0e0` 하드코딩 | `colors.text.primary`, `colors.border.tertiary` 토큰 사용 |
| Input/TextArea/Select | 기본 보더 `#ddd` 하드코딩, focus만 브랜드 컬러 | 기본 보더 `colors.border.secondary`, focus 시 브랜드 그린 보더 + 포커스 링(box-shadow) 추가 |
| Button(primary) | 브랜드 컬러 사용 중이나 shadow/디테일 부족 | 그린 톤 box-shadow, hover/active/focus-visible 상태 추가 |
| CloseButton | hover 시 무채색(`#f0f0f0`) | hover 시 연민트 배경 + 브랜드 그린 아이콘 (SNB 메뉴 리브랜딩과 동일한 hover 색 재사용) |
| 폼 에러 텍스트 | 인라인 `style={{ color: "red" }}` | `ErrorText` 스타일 컴포넌트, `colors.danger.text` 토큰 |
| 폰트 | Pretendard 전역 적용 여부 미확인 | 확인 완료 — `client/src/index.css`의 `body { font-family: 'Pretendard', ... }`로 전역 적용되어 있음. **todoDetail에 별도 폰트 지정 불필요** |

레이아웃(Overlay + 우측 슬라이드 Panel, 폼 구조, 모바일 전체폭 대응)은 변경하지 않는다. 색상 토큰화와 인터랙션 디테일(hover/focus)만 다룬다.

> **업데이트 (2026-07-02)**: 구현 진행 중 시작일시/마감일시 필드에서 반응형 레이아웃 버그(네이티브 `datetime-local` 위젯의 서브필드 잘림)가 발견되어, 해당 필드 쌍에 한해 레이아웃 변경을 추가한다. 상세 내용은 [10. 레이아웃 예외 — 시작일시/마감일시 필드](#10-레이아웃-예외--시작일시마감일시-필드-구현-중-발견) 참고. 그 외 레이아웃(Overlay, Panel 폭, 다른 필드 순서/배치)은 기존 방침대로 변경하지 않는다.

---

## 1. 화면 구조

레이아웃 자체는 기존과 동일하다. 변경되는 시각 요소만 표시한다.

### 1-1. 전체 레이아웃 (데스크톱, 폭 50%)

```
┌──────────────────────────────────────────┐  ← Overlay (반투명 검정, 클릭 시 닫기)
│                                            │
│              ┌─────────────────────────┐  │
│              │ Todo 상세          [X]  │  │  ← PanelHeader (border-bottom: border.tertiary)
│              ├─────────────────────────┤  │
│              │ 생성일   수정일   완료일  │  │  ← InfoRow (text.tertiary 라벨)
│              │                          │  │
│              │ 현재 상태     현재 우선순위 │  │
│              │ ┏━━━━━┓    ┃우선순위┃    │  │  ← StatusBadge(필 pill) / PriorityBadge(좌측 보더 chip)
│              │ ┗━━━━━┛    ┃━━━━━━━┃    │  │
│              │                          │  │
│              │ 제목                     │  │
│              │ [_______________________]│  │  ← Input (focus 시 그린 보더 + 포커스 링)
│              │                          │  │
│              │ 설명                     │  │
│              │ [_______________________]│  │  ← TextArea
│              │ [_______________________]│  │
│              │                          │  │
│              │ 상태 ▾        우선순위 ▾  │  │  ← Select x2
│              │                          │  │
│              │ 시작일시       마감일시   │  │  ← Input(datetime-local) x2
│              ├─────────────────────────┤  │
│              │           [취소] [저장]  │  │  ← PanelFooter (border-top), 저장 버튼 = 브랜드 그린
│              └─────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 1-2. 뱃지 상세 (형태 차이로 의미 구분)

```
StatusBadge (필 pill, radius 12px, 배경 채움)
  ┌────────┐   ┌────────┐   ┌────────┐
  │  할 일  │   │ 진행 중 │   │  완료   │
  └────────┘   └────────┘   └────────┘
   회색 계열      파랑 계열     브랜드 그린 ← done만 브랜드 컬러

PriorityBadge (좌측 보더 chip, radius 4px, 중립 배경 + 텍스트만 컬러)
  ┃ 높음        ┃ 중간        ┃ 낮음
  (빨강 보더)    (주황/amber 보더)  (중립 회색 보더)
```

두 뱃지는 형태(pill vs. chip)와 보더 유무로 우선 구분되고, 색상 팔레트도 겹치지 않도록 재배치한다 (아래 2-1 참고).

---

## 2. 디자인 언어

### 2-1. 색상

#### StatusBadge — 기존 `styles/statusColors.ts` 토큰 재사용 (신규 색상 도입 없음)

| 상태 | 배경 | 텍스트 | 비고 |
|---|---|---|---|
| todo | `statusColors.todo.light` `#f3f4f6` | `statusColors.todo.main` `#6b7280` | 회색 — 대기, 앱 전역(todoListItem, calendar)과 동일 |
| doing | `statusColors.doing.light` `#dbeafe` | `statusColors.doing.main` `#3b82f6` | 파랑 — 진행 중, 앱 전역과 동일 |
| done | `statusColors.done.light` `#d1fae5` | `statusColors.done.main` `#1D9E75` | **브랜드 그린** — 완료 상태만 브랜드 컬러로 강조, dashboard 캘린더/todoListItem과 시각 언어 통일 |

`statusColors`는 이미 "완료 = 브랜드 그린" 리브랜딩 규칙으로 정의되어 있음(`statusColors.ts` 13행 주석: "리브랜딩 스펙 1-4 통일값"). todoDetail도 이 토큰을 그대로 import해서 쓴다 — 새 색상 정의 불필요.

#### PriorityBadge — 신규 chip 스타일 (좌측 보더 accent, StatusBadge와 팔레트 분리)

| 우선순위 | 좌측 보더 | 배경 | 텍스트 | 근거 |
|---|---|---|---|---|
| high | `colors.danger.main` `#E24B4A` | `colors.danger.background` `#FBEAEA` | `colors.danger.text` `#C53A39` | 기존 `colors.ts`의 danger 토큰 그대로 재사용. red 계열은 StatusBadge에서 쓰지 않으므로 충돌 없음 |
| medium | `#F59E0B` (신규) | `#FEF3E2` (신규) | `#B45309` (신규) | amber 계열. `todoListItem.styles.tsx`의 `DueBadge`가 이미 임박 마감에 `#f59e0b`/`#f97316`를 하드코딩해서 쓰고 있어(76번 라인 부근) 앱 안에서 "amber = 경고/중간 긴급도" 인식이 이미 존재함 — 그 톤을 공식 색상으로 승격 |
| low | `colors.border.tertiary` `#E5E7EB` | `colors.background.secondary` `#F4F5F6` | `colors.text.secondary` `#5F6368` | 완전 중립톤. 초록을 쓰지 않아 done 상태(브랜드 그린)와 절대 겹치지 않음 |

**색상 전략 요약**: StatusBadge는 "무엇을 하고 있는가"(회색→파랑→브랜드그린 진행성), PriorityBadge는 "얼마나 급한가"(중립→amber→red 경고성)를 표현한다. 두 축이 서로 다른 색상 계열(그린/파랑 vs. amber/레드)을 쓰므로 나란히 배치돼도 혼동되지 않는다. 브랜드 그린(#1D9E75)은 StatusBadge의 `done`에서만 등장해 "완료"라는 단일 의미를 갖는다.

**신규 토큰 제안**: `client/src/styles/colors.ts`에 `warning` 그룹 추가 권장.
```ts
warning: {
  main: "#F59E0B",
  background: "#FEF3E2",
  text: "#B45309",
},
```
(기존 `DueBadge`의 하드코딩 값 리팩터링은 이번 스코프 밖이지만, 토큰을 새로 만들어두면 추후 통합이 쉬워짐 — ui-ux-improver 판단에 맡김)

#### Panel / 폼 요소

| 용도 | 기존 | 변경 후 (토큰) |
|---|---|---|
| PanelTitle 텍스트 | `#333` | `colors.text.primary` `#1A1A1A` |
| PanelHeader/Footer 보더 | `#e0e0e0` | `colors.border.tertiary` `#E5E7EB` |
| Label 텍스트 | `#333` | `colors.text.primary` |
| InfoLabel 텍스트 | `#888` | `colors.text.tertiary` `#9AA0A6` |
| InfoValue 텍스트 | `#333` | `colors.text.primary` |
| Input/TextArea/Select 기본 보더 | `#ddd` | `colors.border.secondary` `#D1D5DB` |
| Input/TextArea/Select focus 보더 | `colors.brand.secondary` (유지) | `colors.brand.secondary` `#1D9E75` (유지) |
| Input/TextArea/Select focus 포커스 링 | 없음 | `box-shadow: 0 0 0 3px rgba(29, 158, 117, 0.12)` (신규) |
| Input/TextArea/Select placeholder | 브라우저 기본 | `colors.text.tertiary` |
| Button(primary) 배경/hover | `colors.brand.secondary` / `colors.brand.primary` (유지) | 동일 유지 + `box-shadow` 추가 |
| Button(primary) 기본 그림자 | 없음 | `0 1px 2px rgba(15, 110, 86, 0.15)` |
| Button(primary) hover 그림자 | 없음 | `0 2px 6px rgba(15, 110, 86, 0.25)` |
| Button(secondary, 취소) 텍스트/보더 | `#666` / `#ddd` | `colors.text.secondary` `#5F6368` / `colors.border.secondary` |
| Button(secondary) hover 배경 | `#f5f5f5` | `colors.background.secondary` `#F4F5F6` |
| Button 공통 focus-visible | 없음 | `outline: 2px solid ${colors.brand.secondary}; outline-offset: 2px;` |
| CloseButton 기본 색상 | `#666` | `colors.text.secondary` |
| CloseButton hover 배경 | `#f0f0f0` (무채색) | `#E0EDE8` (SNB `SidebarNavLink` hover와 동일 톤 재사용) |
| CloseButton hover 색상 | `#333` | `colors.brand.secondary` |
| ErrorText (신규, 기존 인라인 `style={{ color: "red" }}` 대체) | `red` | `colors.danger.text` `#C53A39` |

### 2-2. 간격 및 크기

레이아웃 간격(패딩/갭)은 기존 값을 그대로 유지한다. 아래 항목만 신규/변경.

| 요소 | 값 |
|---|---|
| StatusBadge padding | `4px 12px` (기존 유지) |
| StatusBadge border-radius | `12px` (기존 유지, pill) |
| PriorityBadge padding | `4px 10px 4px 8px` (좌측 보더 두께만큼 살짝 축소) |
| PriorityBadge border-left | `3px solid` (색상은 2-1 표 참고) |
| PriorityBadge border-radius | `0 4px 4px 0` (pill이 아닌 chip — StatusBadge와 형태 구분) |
| 포커스 링 두께 | `3px` (box-shadow spread) |
| 포커스 링/보더 컬러 전환 시간 | `0.2s ease` (기존 Input 트랜지션 유지) |
| hover 배경 전환 시간 (CloseButton, Button) | `0.15s ease` (SNB 리브랜딩과 동일 타이밍으로 통일) |
| Button 공통 min-height | `40px` (기존 패딩 `10px 20px` 유지 시 자연스럽게 확보됨 — 별도 지정 불필요, 확인만) |

### 2-3. 타이포그래피

전역 `body { font-family: 'Pretendard', ... }` (`client/src/index.css`)가 이미 적용되어 있으므로 todoDetail 컴포넌트에 별도 `font-family` 선언은 불필요하다. 기존 `font-size`/`font-weight` 값(PanelTitle 20px/600, Label 14px/600, Button 14px/500 등)은 유지한다.

---

## 3. 컴포넌트 설계

### 3-1. 수정 대상

#### `todoDetail.styles.tsx`

**import 추가:**
```ts
import { statusColors, type Status } from "@/styles/statusColors";
```
(`colors`는 이미 import되어 있음)

**StatusBadge — 하드코딩 배색을 `statusColors` 토큰 참조로 교체:**
```ts
const StatusBadge = styled.span<{ $status: Status }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background-color: ${({ $status }) => statusColors[$status].light};
  color: ${({ $status }) => statusColors[$status].main};
`;
```

**PriorityBadge — pill → 좌측 보더 chip 구조로 전면 교체:**
```ts
const priorityStyles = {
  high: {
    border: colors.danger.main,
    background: colors.danger.background,
    text: colors.danger.text,
  },
  medium: {
    border: "#F59E0B",
    background: "#FEF3E2",
    text: "#B45309",
  },
  low: {
    border: colors.border.tertiary,
    background: colors.background.secondary,
    text: colors.text.secondary,
  },
} as const;

const PriorityBadge = styled.span<{ $priority: keyof typeof priorityStyles }>`
  display: inline-block;
  padding: 4px 10px 4px 8px;
  border-left: 3px solid ${({ $priority }) => priorityStyles[$priority].border};
  border-radius: 0 4px 4px 0;
  font-size: 12px;
  font-weight: 500;
  background-color: ${({ $priority }) => priorityStyles[$priority].background};
  color: ${({ $priority }) => priorityStyles[$priority].text};
`;
```
`priorityStyles`를 `colors.warning`으로 대체하려면 3-1 하단 "ui-ux-improver 전달 사항"의 토큰 추가 여부에 따라 조정.

**PanelHeader / PanelFooter — 보더 토큰화:**
```ts
border-bottom: 1px solid ${colors.border.tertiary}; // PanelHeader
border-top: 1px solid ${colors.border.tertiary};    // PanelFooter
```

**PanelTitle:**
```ts
color: ${colors.text.primary};
```

**CloseButton — hover에 브랜드 accent 추가:**
```ts
const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${colors.text.secondary};
  padding: 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background-color: #e0ede8;
    color: ${colors.brand.secondary};
  }

  &:focus-visible {
    outline: 2px solid ${colors.brand.secondary};
    outline-offset: 2px;
  }
`;
```

**Label / InfoLabel / InfoValue — 토큰화:**
```ts
const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const InfoLabel = styled.span`
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: ${colors.text.primary};
`;
```

**Input / TextArea / Select — 보더 토큰화 + 포커스 링 추가 (3개 컴포넌트 동일 패턴):**
```ts
const Input = styled.input`
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &::placeholder {
    color: ${colors.text.tertiary};
  }

  &:focus {
    border-color: ${colors.brand.secondary};
    box-shadow: 0 0 0 3px rgba(29, 158, 117, 0.12);
  }
`;
```
`TextArea`, `Select`도 동일한 `border`/`focus`/`transition` 규칙 적용 (기존 `resize: vertical`, `min-height: 100px`, `cursor: pointer` 등 컴포넌트별 고유 속성은 유지).

**Button — 브랜드 그림자 + focus-visible 추가:**
```ts
const Button = styled.button<{ $variant?: "primary" | "secondary" }>`
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;

  &:focus-visible {
    outline: 2px solid ${colors.brand.secondary};
    outline-offset: 2px;
  }

  ${({ $variant }) =>
    $variant === "primary"
      ? `
    background-color: ${colors.brand.secondary};
    color: white;
    border: none;
    box-shadow: 0 1px 2px rgba(15, 110, 86, 0.15);

    &:hover {
      background-color: ${colors.brand.primary};
      box-shadow: 0 2px 6px rgba(15, 110, 86, 0.25);
    }

    &:active {
      background-color: ${colors.brand.primary};
      box-shadow: 0 1px 2px rgba(15, 110, 86, 0.15);
    }
  `
      : `
    background-color: white;
    color: ${colors.text.secondary};
    border: 1px solid ${colors.border.secondary};

    &:hover {
      background-color: ${colors.background.secondary};
      border-color: ${colors.text.tertiary};
    }
  `}

  ${media.mobile} {
    width: 100%;
    padding: 12px;
  }
`;
```

**ErrorText — 신규 컴포넌트 (기존 인라인 `style={{ color: "red", fontSize: "12px" }}` 대체):**
```ts
const ErrorText = styled.span`
  color: ${colors.danger.text};
  font-size: 12px;
`;
```

**export 목록에 `ErrorText` 추가.**

#### `todoDetail.tsx`

**import 변경:**
```tsx
import {
  // ...기존 목록 유지
  ErrorText, // 신규
} from "./todoDetail.styles";
```

**에러 표시부 교체:**
```tsx
{errors.title && (
  <ErrorText>{errors.title.message}</ErrorText>
)}
```
인라인 `style` 제거. JSX/레이아웃 구조는 그대로 유지 — 컴포넌트 태그만 `span` → `ErrorText`로 교체.

**StatusBadge/PriorityBadge 사용부**: props 타입만 `Status`(status)로 정렬되면 되고, JSX 호출부(`<StatusBadge $status={todo.status}>`, `<PriorityBadge $priority={todo.priority}>`)는 변경 없음.

### 3-2. 신규 컴포넌트

- `ErrorText` (styled.span) — 폼 필드 검증 에러 텍스트, `todoDetail.styles.tsx`에 추가.
- 그 외 신규 컴포넌트 파일 분리는 없음. 기존 8개 styled-component(`StatusBadge`, `PriorityBadge`, `PanelHeader`, `PanelTitle`, `CloseButton`, `Label`/`InfoLabel`/`InfoValue`, `Input`/`TextArea`/`Select`, `Button`)의 색상 값만 토큰으로 교체한다.

### 3-3. 인터페이스 정의

**StatusBadge:**
```ts
const StatusBadge = styled.span<{ $status: Status }>` ... `;
// Status = "todo" | "doing" | "done" (styles/statusColors.ts에서 import)
```
기존 `$status: string`보다 타입이 좁아지므로, `todoDetail.tsx`에서 `todo.status`(타입 `"todo" | "doing" | "done"`)를 그대로 넘기면 타입 에러 없음.

**PriorityBadge:**
```ts
const PriorityBadge = styled.span<{ $priority: "high" | "medium" | "low" }>` ... `;
```

---

## 4. 인터랙션 플로우

### 4-1. Input/TextArea/Select 포커스

```
사용자가 필드 클릭 또는 Tab 이동
  ↓
border-color: #D1D5DB → #1D9E75 (0.2s ease)
box-shadow: none → 0 0 0 3px rgba(29,158,117,0.12) (0.2s ease, 동시 적용)
  ↓
포커스 아웃
  ↓
border-color, box-shadow 원상복귀
```

### 4-2. 저장 버튼(Button $variant="primary") hover/active

```
기본 상태: 배경 #1D9E75, box-shadow 0 1px 2px rgba(15,110,86,0.15)
  ↓ hover
배경 #0F6E56 (brand.primary), box-shadow 0 2px 6px rgba(15,110,86,0.25) — 그림자가 짙어지며 살짝 떠 보이는 효과
  ↓ active(클릭 유지)
배경 #0F6E56 유지, box-shadow는 기본 상태로 축소 — 눌림 효과
  ↓ 키보드 포커스(Tab)
outline: 2px solid #1D9E75, outline-offset 2px
```

### 4-3. CloseButton hover

```
기본: 아이콘 색 #5F6368, 배경 transparent
  ↓ hover
배경 #E0EDE8 (SNB 메뉴 hover와 동일 톤), 아이콘 색 #1D9E75 (브랜드 그린)
  ↓ 전환
background-color, color 모두 0.15s ease
```

### 4-4. 폼 제출 (기존 로직 유지, 색상만 변경)

```
사용자가 [저장] 클릭
  ↓
handleSubmit(onSubmit) 실행 (react-hook-form validation)
  ↓
[title 비어있음] → errors.title 세팅 → ErrorText(#C53A39) 렌더링, Input 아래 표시
  ↓ (검증 통과 시)
useUpdateTodo.mutate(...)
  → 성공: toast.success + handleClose() (Panel/Overlay 언마운트)
  → 실패: toast.error (기존 로직 그대로, 색상 변경 없음 — toast 컴포넌트는 이번 스코프 밖)
```

### 4-5. 뱃지는 인터랙션 없음

StatusBadge, PriorityBadge는 `todo.status`/`todo.priority` 값에 따라 읽기 전용으로 렌더링되며 클릭/hover 인터랙션이 없다. 실제 상태/우선순위 변경은 하단 `Select` 폼 필드를 통해서만 이뤄진다 (기존 동작 유지).

---

## 5. 상태 정의

### 5-1. Todo 없음 (초기 로딩/미존재)

기존 로직 유지: `if (!todo) return null;` — 별도 로딩 스피너나 스켈레톤 없음. 이번 스코프에서 추가하지 않는다 (레이아웃 변경 금지 범위).

### 5-2. StatusBadge 상태별 표시

| status 값 | 표시 텍스트 | 배경 | 텍스트 색 |
|---|---|---|---|
| `todo` | 할 일 | `#f3f4f6` | `#6b7280` |
| `doing` | 진행 중 | `#dbeafe` | `#3b82f6` |
| `done` | 완료 | `#d1fae5` | `#1D9E75` |

### 5-3. PriorityBadge 우선순위별 표시

| priority 값 | 표시 텍스트 | 좌측 보더 | 배경 | 텍스트 색 |
|---|---|---|---|---|
| `high` | 높음 | `#E24B4A` | `#FBEAEA` | `#C53A39` |
| `medium` | 중간 | `#F59E0B` | `#FEF3E2` | `#B45309` |
| `low` | 낮음 | `#E5E7EB` | `#F4F5F6` | `#5F6368` |

### 5-4. 폼 필드 검증 에러

`title` 필드가 비어있는 상태로 제출 시 `errors.title` 활성화 → `ErrorText`(`#C53A39`, 12px) 노출. `Input` 자체 보더 색은 변경하지 않는다 (스코프 최소화 — 필요 시 `$hasError` prop 추가는 향후 개선 항목으로 9절에 별도 명시).

### 5-5. 버튼 상태

| 버튼 | 기본 | hover | active | focus-visible |
|---|---|---|---|---|
| 저장(primary) | bg `#1D9E75`, shadow 약하게 | bg `#0F6E56`, shadow 진하게 | bg `#0F6E56`, shadow 기본으로 축소 | outline `#1D9E75` 2px |
| 취소(secondary) | bg white, border `#D1D5DB`, text `#5F6368` | bg `#F4F5F6`, border `#9AA0A6` | 별도 없음(기존 유지) | outline `#1D9E75` 2px |
| CloseButton | color `#5F6368` | bg `#E0EDE8`, color `#1D9E75` | 별도 없음 | outline `#1D9E75` 2px |

---

## 6. 모바일 대응

레이아웃 자체는 변경하지 않는다 (`Panel width: 100%` at `${media.mobile}` 기존 유지). 색상/디테일 변경 사항이 모바일에서도 동일하게 적용되는지만 확인한다.

### 6-1. 뱃지

`StatusBadge`/`PriorityBadge` 폰트 크기(12px)와 패딩은 모바일에서도 동일 유지 — 이미 충분히 작아 별도 축소 불필요. `InfoRow`가 모바일에서 `flex-direction: column`으로 전환되므로(기존 로직 유지) 뱃지 두 줄이 세로로 쌓이지만 색상/형태 변경은 없음.

### 6-2. 버튼

`${media.mobile}`에서 `Button`은 기존처럼 `width: 100%`, `PanelFooter`는 `flex-direction: column-reverse`를 유지한다. box-shadow, hover 상태는 모바일 터치 환경에서는 `:active` 상태가 주로 노출되므로 `:active` 스타일이 터치 피드백 역할을 한다 — 별도 모바일 전용 스타일 불필요.

### 6-3. Input/TextArea/Select

포커스 링(`box-shadow: 0 0 0 3px rgba(...)`)은 모바일 가상 키보드가 뜬 상태에서도 시각적으로 필드 경계를 명확히 하므로 별도 축소 없이 그대로 유지한다.

---

## 7. 접근성 요구사항

- `CloseButton`: 기존 `aria-label="닫기"` 유지.
- `CloseButton`/`Button` 공통: `:focus-visible`에 `outline: 2px solid ${colors.brand.secondary}; outline-offset: 2px;` 추가 — 키보드 탐색 시 포커스 위치를 명확히 표시 (현재 버전엔 focus-visible 스타일이 전혀 없었음).
- `Input`/`TextArea`/`Select` 포커스 링(box-shadow)은 색상 대비만으로 상태를 전달하지 않도록 보더 색 변화(`#D1D5DB` → `#1D9E75`)와 병행 — 색각 이상 사용자도 보더 두께/실선 변화로 포커스 인지 가능.
- `StatusBadge`/`PriorityBadge`는 색상 외에 텍스트 라벨("할 일"/"진행 중"/"완료", "높음"/"중간"/"낮음")을 항상 함께 표시하므로 색상만으로 의미를 전달하지 않음 (기존 구조 유지, 추가 조치 불필요).
- `ErrorText`는 `errors.title` 존재 시에만 렌더링되며 `Input`과 인접한 형제 요소로 DOM 순서상 필드 바로 다음에 위치 — 스크린리더가 필드 이후 자연스럽게 에러를 읽음. `aria-invalid`/`aria-describedby` 연결은 현재 버전에도 없었고 이번 스코프 밖이나, ui-ux-improver 구현 시 `Input`에 `aria-invalid={!!errors.title}` 추가를 권장(9절 참고).

---

## 8. 수정 파일 목록 요약

| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `features/todo/components/todoDetail/todoDetail.styles.tsx` | 수정 | StatusBadge를 `statusColors` 토큰 참조로 교체, PriorityBadge를 좌측 보더 chip 구조로 재설계, Panel/Label/Input 등 하드코딩 색상을 `colors` 토큰으로 교체, ErrorText 신규 추가, Button/CloseButton hover·focus-visible·box-shadow 추가 |
| `features/todo/components/todoDetail/todoDetail.tsx` | 수정 | `ErrorText` import 및 인라인 `style` 제거 적용. `StatusBadge`/`PriorityBadge` JSX 호출부는 변경 없음 |
| `styles/statusColors.ts` | 변경 없음 | 기존 토큰 재사용 (`todo`/`doing`/`done`) |
| `styles/colors.ts` | 수정(선택) | `warning: { main: "#F59E0B", background: "#FEF3E2", text: "#B45309" }` 그룹 추가 검토 — PriorityBadge medium에서 사용. 추가하지 않을 경우 `todoDetail.styles.tsx` 내부 로컬 상수로 유지해도 무방 (9절 참고) |

---

## 9. ui-ux-improver에게 전달할 사항

1. **StatusBadge는 새 색상을 만들지 말고 기존 `statusColors` 토큰을 import해서 쓸 것.** 이미 `statusColors.done.main`이 "리브랜딩 스펙 1-4 통일값"이라는 주석과 함께 `#1D9E75`로 정의돼 있음 (`client/src/styles/statusColors.ts` 13행). todoDetail 전용으로 색상을 다시 정의하면 나중에 앱 전역과 어긋날 수 있으니 반드시 재사용.

2. **PriorityBadge는 pill이 아니라 chip(좌측 보더 + 각진 radius)으로 형태 자체를 바꾼다.** `border-radius: 12px` → `0 4px 4px 0`, `padding`도 좌측 보더 두께(3px)를 고려해 비대칭으로 조정 (`4px 10px 4px 8px`). StatusBadge와 나란히 보일 때 형태 차이로 구분되도록 하는 것이 핵심 의도이므로, "그냥 색만 바꿔서 pill 유지"로 구현하지 말 것.

3. **medium priority의 amber 값(`#F59E0B`/`#FEF3E2`/`#B45309`)은 `colors.ts`에 공식 토큰으로 추가할지, `todoDetail.styles.tsx` 로컬 상수로 둘지 결정 필요.** 이미 `todoListItem.styles.tsx`의 `DueBadge`가 같은 계열 amber를 하드코딩해서 쓰고 있음 — 토큰화하면 추후 `DueBadge`도 같은 토큰을 쓰도록 리팩터링할 여지가 생기지만, 이번 스코프에서 `DueBadge`를 건드릴 필요는 없음. 토큰 추가 여부는 PM/사용자 확인 후 진행.

4. **포커스 링(`box-shadow: 0 0 0 3px rgba(29,158,117,0.12)`) 값의 알파(0.12)는 브랜드 그린(#1D9E75)을 RGB로 변환한 rgba(29,158,117,...) 기준.** 다른 브랜드 그린 관련 box-shadow(Button primary의 `rgba(15,110,86,...)`)는 brand.primary(#0F6E56) 기준이므로 두 값이 다른 게 의도된 것 — 헷갈려서 통일하지 말 것.

5. **CloseButton hover 배경 `#E0EDE8`은 `layouts/snb/snb.tsx`의 `SidebarNavLink` hover와 동일한 값을 그대로 재사용한 것.** 새로 조색하지 말고 그 값 그대로 복붙해서 일관성 유지.

6. **ErrorText 컴포넌트 추가 시 `todoDetail.tsx`의 인라인 `style={{ color: "red", fontSize: "12px" }}`를 제거하고 `<ErrorText>{errors.title.message}</ErrorText>`로 교체.** 이 부분은 원래 요구사항 목록엔 명시적으로 없었지만 하드코딩 색상(`red`)이 브랜드 톤과 전혀 무관해서 이번 리브랜딩 스코프에 포함시킴 — 새 기능이 아니라 기존 에러 표시를 토큰화하는 것뿐이므로 레이아웃/동작 변경 없음.

7. **선택 사항(권장, 필수 아님): `Input`에 `aria-invalid={!!errors.title}` 추가.** 접근성 개선이지만 이번 스코프의 필수 항목은 아니므로 시간 여유가 있을 때만 반영.

8. **변경 금지 범위 재확인**: Overlay/Panel의 슬라이드 애니메이션(`slideIn`/`fadeIn` keyframes), Panel 폭(`50%`/`70%`/`100%` 반응형 분기), 폼 필드 순서/구조, `handleClose`/`onSubmit` 로직은 전혀 건드리지 않는다. 오직 색상 토큰화, 뱃지 형태 재설계, hover/focus 인터랙션 디테일 추가만 구현 범위.

## 10. 레이아웃 예외 — 시작일시/마감일시 필드 (구현 중 발견)

> 본 섹션은 위 색상 토큰화 스펙(1~9절)과 별개로, `min-width: 0`을 반영해 기존 오버플로우 버그를 고친 뒤 새로 발견된 **네이티브 `datetime-local` 위젯의 서브필드 잘림 현상**에 대한 레이아웃 재검토다. 1~9절의 "레이아웃 변경 없음" 원칙에 대한 유일한 예외이며, 시작일시/마감일시 필드 쌍에만 적용된다.

### 10-1. 문제 재정의

- **1차 버그(해결됨)**: `InfoRow`(`display:flex`)의 `FormGroup` 자식이 `min-width: auto` 기본값 때문에 `datetime-local` input의 내재적 최소 폭 아래로 줄어들지 못해 Panel 밖으로 튀어나옴 → `FormGroup`에 `min-width: 0` 추가로 해결(이미 반영).
- **2차 버그(본 섹션 대상)**: `min-width: 0` 적용 후 input 자체는 컨테이너 안에 들어오지만, 브라우저 네이티브 `datetime-local` 위젯이 확보된 폭이 부족하면 연/월/일/시/분 서브필드 중 일부를 렌더링하지 않고 잘라버림. CSS 패딩/마진 조정으로는 해결 불가능한 브라우저 자체의 렌더링 한계.
- **근본 원인**: `InfoRow`가 세로 배치로 전환되는 기준이 `media.mobile`(**뷰포트** ≤480px)인데, `Panel` 폭은 뷰포트의 %(데스크톱 50% / 태블릿 70% / 모바일 100%)다. 즉 전환 기준이 "뷰포트 폭"이고 실제 제약 조건은 "Panel/필드 폭"이라 서로 어긋난다. 예를 들어 뷰포트 900px(데스크톱 구간, `InfoRow`는 여전히 좌우 배치)에서 Panel은 450px, `FormContainer` 패딩(24px×2)과 `InfoRow` gap(16px)을 빼면 필드 하나당 약 190px 남짓 — `datetime-local` 위젯이 전체 서브필드를 그리기엔 부족한 폭이다.

### 10-2. 대안 비교

| 대안 | 장점 | 단점 | 구현 난이도 | 채택 여부 |
|---|---|---|---|---|
| (A) 커스텀 date/time picker | 폭 제약에서 완전히 자유로움, 브랜드 톤 캘린더 UI 가능 | 라이브러리 신규 도입 또는 자체 구현 필요, todoForm과 함께 앱 전역 일관성 재작업 필요, 스코프 급증 | 높음 | 보류(백로그) |
| (B) 항상 세로(stacked) 배치 | 필드가 항상 컨테이너 전체 폭 사용 → 근본 원인 자체가 사라짐, 기존 컴포넌트 재사용만으로 해결, `todoForm`과 패턴 통일 | 상태/우선순위 등 다른 좌우 배치 row와 시각적 리듬이 달라짐(10-6에서 완화 방안 제시) | 낮음 | **채택** |
| (C) 컨테이너 쿼리로 추가 브레이크포인트 도입 | 뷰포트가 아닌 실제 Panel 폭 기준으로 정확히 전환 가능 | 프로젝트에 선례 없는 신규 CSS 기법 도입, (B)만으로 문제가 근본적으로 해결되므로 굳이 필요하지 않음 | 중간 | 채택 안 함(향후 재검토 대상) |
| (D) date+time 분리 입력 / 아이콘 요약+팝오버 | 유연한 표현 | 필드 2개→4개로 늘어나 폼 구조 재설계 필요(분리 입력), 팝오버는 사실상 (A)의 변형 — 버그 대비 변경 범위 과함 | 중간~높음 | 채택 안 함 |

### 10-3. 결정: (B) 항상 세로 배치 채택 — 근거

1. **기존 형제 컴포넌트와의 일관성**: `todoForm.tsx`(할 일 생성/간단수정 폼, `features/todo/components/todoForm/`)는 이미 시작일시/마감일시를 좌우 배치 없이 `InputLabel` → `Input`을 순서대로 반복하는 완전한 세로 스택으로 구현되어 있다(`DetailContent`는 `flex-direction: column`). 즉 todoDetail의 좌우 배치가 오히려 앱 안에서 예외적인 패턴이었고, 이번 변경은 두 폼 사이의 불일치를 해소하는 방향이기도 하다.
2. **버그 재현 조건 자체를 제거**: 세로 배치에서는 필드가 항상 컨테이너 전체 폭을 쓴다. 이미 모바일 구간(`InfoRow`가 `media.mobile`에서 column 전환)에서 동일한 폭 조건(패널 100%, 패딩 16px)으로 문제없이 렌더링되고 있다는 사실이, 전체 폭 세로 배치가 서브필드 잘림을 유발하지 않음을 실증한다.
3. **최소 구현 비용**: 신규 라이브러리·신규 컴포넌트 없이 기존 `FormGroup`/`Input`을 그대로 재사용한다. 색상 토큰화 스펙(2~9절)과 충돌하지 않는다.
4. (C) 컨테이너 쿼리는 더 정교하지만 이번 스코프(색상 토큰화 위주 리브랜딩)에 어울리지 않는 신규 기법 도입이라 보류한다. (A)/(D)는 버그 해결 대비 변경 범위가 과하다.

### 10-4. 변경 후 와이어프레임 (데스크톱 기준, Panel 50%)

```
│  상태 ▾              우선순위 ▾   │  ← 좌우 배치 유지 (Select, 변경 없음)
│                                    │
│  시작일시                          │
│  [ 2026. 07. 02.  --:--        ]  │  ← 전체 폭 단독
│                                    │
│  마감일시                          │
│  [ 2026. 07. 02.  --:--        ]  │  ← 전체 폭 단독
```

기존 1-1절 와이어프레임의 "시작일시 ⟷ 마감일시" 좌우 배치 줄은 위와 같이 세로 2행으로 대체된다.

### 10-5. 컴포넌트/코드 변경 스펙

`todoDetail.tsx` 212~222번 줄의 `<InfoRow>` 래핑을 제거하고, 두 `FormGroup`을 `FormContainer`의 직계 자식으로 평탄화한다(제목/설명 필드와 동일한 패턴). 더 이상 flex row가 아니므로 `style={{ flex: 1 }}` 인라인도 함께 제거한다.

```tsx
{/* 기존: <InfoRow>로 감싸고 각 FormGroup에 style={{ flex: 1 }} */}
<FormGroup>
  <Label>시작일시</Label>
  <Input type="datetime-local" {...register("startAt")} />
</FormGroup>

<FormGroup>
  <Label>마감일시</Label>
  <Input type="datetime-local" {...register("dueAt")} />
</FormGroup>
```

- `todoDetail.styles.tsx`의 `FormGroup { min-width: 0 }`(이미 반영됨)은 그대로 유지한다 — 상태/우선순위 `Select` 쌍처럼 여전히 `InfoRow` 안에 남아있는 다른 좌우 배치 row에서 동일한 오버플로우 방지 역할을 하므로 제거하지 않는다.
- `InfoRow`, `FormGroup` 컴포넌트 정의 자체는 수정하지 않는다 — 시작일시/마감일시만 `InfoRow` 밖으로 꺼내는 JSX 구조 변경일 뿐이다.
- 생성일/수정일/완료일 `InfoItem` 쌍(129~144번 줄)과 상태/우선순위 `Select` 쌍(192~210번 줄)은 이번 변경 대상이 아니다 — 그대로 좌우 배치 유지. `Select`/텍스트는 내재적 최소 폭이 작아 동일한 문제가 발생하지 않는다.

### 10-6. 시각적 일관성 재확인

폼은 이미 "좌우 짝 배치"(생성일/수정일/완료일, 상태/우선순위 Select)와 "단독 전체 폭"(제목, 설명)이 혼재되어 있었다. 시작일시/마감일시가 단독 전체 폭으로 바뀌는 것은 새로운 패턴을 추가하는 게 아니라 이미 폼 안에 존재하는 패턴(제목/설명과 동일)을 재사용하는 것이므로 전체적인 시각 언어는 오히려 더 단순해진다.

다만 "상태/우선순위(좌우)" row 바로 아래 "시작일시(단독)" "마감일시(단독)"가 연달아 오면서 좌우→세로 전환이 폼 중간에 한 번 발생한다. 두 필드가 하나의 "날짜 범위" 의미 단위임을 시각적으로 유지하기 위해, `FormContainer`의 기본 `gap: 20px`보다 두 필드 사이 간격을 살짝 좁히는 것을 권장한다(예: 두 `FormGroup`을 `gap: 12px`짜리 wrapper `div`로 묶기). 다만 이는 선택 사항이며 ui-ux-improver 판단에 맡긴다.

### 10-7. 반응형/상태 재확인

- 모바일(`media.mobile`, ≤480px): 기존과 동일하게 전체 폭 — 변경 없음.
- 태블릿(`media.tablet`, ≤768px, Panel 70%) / 데스크톱(Panel 50%): 이번 변경으로 시작일시/마감일시가 Panel 폭에 관계없이 항상 전체 폭을 사용하므로, 브라우저 창을 좁혀도 원래 버그(네이티브 위젯 서브필드 잘림)가 재현되지 않는다.
- 브라우저 자체를 극단적으로 좁게(예: 320px 미만) 줄이는 경우는 이번 스코프 밖이며, 필요 시 `Panel`에 `min-width` 안전장치를 추가하는 안을 10-9 백로그로 남긴다.

### 10-8. ui-ux-improver에게 전달할 사항 (추가)

1. `todoDetail.tsx` 212~222번 줄에서 `<InfoRow>` 래핑을 제거하고 두 `FormGroup`을 `FormContainer`의 직계 자식으로 평탄화할 것. `style={{ flex: 1 }}` 인라인 스타일도 함께 제거.
2. 다른 `InfoRow`(생성일/수정일/완료일, 상태/우선순위 Select)는 건드리지 않는다 — 이번 예외는 시작일시/마감일시 필드 쌍에 한정된다.
3. `FormGroup`의 `min-width: 0`(이미 반영됨)은 유지한다 — 상태/우선순위 Select 쌍에서 여전히 필요한 안전장치.
4. 컨테이너 쿼리(C안)나 커스텀 피커(A안)는 이번 스코프에 포함하지 않는다. 구현 중 임의로 도입하지 말 것 — 별도 논의/승인이 필요하다.
5. (선택) 시작일시/마감일시 두 `FormGroup`을 감싸는 wrapper `div`(`gap: 12px`)로 "날짜 범위" 짝 느낌을 살릴지는 ui-ux-improver 재량. 필수 아님.
6. 회귀 확인: Panel 폭 50%/70%/100% 각 구간에서 브라우저 창 폭을 좁혀가며 시작일시/마감일시 `datetime-local` 위젯이 서브필드 잘림 없이 항상 완전히 표시되는지 수동으로 확인할 것. 네이티브 위젯 렌더링 잘림은 자동 테스트로 검증하기 어려우므로 시각 확인이 필요하다.

### 10-9. 백로그 (이번 스코프 아님)

- (A) 커스텀 date/time picker 도입 — 브랜드 톤(#1D9E75/#0F6E56 계열) 캘린더 UI로 `todoForm`/`todoDetail` 양쪽에 통일 적용. 필요 시 라이브러리(예: react-datepicker) 검토. dashboard의 `FullCalendar`(월간 뷰 표시용)와는 용도가 달라 재사용 불가 — 별개 컴포넌트로 신규 설계 필요.
- (C) Panel 폭 기준 컨테이너 쿼리 — Panel에 여러 폭 구간별 세분화된 반응형이 추가로 필요해지면 재검토.
- `Panel`에 `min-width` 안전장치 추가 — 브라우저를 극단적으로 좁힌 경우 대응(우선순위 낮음).
