# ToDoDo 리브랜딩 스펙 — 모바일 "오늘" 화면 (Teal)

- 시안 소스: `tododo_mobile_planner_teal.html` (정적 HTML 목업, Tabler Icons 가정)
- 작업 범위: ① 전역 디자인 토큰 도입 ② 모바일 "오늘" 화면 신규 구현 ③ 모바일 하단 탭바 신규 도입
- 상태: **설계 완료 / 구현 대기**. 사용자 승인 후 ui-ux-improver가 구현.

---

## 0. 현재 코드베이스 조사 결과 (Gap 분석 근거)

### 0-1. 디자인 토큰 시스템
- `ThemeProvider`/`GlobalStyle` 없음. styled-components를 사용하지만 테마 객체가 존재하지 않음.
- 존재하는 토큰 파일은 2개뿐:
  - `client/src/styles/statusColors.ts` — todo/doing/done 상태 색상만 정의 (main/light/border)
  - `client/src/styles/breakpoints.ts` — `mobile(480)/tablet(768)/desktop(1024)` + `media` 헬퍼
- 브랜드 컬러는 **`#1c72eb` (블루)** 가 22개 파일에 하드코딩되어 분산. 그 외 텍스트/보더 색상(`#1a1a1a`, `#5f6368`, `#e0e0e0`, `#666`, `#9aa0a6` 등)도 각 styles 파일에 중복 정의됨.
- CSS 변수(`--color-*`, `--border-radius-*`, `--font-sans`) 시스템은 **존재하지 않음**. 시안의 변수명은 새로 도입해야 함.
- radius 값도 컴포넌트마다 제각각(`6px`, `8px`, `12px`, `50%`, `99px`)이며 통일된 scale 없음.

### 0-2. 모바일 네비게이션 구조
- 하단 탭바는 **존재하지 않음**.
- 현재 모바일 처리: `tablet(768px)` 이하에서 좌측 SNB가 사라지고, `Header`의 햄버거 버튼 → `MobileDrawer`(좌측 슬라이드 오버레이, NavLink 4개: list/calendar/chart/kanban)로 대체됨.
- `HomePage.tsx`는 `isMobile`(useMediaQuery("tablet")) 분기로 데스크톱은 `ResizeableLayout`(3분할: TodoList/DueTodo/PieChart), 모바일은 `MobileHomePage`(상단 탭 3개: 할 일/마감 임박/차트)를 렌더링. 시안의 "오늘" 단일 화면 + 하단 탭바 구조와는 완전히 다른 패턴.
- `App.tsx`가 `Header` + `SNB` + `Outlet` + `Footer` + `MobileDrawer`를 항상 렌더링하는 공통 셸. 모바일 전용 셸(헤더+하단탭바, Footer 제외)은 없음.

### 0-3. "오늘" / 홈 화면 현황
- `client/src/pages/MobileHomePage.tsx`: 상단 탭(할 일/마감 임박/차트) 전환형 UI. 시안의 "주간 스트립 + 진행률 + 진행중/완료 리스트" 구조와 다름 → **신규로 다시 설계**해야 함(완전 대체 또는 신규 라우트 분리 필요, 아래 3-1 결정사항 참고).
- 데스크톱용 `DueTodo`(`features/todo/components/dueTodo.tsx`)가 "마감 임박" 배지 로직(`getDaysLeft`, `getDueBadgeLabel`, `DUE_SOON_DAYS=3`)을 이미 보유 — 시안의 "38일 초과" 배지와 동일한 패턴이라 그대로 재사용 가능.
- `StatusSelect`(`features/todo/components/todoListItem/statusSelect.tsx`)가 상태 변경 BottomSheet UI를 이미 보유 — 시안의 원형 체크박스와는 다른 패턴(상태 3종 vs 체크 토글)이라 신규 컴포넌트 필요.

### 0-4. 아이콘 라이브러리
- **`lucide-react`** 사용 중. 시안은 Tabler Icons(`ti ti-*`) 기준이나 이는 목업 생성 도구의 기본값으로 추정.
- **결정: Tabler Icons를 새로 도입하지 않고 lucide-react로 매핑한다** (의존성 추가 비용 대비 이점 없음, 기존 전체 코드베이스와의 일관성 우선).
  - `ti-sun` → `Sun`
  - `ti-list-check` → `ListChecks` (기존 SNB에서는 `ListCheckIcon` 별칭 사용 중)
  - `ti-chart-pie` → `PieChart`
  - `ti-layout-kanban` → `LayoutDashboard` 또는 `Trello`(lucide-react에 `LayoutKanban` 없음 — 대체 필요, 아래 1-5 참고)
  - `ti-check` → `Check`

### 0-5. 데이터 모델 매핑 검증
- 시안 "투두두 프로젝트" (하위 텍스트) → 현 데이터 모델에는 "프로젝트" 엔티티가 없음. `parentId`는 하위 할 일(subtask) 계층만 표현하며 "프로젝트 그룹"이 아님.
  - **결론: 이번 리브랜딩 범위에서는 "프로젝트명" 서브텍스트를 그대로 구현하지 않는다.** 데이터 모델에 없는 개념이므로 임의로 지어내면 잘못된 정보. 대체로 `description`(있는 경우) 또는 빈 값 처리. 신규 "프로젝트" 개념 도입은 별도 PM 논의 필요 — 범위 제외.
- 시안 "오후 2시" (마감 시간 표시) → `dueAt`에서 시간 파싱 가능. `dueAt`이 자정(00:00) 데이터인 기존 레코드가 많을 경우 "시간 없음" 처리 필요 (아래 3-3 참고).
- 시안 "38일 초과" 배지 → `getDaysLeft(dueAt)` + `getDueBadgeLabel`로 이미 구현된 로직과 100% 일치. 그대로 재사용.
- 시안 "2/5 완료" + 진행률 바 → `status === "done"` 카운트 / 오늘 날짜에 해당하는 todo 전체 카운트로 계산. "오늘 날짜에 해당하는 todo"의 기준은 `dueAt`이 해당 날짜인 것으로 정의(아래 1-2 참고).
- 시안 "완료" 섹션 체크 아이콘 → `status === "done"`이며 `doneAt` 존재. 정렬 기준은 `doneAt` desc 권장.
- 주간 스트립의 "일정 있는 날 dot 마커" → 해당 날짜에 `dueAt`이 있는 todo 존재 여부. 레드 dot(위험)은 그 날짜에 마감 임박/초과(`getDaysLeft <= 0`) 항목이 있는 경우로 정의.

---

## 1. 디자인 토큰 정의

### 1-1. 신규 파일: `client/src/styles/colors.ts`
시안의 CSS 변수명을 의미 기반 토큰명으로 채택하고 실제 값을 확정한다. 기존 `statusColors.ts`는 유지하되 동일한 의미 축(예: `done`)에 모순 없도록 정리한다.

```ts
export const colors = {
  brand: {
    primary: "#0F6E56",   // 딥 틸 — 로고, 오늘 날짜 하이라이트, 활성 탭 아이콘
    secondary: "#1D9E75", // 밝은 틸 — 진행률 바, 완료 체크 배경
  },
  danger: {
    main: "#E24B4A",      // 레드 — 마감 초과/위험 dot, 배지 보더
    background: "#FBEAEA", // 레드 배경(배지) — 신규 산정값, 디자이너 검토 필요(시안에 실값 없음)
    text: "#C53A39",        // 레드 텍스트(배지) — 신규 산정값, 디자이너 검토 필요(시안에 실값 없음)
  },
  background: {
    primary: "#FFFFFF",
    secondary: "#F4F5F6",   // 진행률 바 배경, 아바타 배경 등
  },
  text: {
    primary: "#1A1A1A",
    secondary: "#5F6368",
    tertiary: "#9AA0A6",    // 날짜 스트립 비활성, 보조 라벨
  },
  border: {
    secondary: "#D1D5DB",   // 체크박스 미체크 보더
    tertiary: "#E5E7EB",    // 리스트 구분선, 카드 보더
    danger: "#E24B4A",      // 위험 항목 체크박스 보더
  },
} as const;
```

> **확인 필요 사항(승인 시 결정)**: 시안 HTML에는 `--color-background-danger`, `--color-text-danger`, `--color-border-secondary` 등의 실제 값이 정의되어 있지 않았다(변수명만 존재). 위 표의 danger 배경/텍스트 값은 브랜드 레드(`#E24B4A`)에서 합리적으로 도출한 추정값이다. 디자이너 검토 시 확정 필요.

### 1-2. 신규 파일: `client/src/styles/radius.ts`
```ts
export const radius = {
  sm: "6px",   // 날짜 스트립 셀, 배지
  md: "8px",   // 카드, 배지(시안 --border-radius-md)
  xl: "20px",  // 모바일 화면 컨테이너 라운드(시안 --border-radius-xl, 데스크톱 프리뷰 프레임용 — 실제 모바일 풀스크린에서는 미적용)
  full: "50%", // 원형(체크박스, 아바타)
} as const;
```

### 1-3. 타이포그래피
신규 폰트 도입 없음. 시안의 `--font-sans`는 시스템 기본 산세리프로 간주하고 별도 웹폰트 로드는 하지 않는다(기존 프로젝트에 폰트 로드 코드 없음 확인됨). 폰트 크기 스케일만 컴포넌트 설계에서 직접 px 지정(아래 2장 참고) — 별도 typography 토큰 파일은 이번 범위에서 생성하지 않음(과설계 방지, 추후 필요 시 확장).

### 1-4. `statusColors.ts` 와의 관계
- `statusColors.done.main = "#10b981"`(현재)과 시안의 완료 체크 색상 `#1D9E75`(brand.secondary)는 다른 값.
- **결정: `statusColors.done.main`을 `#1D9E75`로 통일한다.** 리스트뷰(`StatusSelect`)와 모바일 "오늘" 화면에서 "완료"가 다른 초록색으로 보이는 불일치를 제거. `statusColors.doing`, `statusColors.todo`는 이번 범위에서 변경하지 않음(시안에 해당 상태 표현 없음, 별도 작업으로 분리).

### 1-5. 아이콘 매핑 확정
| 시안 (Tabler) | lucide-react | 용도 |
|---|---|---|
| `ti-sun` | `Sun` | 하단 탭 "오늘" |
| `ti-list-check` | `ListChecks` | 하단 탭 "목록" (기존 SNB `ListCheckIcon`과 동일 아이콘, import명 통일 권장) |
| `ti-chart-pie` | `PieChart` | 하단 탭 "차트" |
| `ti-layout-kanban` | `LayoutDashboard` | 하단 탭 "칸반" — lucide-react에 정확한 kanban 아이콘 없음. `LayoutDashboard`로 대체(기존 SNB는 `KanbanIcon`을 쓰고 있으나 이는 lucide의 실제 export명이 아닐 수 있음 — **ui-ux-improver는 구현 시 `lucide-react` 패키지에 실제로 존재하는 export인지 빌드 타임에 검증할 것**) |
| `ti-check` | `Check` | 완료 체크 아이콘 |

---

## 2. 화면 구조 — 모바일 "오늘" 화면

### 2-1. 라우팅 결정
- 신규 라우트: `/today` (모바일 전용 진입점). 기존 `/`(HomePage)의 모바일 분기(`MobileHomePage`, 상단 탭형)는 이번 리브랜딩에서 **교체**한다.
- 데스크톱(`tablet` 이상)에서는 기존 `ResizeableLayout` 3분할 그대로 유지 — 이번 스펙은 모바일(`tablet` 이하, ≤768px) 범위만 다룬다.
- `useMediaQuery("tablet")` 분기 유지: `isMobile === true`일 때 신규 `TodayPage`(가칭) 렌더링.

### 2-2. ASCII 와이어프레임

```
┌─────────────────────────────────────┐
│ [틸 로고24] tododo          (수영)○ │  ← 헤더, 56px
├─────────────────────────────────────┤
│ 일14  [월15●]  화16˙ 수17  목18˙ 금19 토20 │  ← 주간 스트립, 가로 스크롤
├─────────────────────────────────────┤
│ 6월 15일, 오늘            2 / 5 완료 │  ← 날짜 타이틀 + 완료율(틸)
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← 진행률 바 6px
├─────────────────────────────────────┤
│ 진행 중                              │
│ ○  투두두                  오후 2시  │
│    투두두 프로젝트                   │
│ ○  블로그 글쓰기            오후 6시  │
│    블로그 글쓰기 프로젝트             │
│ ○  마카이브            [38일 초과]   │  ← 레드 보더 + 레드 배지
│    마카이브 프로젝트                  │
├─────────────────────────────────────┤
│ 완료                                 │
│ ●✓ 버그 픽스: 리다이렉트 수정 (취소선)│
│ ●✓ 디자인 시안 검토 (취소선)         │
├─────────────────────────────────────┤
│  ☀오늘   ☑목록   ◔차트   ▦칸반      │  ← 하단 탭바, 활성=틸
└─────────────────────────────────────┘
```

### 2-3. 데스크톱과의 관계
- 헤더(로고+아바타)와 하단 탭바는 **모바일 전용**. 데스크톱 `Header`(로고+사용자명+로그아웃 텍스트)와 `SNB`는 변경하지 않음 — 이번 스펙 범위 밖.
- "오늘" 화면 자체(주간 스트립~완료 리스트)는 모바일 전용 신규 화면이며 데스크톱에 대응 화면 없음(데스크톱은 기존 3분할 유지).

---

## 3. 컴포넌트 설계

### 3-0. 디렉토리 구조 제안
```
client/src/features/today/              # 신규 feature
├── components/
│   ├── weekStrip.tsx
│   ├── weekStrip.styles.tsx
│   ├── dailyProgress.tsx
│   ├── dailyProgress.styles.tsx
│   ├── todaySection.tsx          # "진행 중"/"완료" 섹션 공용
│   ├── todaySection.styles.tsx
│   ├── todayTodoItem.tsx
│   └── todayTodoItem.styles.tsx
├── hooks/
│   └── useTodayTodos.ts          # 오늘자 todos 필터링 + 진행률 계산
└── pages/
    └── todayPage.tsx

client/src/layouts/bottomTabBar/         # 신규 (layouts 하위, App 셸 레벨)
├── bottomTabBar.tsx
└── bottomTabBar.styles.tsx
```

`features/todo`의 기존 자산(타입, `useTodo`, `DUE_SOON_DAYS`/`getDaysLeft`/`getDueBadgeLabel`)을 import해서 사용 — 중복 구현 금지.

### 3-1. `App.tsx` 변경 방향 (모바일 전용 하단 탭바 삽입)
- 모바일(`isMobile`)일 때만 `BottomTabBar`를 `Footer` 대신 렌더링. 데스크톱 `Footer`(GitHub/Contact 링크)는 모바일에서 의미가 낮으므로 유지 여부는 PM 확인 필요 — **기본 제안: 모바일에서는 `Footer` 숨기고 `BottomTabBar`로 대체**.
- 모바일에서 `Header`도 시안처럼 "로고+아바타만" 보이는 축약형으로 바꿀지, 기존 `Header`(로그아웃 버튼 포함)를 유지할지 결정 필요 — **기본 제안: 모바일 전용 `MobileHeader` 신규 컴포넌트(로고 24px 틸 라운드사각형 + "tododo" 텍스트 + 우측 아바타, 클릭 시 기존 `MobileDrawer` 오픈)** 도입. 기존 `MobileDrawer`(로그아웃/네비) 진입점을 아바타 클릭으로 변경.
- `MobileHomePage.tsx`(상단 탭형)는 신규 `TodayPage` 도입 후 더 이상 `/` 라우트에서 쓰이지 않게 됨. 완전 삭제 여부는 다른 화면(목록/차트 탭 전환 UX)이 하단 탭바로 대체되는 시점에 결정 — **이번 범위에서는 파일을 삭제하지 않고 미사용 상태로 둔 뒤, 하단 탭바 라우팅 전환이 끝나면 후속 작업에서 제거**.

### 3-2. `WeekStrip`
```ts
interface WeekStripProps {
  selectedDate: string;       // ISO yyyy-MM-dd
  markers: Record<string, "none" | "normal" | "danger">; // 날짜별 dot 색상
  onSelectDate: (date: string) => void;
}
```
- 7일 = 선택된 날짜를 중심으로 일~토 1주(시안과 동일, 일요일 시작 가정 — 기존 코드베이스에 주 시작 요일 설정 없음, 신규 결정 필요시 PM 확인).
- 가로 스크롤 가능 (`overflow-x: auto`), 각 셀 너비 38px, gap 8px — 시안 그대로.
- 오늘 셀: `background: colors.brand.primary`, 텍스트 `#fff`. 비활성 셀: `color: colors.text.tertiary`.
- dot 마커: `normal` → `colors.brand.primary` 4px 원, `danger` → `colors.danger.main` 4px 원. 둘 다 없으면 dot 미표시.
- 터치 타겟: 셀 전체 클릭 가능 영역 최소 44px height 확보 위해 `padding: 8px 0` + 내부 컨텐츠로 시안의 38x~46px 셀을 44px 이상으로 보정(시안은 시각 목업이라 44px 터치 타겟 미고려 — **ui-ux-improver는 셀 높이를 44px 이상으로 확보할 것**).

### 3-3. `DailyProgress`
```ts
interface DailyProgressProps {
  dateLabel: string;     // "6월 15일, 오늘"
  doneCount: number;
  totalCount: number;    // 오늘 dueAt 기준 todo 전체 개수
}
```
- 완료율 텍스트: `${doneCount} / ${totalCount} 완료`, 색상 `colors.brand.primary`, 13px/500.
- 진행률 바: height 6px, radius 3px, 배경 `colors.background.secondary`, 채움 `colors.brand.secondary`, width `${(doneCount/totalCount)*100}%`. `totalCount === 0`이면 바를 0%로 렌더링(빈 상태는 3-6 참고).
- 날짜 타이틀 포맷: 기존 코드베이스에 날짜 포맷 유틸 부재 확인됨 — `Intl.DateTimeFormat` 또는 신규 `formatTodayLabel` 유틸 추가 필요(`shared/utils`).

### 3-4. `TodaySection` (진행 중 / 완료 공용 섹션 래퍼)
```ts
interface TodaySectionProps {
  title: "진행 중" | "완료";
  children: React.ReactNode;
}
```
- 섹션 타이틀: 12px/500, `colors.text.tertiary`, margin-bottom 8px.

### 3-5. `TodayTodoItem`
```ts
interface TodayTodoItemProps {
  todo: Todo;
  onToggleDone: (todo: Todo) => void; // 원형 체크박스 클릭 → status를 done/todo로 토글
  onClick: (todo: Todo) => void;       // 항목 클릭 → 상세 이동
}
```
- 미완료 상태: 18px 원형 체크박스(미체크) — 보더만, `colors.border.secondary`(일반) / `colors.border.danger`(마감 초과·위험).
  - **위험 판정 기준**: `getDaysLeft(todo.dueAt) < 0` (마감 초과)일 때 danger 보더 적용. 시안의 "마카이브" 항목처럼 보더만 레드, 텍스트는 기본색 유지.
- 완료 상태: 18px 원형, 배경 `colors.brand.secondary`, 내부 `Check` 아이콘(lucide) 12px 흰색.
- 텍스트: 제목 14px, 완료 시 `text-decoration: line-through` + `color: colors.text.tertiary`.
- 서브텍스트(시안의 "프로젝트명"): **이번 범위에서 미구현**(0-5 참고). 대신 `todo.description`이 있으면 1줄 표시, 없으면 서브텍스트 자체를 렌더링하지 않음(레이아웃은 서브텍스트 유무에 따라 가변).
- 우측 영역: `dueAt` 존재 + 시간 정보 있음 → "오후 2시" 포맷(`오전/오후 N시`), `getDaysLeft < 0`이면 기존 `DueBadge`/`getDueBadgeLabel` 재사용(레드 배경 배지, "N일 초과" 텍스트는 이미 일치). `dueAt` 없으면 우측 영역 비표시.
- 한 줄 높이: 시안은 `padding: 12px 0`이나 콘텐츠 높이가 44px 미만일 수 있음 — **ui-ux-improver는 row 전체 클릭 영역을 최소 44px로 보정**.
- 클릭 시 상세 이동은 기존 `TodoListItem`과 동일 패턴(`navigate(/todo/${id})`) 재사용.

### 3-6. 빈 상태 / 로딩 / 에러
- **로딩**: `shared/ui/skeleton`에 todo 리스트용 skeleton이 없음(현재 `checkboxSkeleton`, `kanbanSkeleton`만 존재) → 신규 `todayItemSkeleton` 추가 필요(체크박스 원형 + 텍스트 바 2개 placeholder, shimmer 애니메이션은 기존 skeleton 컴포넌트 패턴 따름).
- **에러**: 기존 `useToast`(`shared/ui/toast`) 패턴 재사용. "할 일을 불러오지 못했습니다" + 토스트 내 재시도 액션 또는 화면 중앙에 재시도 버튼(기존 `EmptyState` 컴포넌트의 `actionLabel`/`onAction` 패턴 재사용 가능).
- **빈 상태(오늘 할 일 없음)**: 기존 `shared/ui/emptyState/EmptyState` 재사용.
  - icon: lucide `Sun` 또는 `CheckCircle`
  - title: "오늘 할 일이 없습니다"
  - description: "여유로운 하루네요. 새로운 할 일을 추가해보세요"
  - actionLabel: "새 할 일 추가" / actionIcon: `Plus` / onAction: 할 일 추가 모달 오픈(기존 `TodoForm` 재사용)

### 3-7. `BottomTabBar` (신규, layouts)
```ts
interface BottomTabBarProps {
  // 별도 props 없음 — NavLink 기반, react-router 활성 경로로 자동 판정
}
```
- 4개 탭: 오늘(`/today`), 목록(`/todo`), 차트(`/pie-chart`), 칸반(`/kanban`) — 기존 라우트 경로 그대로 사용(시안 라우팅 신규 추가 없음, `/today`만 신규).
- 활성 탭: `color: colors.brand.primary`, `font-weight: 500`.
- 비활성 탭: `color: colors.text.tertiary`.
- 아이콘 20px, 라벨 11px, `flex-direction: column`, `gap: 4px`.
- `position: fixed; bottom: 0;`, `border-top: 0.5px solid colors.border.tertiary`, `background: colors.background.primary`, `padding: 10px 0`, `justify-content: space-around`.
- 각 탭 터치 영역 최소 44px height 확보(아이콘+라벨+패딩 합산 검증 필요 — 현재 시안 수치로는 약 44px 근접, ui-ux-improver가 실측 후 패딩 보정).
- `Main` 컨텐츠 영역은 `BottomTabBar` 높이만큼 `padding-bottom` 보정 필요(겹침 방지).

---

## 4. 인터랙션 정의

| 요소 | 인터랙션 |
|---|---|
| 주간 스트립 날짜 셀 | 클릭 → 해당 날짜를 `selectedDate`로 설정, "오늘" 화면 데이터 갱신(다른 날짜 조회는 이번 범위에서 UI만 대응, 실제 미래/과거 날짜 todo 필터링 로직은 `useTodayTodos`에서 `dueAt` 기준 day-match로 구현) |
| 원형 체크박스(진행 중 항목) | 클릭 → `status: "done"`로 변경, `doneAt` 현재시각 세팅, 완료 섹션으로 이동(애니메이션: 기존 코드베이스에 리스트 reorder 애니메이션 없음 — 신규 도입하지 않고 즉시 리렌더링) |
| 완료 항목 체크 아이콘 | 클릭 → `status: "todo"`로 되돌리기(토글), `doneAt: null` |
| 항목 텍스트 영역 클릭 | `/todo/:id` 상세 이동(기존 `TodoDetail` 라우트, 모바일에서도 동일 패턴 유지) |
| 하단 탭바 탭 클릭 | 라우트 이동, `NavLink` active 스타일 자동 적용 |
| 아바타 클릭(헤더) | 기존 `MobileDrawer` 오픈(로그아웃 등 부가 메뉴) |
| 진행률 바 | 인터랙션 없음(읽기 전용 표시) |

전환 애니메이션: 기존 코드베이스는 `MobileDrawer`에만 `keyframes` 기반 슬라이드/페이드(0.2~0.25s ease)를 사용 중. "오늘" 화면 내 신규 컴포넌트는 **애니메이션을 추가하지 않는다**(과설계 방지, 기존 패턴 일관성 유지). 단, 체크박스 토글 시 색상 전환은 `transition: background-color 0.15s ease` 정도의 미세 트랜지션 허용.

---

## 5. 접근성 요구사항

- 원형 체크박스: `role="checkbox"`, `aria-checked={todo.status === "done"}`, `aria-label="${todo.title} 완료 처리"`.
- 하단 탭바 각 탭: `NavLink`는 기본적으로 `<a>` 역할 — `aria-label`로 탭 이름 명시(아이콘만으로 의미 전달 부족 보완, 단 라벨 텍스트가 이미 보이므로 `aria-current="page"`는 `NavLink`의 `aria-current` 기본 동작에 의존).
- 주간 스트립 날짜 셀: `role="button"`, `aria-label="6월 16일 화요일, 일정 있음"`(dot 마커 정보를 시각 요소뿐 아니라 aria-label에도 포함).
- 헤더 아바타 버튼: `aria-label="사용자 메뉴 열기"`.
- 모든 인터랙티브 요소 최소 44x44px 터치 타겟 확보(위 3-2, 3-5, 3-7에서 개별 명시).
- 레드 배지("N일 초과")는 색상에만 의존하지 않고 텍스트로 의미 전달(이미 충족 — `getDueBadgeLabel` 텍스트 자체가 의미 전달).

---

## 6. 단계적 적용 범위 (Phase)

1. **Phase 1 (토큰)**: `colors.ts`, `radius.ts` 신규 추가. `statusColors.done.main`을 `#1D9E75`로 통일. 기존 화면에는 즉시 적용하지 않고 신규 토큰만 준비(기존 22개 파일의 `#1c72eb` 일괄 교체는 이번 스펙 범위 밖 — 별도 후속 작업으로 분리 권장, 리스크가 크고 전체 화면 톤이 바뀌므로 PM 의사결정 필요).
2. **Phase 2 (모바일 "오늘" 화면)**: `features/today/` 신규 구현, `/today` 라우트 추가, 기존 `/` 모바일 분기는 유지(병행 운영 — 사용자가 양쪽을 비교할 수 있도록 일정 기간 공존시키는 옵션도 고려 가능, 최종 결정은 PM).
3. **Phase 3 (모바일 셸)**: `MobileHeader`, `BottomTabBar` 도입. `App.tsx`에서 모바일 분기 시 `Footer`→`BottomTabBar` 교체, `Header`→`MobileHeader` 교체.
4. **Phase 4 (정리)**: `/` 라우트의 모바일 분기를 `/today`로 리다이렉트하거나 통합, `MobileHomePage.tsx` 제거.

이번 스펙은 Phase 1~3 구현에 필요한 모든 정보를 포함한다. Phase 4(라우팅 통합 방식)는 사용자 승인 시 함께 결정 필요.

---

## 7. ui-ux-improver에게 전달할 사항 (요약)

1. 신규 토큰 파일 2개(`colors.ts`, `radius.ts`) 생성 후 기존 `statusColors.ts`의 `done.main`만 값 변경, 나머지 기존 하드코딩 색상은 건드리지 않음(범위 외).
2. `features/today/` 신규 feature 생성, `features/todo`의 기존 유틸(`getDaysLeft`, `getDueBadgeLabel`, `DUE_SOON_DAYS`, `useTodo`)과 `shared/ui`(`EmptyState`, `Toast`, `Skeleton` 패턴)를 최대한 재사용.
3. "프로젝트명" 서브텍스트는 데이터 모델에 없는 개념이므로 구현하지 않음(0-5 참고) — 임의로 `parentId` 상위 todo 제목을 끌어다 쓰지 말 것(의미가 다름, 향후 별도 "프로젝트" 엔티티 도입 시 재논의).
4. `LayoutKanban`처럼 lucide-react에 정확히 존재하지 않을 수 있는 아이콘명은 구현 시점에 실제 패키지 export를 확인하고 대체 아이콘 선택할 것.
5. 애니메이션은 추가하지 않음(기존 패턴 일관성), 단 체크박스 토글 색상 전환만 짧은 transition 허용.
6. 접근성: 체크박스 `role="checkbox"`+`aria-checked`, 모든 터치 타겟 44px 이상, 날짜 셀 `aria-label`에 일정 정보 포함.
7. Phase 1(토큰)→Phase 2(오늘 화면)→Phase 3(모바일 셸) 순서로 구현 권장. Phase 4(라우팅 통합)는 별도 승인 필요.
