# SNB + MobileDrawer 리브랜딩 — 디자인 스펙

- 대상 파일: `client/src/layouts/snb/`
- 작성일: 2026-06-29
- 상태: **사용자 검토 대기** — 승인 후 ui-ux-improver가 구현

---

## 0. 변경 범위 요약

| 항목 | 현재 | 변경 후 |
|---|---|---|
| 활성 NavLink 배경 | `#e8f0fe` (파란 계열) | `#E8F5EF` (초록 계열, 브랜드 통일) |
| 활성 텍스트/아이콘 | `colors.brand.secondary` (#1D9E75) | 동일 유지 (배경과 통일) |
| 내비 레이블 (SNB) | `"list"`, `"calendar"`, `"kanban"` | `"목록"`, `"캘린더"`, `"칸반"` |
| 내비 레이블 (MobileDrawer) | `"list"`, `"calendar"`, `"kanban"` | `"목록"`, `"캘린더"`, `"칸반"` |
| SNB 접힌 상태 아이콘 | 렌더링 없음 (`{isopen && ...}` 블록 안에 있음) | 아이콘 항상 렌더링, 활성 표시 포함 |
| MobileDrawer 활성 배경 | `#e8f0fe` (파란 계열) | `#E8F5EF` (초록 계열) |

---

## 1. 화면 구조

### 1-1. SNB 펼침 상태 (width: 200px, 데스크톱)

```
┌──────────────────────┐
│  ┌──────────────────┐│
│  │  □  목록          ││  ← 비활성: bg transparent, 텍스트 #1a1a1a
│  └──────────────────┘│
│  ┌──────────────────┐│
│  │  ■  캘린더  [활성]││  ← 활성: bg #E8F5EF, 아이콘/텍스트 #1D9E75
│  └──────────────────┘│
│  ┌──────────────────┐│
│  │  □  칸반          ││  ← hover: bg #e0e0e0
│  └──────────────────┘│
│                       │
│              [◄]      │  ← 토글 버튼 (position: absolute)
└──────────────────────┘
```

### 1-2. SNB 접힘 상태 (width: 40px, 데스크톱)

현재 접힘 시 nav 아이콘이 전혀 렌더링되지 않음 — 변경 필요.
아이콘 항상 렌더링하되, 접힌 상태에서는 레이블 숨김 + 아이콘만 중앙 정렬.

```
┌────┐
│ □  │  ← 목록 (비활성)
│[■] │  ← 캘린더 (활성: bg #E8F5EF, 아이콘 #1D9E75)
│ □  │  ← 칸반 (비활성)
│    │
│[►] │  ← 토글 버튼
└────┘
```

`[■]` = 40px 정사각형 영역에 초록 배경 + 초록 아이콘

### 1-3. MobileDrawer (width: 280px, 모바일)

```
┌──────────────────────────────┐
│ (Overlay, 반투명 배경)         │
│ ┌────────────────────────┐   │
│ │  [사용자 아바타]          │   │
│ │  홍길동                  │   │
│ │  로그아웃                │   │
│ ├────────────────────────┤   │
│ │  ┌──────────────────┐  │   │
│ │  │  □  목록          │  │   │  ← 비활성
│ │  └──────────────────┘  │   │
│ │  ┌──────────────────┐  │   │
│ │  │  ■  캘린더  [활성]│  │   │  ← 활성: bg #E8F5EF, 색상 #1D9E75
│ │  └──────────────────┘  │   │
│ │  ┌──────────────────┐  │   │
│ │  │  □  칸반          │  │   │  ← 비활성
│ │  └──────────────────┘  │   │
│ └────────────────────────┘   │
└──────────────────────────────┘
```

---

## 2. 디자인 언어

### 2-1. 색상 토큰

| 용도 | 토큰 / 값 | 비고 |
|---|---|---|
| 활성 NavLink 배경 | `#E8F5EF` | brand.secondary 약 10% alpha 상당, dashboard 드래그 drop 타겟과 동일 |
| 활성 NavLink 배경 (hover 시) | `#D5EDE4` | 활성 배경보다 약간 진한 초록 tint |
| 활성 아이콘/텍스트 | `colors.brand.secondary` = `#1D9E75` | 기존 유지 |
| 비활성 기본 텍스트 | `colors.text.primary` = `#1A1A1A` | |
| 비활성 hover 배경 | `#e0e0e0` | 기존 SNB hover 값 유지 |
| SNB 컨테이너 배경 | `#f1f3f4` | 기존 유지 |
| SNB 우측 border | `#e0e0e0` | 기존 유지 |
| MobileDrawer 컨테이너 배경 | `#ffffff` | 기존 유지 |
| MobileDrawer 섹션 구분선 | `#f0f0f0` | 기존 유지 |
| 로그아웃 버튼 hover | `colors.brand.secondary` = `#1D9E75` | 기존 유지 |
| 토글 버튼 border/hover | `#e0e0e0` | 기존 유지 |

### 2-2. 간격 및 크기

| 요소 | 값 |
|---|---|
| SNB 펼침 상태 NavLink 패딩 | `10px` (기존 유지) |
| SNB 펼침 상태 NavLink gap | `10px` (기존 유지) |
| SNB 펼침 상태 NavLink font-size | `20px` (기존 유지) |
| SNB 펼침 상태 NavLink font-weight | `500` (기존 유지) |
| SNB 펼침 상태 NavLink border-radius | `8px` (기존 유지) |
| SNB 접힘 상태 아이콘 컨테이너 | `36px × 36px`, 중앙 정렬, border-radius `8px` |
| SNB 접힘 상태 아이콘 컨테이너 margin | `2px auto` (좌우 자동으로 수평 중앙 정렬) |
| 모든 인터랙티브 요소 최소 터치 타겟 | `44px` height 기준 |
| MobileDrawer NavNavLink 패딩 | `12px 10px` (기존 유지) |
| MobileDrawer NavNavLink gap | `12px` (기존 유지) |
| MobileDrawer NavNavLink font-size | `16px` (기존 유지) |
| MobileDrawer NavNavLink border-radius | `8px` (기존 유지) |

### 2-3. 타이포그래피

기존 시스템 상속, 별도 폰트 도입 없음.
레이블 변경 (`"list"` → `"목록"` 등)은 string 교체만으로 충분.

### 2-4. 애니메이션/트랜지션

| 요소 | 트랜지션 |
|---|---|
| SNB 너비 전환 | `all 0.3s ease` (기존 유지) |
| NavLink hover/active 배경 전환 | `background-color 0.15s ease` 추가 권장 |
| MobileDrawer slideIn/slideOut | `0.25s ease` (기존 keyframes 유지) |
| MobileDrawer Overlay fadeIn/fadeOut | `0.2s ease` (기존 keyframes 유지) |

---

## 3. 컴포넌트 설계

### 3-1. `snb.tsx` 수정

**NAV_ITEMS 레이블 변경:**
```ts
const NAV_ITEMS = [
  { path: "/todo",      icon: <ListCheckIcon />,     label: "목록" },
  { path: "/calendar",  icon: <CalendarCheckIcon />,  label: "캘린더" },
  { path: "/kanban",    icon: <KanbanIcon />,         label: "칸반" },
];
```

**렌더링 구조 변경 (접힘 상태 아이콘 표시 + Option B 패턴 확정):**

현재 `{isopen && (...)}` 블록 안에 모든 NavLink가 있어 접힌 상태에서 아이콘이 보이지 않음.
NavLink의 children을 함수형으로 변경해 `isActive`를 직접 받는 방식(Option B)으로 확정.
추가 훅이나 컴포넌트 분리 없이 `$active` prop을 `IconWrapper`에 전달할 수 있음.

```tsx
{NAV_ITEMS.map(({ path, icon, label }) => (
  <SidebarNavLink key={path} to={path} $isopen={isopen}>
    {({ isActive }) => (
      <>
        <IconWrapper $isopen={isopen} $active={isActive}>
          {icon}
        </IconWrapper>
        {isopen && <span>{label}</span>}
      </>
    )}
  </SidebarNavLink>
))}
```

`SidebarNavLink`에 `$isopen` prop 추가 → 접힌 상태에서 레이아웃(패딩, justify-content) 조정.
`IconWrapper` 신규 추가 → 접힌 상태에서 활성 배경을 아이콘 주변에만 표시하기 위한 래퍼.

### 3-2. `snb.tsx` 인터페이스 정의

**SidebarNavLink (수정):**
```ts
const SidebarNavLink = styled(NavLink)<{ $isopen: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ $isopen }) => ($isopen ? "10px" : "0")};
  padding: ${({ $isopen }) => ($isopen ? "10px" : "4px")};
  justify-content: ${({ $isopen }) => ($isopen ? "flex-start" : "center")};
  cursor: pointer;
  font-size: 20px;
  font-weight: 500;
  color: #1a1a1a;
  background-color: transparent;
  border-radius: 8px;
  text-decoration: none;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: #e0e0e0;
  }

  &.active {
    color: ${colors.brand.secondary};

    ${({ $isopen }) =>
      $isopen
        ? `background-color: #E8F5EF;
           &:hover { background-color: #D5EDE4; }`
        : `&:hover { background-color: transparent; }`}
  }
`;
```

> 접힘 상태(`!$isopen`)에서는 `SidebarNavLink` 자체에 활성 배경을 주지 않음. 대신 `IconWrapper`에 `$active` prop으로 배경을 표시.

**IconWrapper (신규):**
```ts
const IconWrapper = styled.span<{ $isopen: boolean; $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ $isopen }) => ($isopen ? "auto" : "36px")};
  height: ${({ $isopen }) => ($isopen ? "auto" : "36px")};
  border-radius: 8px;
  flex-shrink: 0;
  transition: background-color 0.15s ease;

  /* 접힘 상태에서만 IconWrapper에 직접 배경 표시 */
  ${({ $isopen, $active }) =>
    !$isopen && $active
      ? `background-color: #E8F5EF; color: ${colors.brand.secondary};`
      : ""}
`;
```

### 3-3. `mobileDrawer.styles.tsx` 수정

**NavNavLink (수정):**
```ts
export const NavNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 10px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: #1a1a1a;
  background-color: transparent;
  border-radius: 8px;
  text-decoration: none;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: #f1f3f4;
  }

  &.active {
    color: ${colors.brand.secondary};
    background-color: #E8F5EF;        /* #e8f0fe → #E8F5EF 로 교체 */

    &:hover {
      background-color: #D5EDE4;      /* #e8f0fe hover 유지 대신 초록 tint로 교체 */
    }
  }
`;
```

**NavItem (수정) — MobileDrawer에서 직접 사용 여부 확인 필요:**

`mobileDrawer.tsx`를 보면 `NavItem`은 import되지 않고 `NavNavLink`만 사용됨.
`NavItem` 컴포넌트는 현재 미사용 상태이므로 색상 수정만 반영하고 제거 여부는 추후 판단.

```ts
export const NavItem = styled.div<{ $active?: boolean }>`
  /* ... 기존 구조 유지 ... */
  color: ${({ $active }) => ($active ? colors.brand.secondary : "#1a1a1a")};
  background-color: ${({ $active }) => ($active ? "#E8F5EF" : "transparent")};  /* 변경 */

  &:hover {
    background-color: ${({ $active }) => ($active ? "#D5EDE4" : "#f1f3f4")};    /* 변경 */
  }
`;
```

### 3-4. `mobileDrawer.tsx` 수정

**NAV_ITEMS 레이블 변경:**
```ts
const NAV_ITEMS = [
  { path: "/todo",      icon: <ListCheckIcon size={20} />,     label: "목록" },
  { path: "/calendar",  icon: <CalendarCheckIcon size={20} />,  label: "캘린더" },
  { path: "/kanban",    icon: <KanbanIcon size={20} />,         label: "칸반" },
];
```

---

## 4. 상태 정의

### 4-1. SNB 펼침 상태 — 3가지 NavLink 상태

| 상태 | 배경색 | 텍스트/아이콘 색 |
|---|---|---|
| 기본 (default) | `transparent` | `#1A1A1A` |
| hover (비활성) | `#e0e0e0` | `#1A1A1A` |
| 활성 (active) | `#E8F5EF` | `#1D9E75` |
| 활성 + hover | `#D5EDE4` | `#1D9E75` |

### 4-2. SNB 접힘 상태 — 아이콘 컨테이너 상태

| 상태 | IconWrapper 배경 | 아이콘 색 |
|---|---|---|
| 기본 | `transparent` | `#1A1A1A` |
| hover (비활성) | `#e0e0e0` | `#1A1A1A` |
| 활성 | `#E8F5EF` | `#1D9E75` |
| 활성 + hover | `#D5EDE4` | `#1D9E75` |

### 4-3. MobileDrawer NavNavLink 상태

| 상태 | 배경색 | 텍스트/아이콘 색 |
|---|---|---|
| 기본 (default) | `transparent` | `#1A1A1A` |
| hover (비활성) | `#f1f3f4` | `#1A1A1A` |
| 활성 (active) | `#E8F5EF` | `#1D9E75` |
| 활성 + hover | `#D5EDE4` | `#1D9E75` |

### 4-4. 토글 버튼 (SidebarButton) 상태

변경 없음. 기존 `border: 1px solid #e0e0e0`, hover `background-color: #e0e0e0` 유지.

---

## 5. 모바일 대응

MobileDrawer는 `breakpoints.ts`의 tablet 이하(`≤1024px`)에서 표시됨. SNB는 tablet 이상에서만 표시 (`${media.tablet} { display: none }`).
MobileDrawer의 최소 터치 타겟은 NavNavLink의 `padding: 12px 10px`으로 충분한 높이(약 44px+) 확보됨 — 추가 조정 불필요.

---

## 6. 디자인 토큰 매핑

| 항목 | 사용 토큰 | 실제 값 |
|---|---|---|
| 활성 배경 | 인라인 `#E8F5EF` | brand.secondary 10% alpha 상당 (dashboard 스펙과 동일 값) |
| 활성 hover 배경 | 인라인 `#D5EDE4` | brand.secondary 15% alpha 상당 |
| 활성 텍스트/아이콘 | `colors.brand.secondary` | `#1D9E75` |
| 비활성 텍스트 | `colors.text.primary` | `#1A1A1A` |
| 보조 텍스트 (로그아웃) | `colors.text.secondary` | `#5F6368` |
| border | 인라인 `#e0e0e0` | 기존 유지 (colors.ts에 `border` 기본 키 없음) |
| SNB 배경 | 인라인 `#f1f3f4` | 기존 유지 |

> `colors.ts`에 `border.primary` 또는 `nav.activeBg` 같은 신규 토큰을 추가할 필요는 없음. 기존 스펙(dashboard)에서도 `#E8F5EF`는 인라인 값으로 관리하므로 동일 패턴을 따름.

---

## 7. 수정 파일 목록

| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `layouts/snb/snb.tsx` | 수정 | NAV_ITEMS 레이블 한국어, 접힘 상태 아이콘 렌더링 조건 변경, IconWrapper 추가, SidebarNavLink 활성 배경 수정 |
| `layouts/snb/mobileDrawer.styles.tsx` | 수정 | NavNavLink / NavItem 활성 배경색 `#e8f0fe` → `#E8F5EF`, hover 배경 `#D5EDE4` |
| `layouts/snb/mobileDrawer.tsx` | 수정 | NAV_ITEMS 레이블 한국어 |

---

## 8. 접근성 요구사항

- SNB 토글 버튼: 기존 `aria-label={isopen ? "사이드바 닫기" : "사이드바 열기"}` 유지
- NavLink: 각 아이콘에 `aria-hidden="true"` 추가, 텍스트 레이블이 시각적으로 표시되므로 별도 aria-label 불필요
- SNB 접힘 상태 (레이블 숨김): 레이블 텍스트가 조건부 렌더링으로 숨겨지므로, 접근성을 위해 `IconWrapper`에 `title={label}` 또는 `aria-label={label}` 추가 권장
  ```tsx
  <IconWrapper
    $isopen={isopen}
    $active={isActive}
    aria-label={!isopen ? label : undefined}
  >
    {icon}
  </IconWrapper>
  ```
- MobileDrawer NavNavLink: `onClick={handleClose}` 기존 유지 (드로어 닫기 동작 유지)
- MobileDrawer Overlay: 기존 `onClick={handleClose}` 유지 (배경 클릭으로 닫기)

---

## 9. ui-ux-improver에게 전달할 사항

1. **핵심 변경 — 색상**: `#e8f0fe`를 `#E8F5EF`로 교체. `mobileDrawer.styles.tsx`에 2곳, `snb.tsx`에 1곳. 단순 문자열 치환.

2. **핵심 변경 — 레이블**: `"list"` → `"목록"`, `"calendar"` → `"캘린더"`, `"kanban"` → `"칸반"`. `snb.tsx`와 `mobileDrawer.tsx` 각각 1곳씩.

3. **SNB 접힘 상태 아이콘 렌더링 — 구조 변경 필요**:
   현재 `{isopen && (<>...</>)}` 블록이 모든 NavLink를 감싸고 있어, 접힌 상태에서 아이콘이 전혀 렌더링되지 않음. 이 조건을 제거하고 항상 NavLink를 렌더링하되 `$isopen` prop으로 레이아웃을 분기해야 함.

4. **접힌 상태 아이콘 활성 표시 — NavLink children 함수 패턴(Option B) 확정**:
   NavLink의 children을 함수로 작성하면 `isActive`를 직접 받을 수 있음. 추가 훅이나 컴포넌트 분리 없이 `IconWrapper`에 `$active` prop을 전달할 수 있어 이 방식으로 확정.
   ```tsx
   <SidebarNavLink key={path} to={path} $isopen={isopen}>
     {({ isActive }) => (
       <>
         <IconWrapper $isopen={isopen} $active={isActive}>
           {icon}
         </IconWrapper>
         {isopen && <span>{label}</span>}
       </>
     )}
   </SidebarNavLink>
   ```
   단, children 함수 패턴 사용 시 `SidebarNavLink`에 `&.active` CSS가 있어도 `isActive` 판단은 React Router가 자체적으로 처리하므로 둘이 충돌하지 않음.

5. **SNB 펼침 상태 `SidebarNavLink` 활성 배경**: `&.active` 방식으로 처리 가능 — 색상 값만 교체하면 됨. 접힘 상태에서는 `&.active`에 배경을 주지 않고 `IconWrapper $active` prop으로만 처리.

6. **`transition: background-color 0.15s ease` 추가**: 현재 SNB NavLink에 트랜지션이 없어 hover 시 배경 전환이 딱딱함. MobileDrawer와 마찬가지로 추가 권장.

7. **`SidebarButton` 배경색**: 현재 `background-color`가 명시되지 않아 투명임. 기존 동작 유지 (변경 없음).

8. **`NavItem` 컴포넌트**: `mobileDrawer.styles.tsx`에 정의되어 있으나 `mobileDrawer.tsx`에서 import/사용되지 않음. 이번 스펙에서는 색상 수정만 반영하며, 미사용 여부 정리는 별도 리팩토링 범위로 남김.
