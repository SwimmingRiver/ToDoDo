# 랜딩 페이지 + 게스트 체험 모드 디자인 스펙

작성 대상: 신규 방문자가 `/`에서 바로 로그인 강제 리다이렉트를 겪지 않고, 서비스를 소개받거나
로그인 없이 Today 수준 CRUD를 체험할 수 있게 한다.

관련 파일(참고용, 수정 대상 아님 — ui-ux-improver 구현 시 참고):
- `client/src/router.tsx`
- `client/src/features/today/pages/todayPage.tsx`
- `client/src/features/today/components/todaySection.tsx`, `todayTodoItem.tsx`, `dailyProgress.tsx`
- `client/src/features/auth/pages/loginPage.tsx`
- `client/src/shared/ui/emptyState/emptyState.tsx`
- `client/src/layouts/footer/footer.tsx`
- `client/src/styles/colors.ts`, `styles/breakpoints.ts`, `styles/radius.ts`

---

## 0. 라우팅 변경 개요

현재 `router.tsx`는 `path: "/"`를 `<ProtectedRoute><App/></ProtectedRoute>`로 감싸고, 그 자식으로
`index` 리다이렉트(`/today`)와 `today`/`todo`/`calendar`/`kanban`이 붙어 있다. 이 구조에서는 비로그인
사용자가 정확히 `/`로 들어와도 무조건 `/login`으로 튕긴다.

**권장 구조** (구현 세부는 ui-ux-improver 재량, 아래는 스펙상 의도):

```
/login          → LoginPage (기존 유지)
/                → RootGate
                    - auth loading 중: null (기존 ProtectedRoute와 동일한 패턴)
                    - user 있음: <Navigate to="/today" replace />
                    - user 없음: <LandingPage />
/guest           → GuestTodayPage (완전 공개, ProtectedRoute 미적용, App 셸 미사용)
(path 없는 레이아웃 라우트) → <ProtectedRoute><App/></ProtectedRoute>
  ├ today
  ├ todo/:id
  ├ todo
  ├ calendar
  └ kanban
```

- 기존 protected 그룹은 `path: "/"`를 제거하고(pathless layout route) 자식 절대경로(`/today` 등)는
  그대로 유지한다. 기존 `index: true, <Navigate to="/today"/>` 항목은 더 이상 필요 없으므로 제거한다.
- `RootGate`는 `ProtectedRoute`와 대칭되는 컴포넌트로, `features/auth/components/rootGate.tsx`에
  두는 것을 권장(동일한 `useAuth` 패턴 재사용).
- `/guest`는 `App`(Header/SNB/Footer 포함 인증 셸)을 사용하지 않는다 — 칸반/캘린더 등 체험 범위 밖
  메뉴가 노출되면 안 되므로, 아래 정의하는 별도의 최소 레이아웃을 사용한다.

---

## 1. 화면 A — 랜딩 페이지 (`/`)

### 1-1. 화면 구조 (desktop, ≥1024px)

```
┌──────────────────────────────────────────────────────────┐
│ LandingHeader                                             │
│  ToDoDo                                    [로그인 →]      │
├──────────────────────────────────────────────────────────┤
│                        HeroSection                        │
│                                                            │
│        해야 할 일, 오늘 안에 끝내는 가장 쉬운 방법           │
│        Today 리스트·칸반보드·캘린더로 할 일을 한눈에         │
│                                                            │
│   [ Google로 시작하기 ]   [ 로그인 없이 체험하기 ]           │
│                                                            │
├──────────────────────────────────────────────────────────┤
│                      FeatureGrid (3열)                     │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐            │
│  │  ☀ Today   │   │  ▤ 칸반보드 │   │  🗓 캘린더  │           │
│  │  오늘 할 일 │   │  진행 상태를│   │  일정을 한눈│           │
│  │  만 모아보기│   │  드래그로   │   │  에 확인    │           │
│  └───────────┘   └───────────┘   └───────────┘            │
├──────────────────────────────────────────────────────────┤
│               SecondaryCta (재노출, 옵션)                  │
│        지금 바로 로그인 없이 둘러보세요 [체험하기 →]         │
├──────────────────────────────────────────────────────────┤
│ Footer (기존 layouts/footer/footer.tsx 그대로 재사용)       │
└──────────────────────────────────────────────────────────┘
```

### 1-2. 화면 구조 (mobile, ≤768px)

```
┌───────────────────────────┐
│ ToDoDo            [로그인] │
├───────────────────────────┤
│  해야 할 일, 오늘 안에      │
│  끝내는 가장 쉬운 방법      │
│  (부제 텍스트)              │
│                            │
│  [ Google로 시작하기 ]      │  ← full width
│  [ 로그인 없이 체험하기 ]    │  ← full width
├───────────────────────────┤
│  ☀ Today  — 설명           │
│  ▤ 칸반보드 — 설명          │  ← 1열 스택
│  🗓 캘린더 — 설명           │
├───────────────────────────┤
│ Footer                    │
└───────────────────────────┘
```

### 1-3. 디자인 언어

- 색상: 신규 토큰 불필요. `colors.ts` 그대로 사용.
  - CTA primary(채움): `colors.brand.secondary` (#1D9E75) 배경, hover 시 `colors.brand.primary`
    (#0F6E56)로 어두워짐 — `EmptyState`의 `ActionButton` 패턴과 동일 (`shared/ui/emptyState/emptyState.styles.tsx`).
  - CTA secondary(아웃라인): 배경 투명, border `colors.brand.secondary`, 텍스트 `colors.brand.secondary`,
    hover 시 배경 `colors.brand.background` (#E8F5EF).
  - 히어로 배경: `colors.background.secondary` (#F4F5F6) 또는 흰 배경 + 텍스트만 (실험적 그라디언트
    이미지 에셋 없음 — 별도 일러스트/이미지 리소스가 없다는 전제로, 타이포 중심 히어로로 설계함).
  - 본문 텍스트: `colors.text.primary` / `colors.text.secondary` 그대로.
- 간격: 8px 그리드 기준 — 섹션 간 `padding: 64px 24px`(desktop) / `40px 20px`(mobile), 카드 내부
  `padding: 24px`, 카드 간 `gap: 20px`. 기존 `EmptyState`, `LoginPage` 카드가 24px 내부 패딩,
  32px 요소 간격을 쓰는 것과 톤을 맞춤.
- 타이포그래피: 기존 `LoginPage`의 `Title`(28px/700)을 참고해 히어로 타이틀은 `36px/700`
  (mobile `26px/700`), 부제 `16px/400 text.secondary`, 카드 타이틀 `16px/600`, 카드 설명
  `14px/400 text.secondary`. 별도 폰트 파일 도입 없이 기존 시스템 폰트 상속.
- 컴포넌트 패턴: 버튼은 `EmptyState`의 `ActionButton`(`border-radius: 8px`, `padding: 12px 24px`,
  `font-size: 14px/600`)과 동일 규격을 따르되 히어로에서는 조금 더 큰 CTA
  (`padding: 14px 28px`, `font-size: 15px`)로 강조. 카드는 `border-radius: ${radius.md}`(8px),
  `border: 1px solid colors.border.tertiary`, hover 시 `box-shadow` 미세 상승(0 4px 12px rgba(0,0,0,0.06)).

### 1-4. 컴포넌트 설계

- 재사용: `layouts/footer/footer.tsx` → 그대로 렌더 (인증 의존성 없음, 수정 불필요).
- 재사용 안 함(주의): `layouts/header/header.tsx`는 `user`/`logout`을 필수로 참조하므로 비로그인
  상태에서 쓸 수 없다 → 아래 `LandingHeader`를 신규로 만든다(로직 간단, 재사용 이득 적음).
- 신규 컴포넌트 (`features/landing/`):
  ```
  features/landing/
    pages/
      landingPage.tsx
      landingPage.styles.tsx
    components/
      landingHeader.tsx        // 로고 + "로그인" 텍스트 링크(→ /login)
      landingHeader.styles.tsx
      heroSection.tsx           // 타이틀/부제/CtaButtons
      heroSection.styles.tsx
      ctaButtons.tsx             // 2버튼 그룹, 히어로/하단 재사용
      ctaButtons.styles.tsx
      featureGrid.tsx            // FeatureCard x3 map
      featureCard.tsx
      featureCard.styles.tsx
  ```
  ```ts
  interface CtaButtonsProps {
    onPrimaryClick: () => void; // navigate("/login")
    onSecondaryClick: () => void; // navigate("/guest")
    layout?: "row" | "stack"; // desktop row, mobile stack (media query로 자동 처리 가능하면 prop 불필요)
  }

  interface FeatureCardProps {
    icon: LucideIcon; // Sun / LayoutGrid(칸반) / CalendarDays
    title: string;
    description: string;
  }
  ```
- Feature 카드 3종 콘텐츠(제안 카피):
  1. Today — 아이콘 `Sun`(today 페이지와 동일 아이콘, 일관성) — "오늘 할 일만 모아보고, 체크 한 번으로 완료"
  2. 칸반보드 — 아이콘 `LayoutGrid` 또는 `Trello` 계열 — "드래그 앤 드롭으로 진행 상태를 관리"
  3. 캘린더 — 아이콘 `CalendarDays` — "마감일과 반복 일정을 한눈에 확인"
  (모두 로그인 후 실제 기능 소개용. 게스트 체험은 1번만 제공되므로, 2·3번 카드에는 작은 배지로
  "로그인 후 이용 가능" 라벨을 달아 기대치를 명확히 한다 — 신규 사용 `Badge`는 기존
  `shared/ui/recurrenceBadge`의 pill 스타일을 재사용해도 무방.)

### 1-5. 상태 정의

- 기본(단일 정적 상태) — 데이터 페칭 없음, 로딩/에러 상태 불필요.
- `RootGate`의 auth-loading 구간만 예외적으로 빈 화면(null) — 기존 `ProtectedRoute`와 동일 패턴이라
  깜빡임 최소화를 위해 별도 스피너 없이 그대로 null 유지 권장 (일관성 우선).

### 1-6. CTA 동작

- "Google로 시작하기" → `navigate("/login")` (기존 로그인 페이지로 이동, 로그인 로직은 `loginPage.tsx`
  그대로 사용 — 랜딩에서 직접 Google 팝업을 띄우지 않음, 로그인 실패 UX를 한 곳에서만 관리하기 위함).
- "로그인 없이 체험하기" → `navigate("/guest")`.
- 로그인 상태로 `/`에 접근 시 `RootGate`가 `/today`로 즉시 리다이렉트 (랜딩 노출 안 됨).

---

## 2. 화면 B — 게스트 체험 Today 페이지 (`/guest`)

### 2-1. 화면 구조 (desktop)

```
┌──────────────────────────────────────────────────────────┐
│ GuestHeader:  ToDoDo (체험 모드)      [ Google로 로그인 ]   │
├──────────────────────────────────────────────────────────┤
│ GuestBanner (sticky, 배너 아이콘 + 문구 + CTA)              │
│  ⓘ 체험 모드입니다. 새로고침하면 작성한 내용이 사라져요.     │
│                            [ Google로 로그인하고 저장하기 ] │
├──────────────────────────────────────────────────────────┤
│ DailyProgress  (기존 컴포넌트 그대로 재사용)                │
│   오늘 · 1 / 3 완료 ▓▓▓▓░░░░░░                             │
├──────────────────────────────────────────────────────────┤
│ GuestAddTodoInput                                          │
│   [ + 할 일 제목 입력...                    ] [ 추가 ]      │
├──────────────────────────────────────────────────────────┤
│ TodaySection "진행 중" (기존 컴포넌트)                       │
│   ○ 오늘 할 일 추가해보기                                   │
│   ○ 완료 체크 눌러보기                              [🗑]    │
├──────────────────────────────────────────────────────────┤
│ TodaySection "완료"                                         │
│   ✔ ToDoDo 둘러보기                                  [🗑]    │
└──────────────────────────────────────────────────────────┘
```

### 2-2. 화면 구조 (mobile)

```
┌───────────────────────────┐
│ ToDoDo (체험 모드)          │
│                 [로그인]    │
├───────────────────────────┤
│ ⓘ 체험 모드 — 데이터 미저장  │
│    [ 로그인하고 저장하기 ]   │
├───────────────────────────┤
│ 오늘 · 1/3 완료  ▓▓░░░░     │
├───────────────────────────┤
│ [+ 할 일 제목...]  [추가]   │
├───────────────────────────┤
│ 진행 중                    │
│ ○ ...                 🗑   │
├───────────────────────────┤
│ 완료                       │
│ ✔ ...                 🗑   │
└───────────────────────────┘
```
(GuestHeader는 모바일에서 배너와 문구가 길어지므로 2줄로 접힘: 문구 위, 버튼 아래 full-width.)

### 2-3. 디자인 언어

- 기존 `TodayPage`(`features/today/pages/todayPage.tsx`)와 동일한 컨테이너 폭/패딩, 리스트 아이템
  톤을 그대로 유지한다(신규 토큰 없음).
- 배너 색상: 정보성 알림이므로 `colors.brand.background`(#E8F5EF) 배경 + `colors.brand.primary`
  (#0F6E56) 텍스트/아이콘 — 기존 `recurrenceBadge`가 같은 배경색 계열을 이미 사용 중이라 시각적으로
  "브랜드 정보성 배지" 톤과 일관됨. 경고(danger) 색상은 쓰지 않는다 — 데이터 손실이 아니라 원래
  의도된 동작이므로 danger 톤은 과한 불안감을 줄 수 있음.
- 게스트 헤더: 기존 `LoginPage`/`Header` 톤을 따르되 로그인 사용자 정보 대신 "체험 모드" 텍스트 배지
  노출. 배지 스타일은 `shared/ui/recurrenceBadge`의 pill(`border-radius: full`, `font-size: 11px`,
  `padding: 2px 8px`) 패턴 재사용.

### 2-4. 컴포넌트 설계

- 재사용 (수정 없음):
  - `features/today/components/dailyProgress.tsx` — `dateLabel`/`doneCount`/`totalCount`만 로컬
    상태에서 계산해 전달.
  - `features/today/components/todaySection.tsx` — 그대로.
  - `shared/ui/emptyState/emptyState.tsx` — 전체 삭제 시 빈 상태.
  - `layouts/footer/footer.tsx` — 게스트 페이지 하단에도 동일하게 노출(선택, 신뢰감 확보 목적).

- 재사용 + **prop 확장 필요** (기존 사용처는 영향 없도록 전부 optional):
  - `features/today/components/todayTodoItem.tsx`
    ```ts
    interface TodayTodoItemProps {
      todo: Todo;
      onToggleDone: (todo: Todo) => void;
      onItemClick?: (todo: Todo) => void; // 기본값: 기존처럼 navigate(`/todo/${todo.id}`)
                                           // 게스트: 상세 페이지가 없으므로 no-op 전달
      onDelete?: (todo: Todo) => void;     // 전달된 경우에만 우측 삭제 아이콘(Trash2, 44px 터치 타겟) 노출
                                           // 기존 TodayPage는 미전달 → 기존 동작·레이아웃 100% 유지
    }
    ```
    - 이유: 실제 Today 페이지는 아이템 클릭 시 `/todo/:id` 상세로 이동하지만, 게스트 데이터는
      Firestore 문서가 아니라 로컬 목업이라 상세 라우트가 존재하지 않는다. 또한 게스트 모드는
      상세 페이지 없이 리스트에서 바로 삭제까지 가능해야 하므로 삭제 진입점이 필요하다.
    - 삭제 확인 모달(`shared/ui/confirmModal`)은 게스트 모드에선 생략 권장 — 체험 데이터는 저장되지
      않는 휘발성 데이터라 확인 절차가 오히려 마찰을 늘림. (실제 Today/Todo 리스트의 삭제 확인 정책은
      건드리지 않음.)

- 신규 컴포넌트 (`features/guest/`):
  ```
  features/guest/
    hooks/
      useGuestTodos.ts          // 로컬 상태 CRUD (아래 2-5 참고)
    pages/
      guestTodayPage.tsx
      guestTodayPage.styles.tsx
    components/
      guestHeader.tsx            // 로고 + "체험 모드" 배지 + "Google로 로그인" 버튼(→ /login)
      guestHeader.styles.tsx
      guestBanner.tsx             // 안내 문구 + CTA "Google로 로그인하고 저장하기"(→ /login)
      guestBanner.styles.tsx
      guestAddTodoInput.tsx        // 제목만 입력하는 인라인 입력 + 추가 버튼
      guestAddTodoInput.styles.tsx
  ```
  ```ts
  interface GuestAddTodoInputProps {
    onAdd: (title: string) => void;
  }
  // 동작: input(placeholder "할 일을 입력하세요") + "추가" 버튼(또는 Plus 아이콘 버튼).
  // Enter 키 제출 지원. title.trim() === "" 이면 추가 버튼 disabled.
  // 최대 길이: 기존 TodoForm과 동일하게 별도 글자수 제한 없음(트림만 적용) — 필요 시 100자 정도로
  // 방어(선택 사항, 필수 아님).
  ```

### 2-5. `useGuestTodos` 훅 스펙 (로컬 상태, Firestore/Query 미사용)

```ts
interface UseGuestTodosResult {
  todos: Todo[];                 // 시드 데이터 포함, 컴포넌트 마운트 시 1회 생성
  inProgressTodos: Todo[];
  doneTodos: Todo[];
  doneCount: number;
  totalCount: number;
  addTodo: (title: string) => void;
  toggleDone: (todo: Todo) => void;
  deleteTodo: (todo: Todo) => void;
}
```

- `useState<Todo[]>(() => seedGuestTodos())`로 초기화, 새로고침 시 완전 초기화(요구사항 그대로 —
  별도 영속화 로직 절대 추가하지 않음. localStorage 등 사용 금지).
- 시드 데이터 2~3개 제안(모두 `dueAt: null`이라 배지/시간 표시 없이 깔끔하게 렌더됨):
  1. `{ title: "ToDoDo 둘러보기", status: "done" }`
  2. `{ title: "할 일 추가해보기", status: "todo" }`
  3. `{ title: "완료 체크해보기", status: "todo" }`
  - 나머지 `Todo` 필드는 목업 값으로 채움: `userId: "guest"`, `id: crypto.randomUUID()` 또는
    `guest-${index}`, `priority: "medium"`, `startAt/dueAt/doneAt: null`(done 항목만 `doneAt`을
    현재시각으로), `parentId: null`, `recurrence: null`, `recurrenceId: null`, `order: index`,
    `createdAt/updatedAt: new Date().toISOString()`.
- `addTodo`: 새 `Todo` 목업 객체를 만들어 배열 앞(또는 뒤)에 추가, `status: "todo"`.
- `toggleDone`: 기존 `useTodayTodos.toggleDone`과 동일한 로직(상태 토글 + `doneAt` 세팅/해제)을
  로컬 배열에 적용.
- `deleteTodo`: 배열에서 해당 id 제거.
- 이 훅은 실제 `useTodo`/`useTodayTodos`(Firebase 의존)를 절대 import하지 않는다 — 완전히 독립된
  로컬 상태로, 실 서비스 데이터 경로와 섞이지 않아야 함(요구사항 명시 사항).

### 2-6. 상태 정의

- 로딩: 없음 (로컬 동기 상태이므로 스켈레톤 불필요).
- 에러: 없음 (네트워크 요청이 없으므로 에러 상태 자체가 존재하지 않음).
- 빈 상태(전부 삭제): `EmptyState` 재사용.
  - icon: `Sun` (기존 TodayPage와 동일 아이콘으로 톤 일치)
  - title: "체험할 할 일이 없습니다"
  - description: "위 입력창에 새 할 일을 추가해보세요"
  - actionLabel/actionIcon/onAction: 생략 가능(입력창이 항상 상단에 고정 노출되어 있으므로 중복 CTA
    불필요) — 필요시 "새 할 일 추가" 액션으로 입력창에 포커스 이동시키는 것도 가능(선택 사항).

### 2-7. 게스트 → 로그인 전환 동작

- `GuestHeader`의 "Google로 로그인" 버튼과 `GuestBanner`의 "Google로 로그인하고 저장하기" 버튼 모두
  `navigate("/login")`로 연결(랜딩과 동일하게 실제 팝업 로그인 로직은 `loginPage.tsx`에만 존재).
- 게스트 상태에서 작성한 로컬 데이터는 로그인 전환 시 **이관하지 않는다** (요구사항 범위 밖 — 완전
  별도 체험판). 이 부분은 배너 문구로 이미 고지되므로 별도 확인 모달 불필요.

---

## 3. 디자인 토큰 요약 (신규 토큰 없음)

| 용도 | 토큰 |
|---|---|
| 주요 CTA 배경 | `colors.brand.secondary` (#1D9E75) |
| CTA hover / 톤다운 | `colors.brand.primary` (#0F6E56) |
| 정보성 배너 배경 | `colors.brand.background` (#E8F5EF) |
| 본문/보조 텍스트 | `colors.text.primary` / `colors.text.secondary` |
| 카드/구분선 보더 | `colors.border.tertiary` |
| 라운드 | `radius.md` (8px, 카드/버튼) · `radius.full` (배지) |
| 반응형 기준 | `breakpoints.ts` → `media.tablet`(~768px) 이하 모바일 스택, `media.desktop`(~1024px) 3열→축소 |

> 참고: `colors.ts`의 실제 키 이름은 `brand.primary`가 어두운 톤(#0F6E56), `brand.secondary`가
> 밝은 메인 톤(#1D9E75)으로, CLAUDE.md 서술("primary: #1D9E75, 톤다운: #0F6E56")과 키 이름이
> 반대로 매핑되어 있다. 기존 코드(`EmptyState` 등)가 이미 이 매핑으로 일관되게 쓰이고 있으므로
> 신규 화면도 동일 매핑을 따른다 — 헷갈리지 않도록 구현 시 유의.

---

## 4. ui-ux-improver에게 전달할 사항

1. **라우팅 리팩터링이 선행되어야 함**: `router.tsx`에서 `/` 하나의 path를 두 용도(랜딩 vs 인증된
   앱 진입)로 겹쳐 쓸 수 없으므로, 위 0장의 구조(pathless 레이아웃 라우트 + `RootGate`)로 먼저
   정리한 뒤 화면 구현을 진행할 것을 권장. 기존 `today`/`todo/:id`/`todo`/`calendar`/`kanban`
   라우트의 절대 경로(URL)는 변경되지 않아야 함(북마크/링크 하위 호환).
2. **`TodayTodoItem` prop 확장은 전부 optional**이어야 하며, 기존 `TodayPage`(`todayPage.tsx`)의
   호출부는 수정하지 않아도 기존과 동일하게 동작해야 한다. 회귀 테스트
   (`features/today/components/__tests__/todayTodoItem.test.tsx`) 확인 필요.
3. **게스트 모드는 실제 Firebase/Firestore 코드를 import하지 않는다** — `useTodo`, `useTodayTodos`,
   `firebase.ts` 등을 게스트 훅에서 참조하지 말 것 (CLAUDE.md의 "실제 서비스 로직 불변" 원칙과
   사용자 요구사항 둘 다에 해당).
4. **접근성**:
   - `GuestBanner`는 `role="status"` 또는 `aria-live="polite"`로 스크린리더에도 "체험 모드" 사실이
     전달되도록 한다(배너가 페이지 로드 시 이미 존재하므로 `aria-live`보다는 고정 텍스트 + landmark
     역할(`role="note"` 등)이면 충분, 굳이 live region으로 강제 알림을 줄 필요는 없음 — 과도한
     알림 방지).
   - 삭제 버튼은 `aria-label="{title} 삭제"` 형태로 제목을 포함해 스크린리더 사용자가 대상이 명확히
     구분되도록 한다 (기존 `Checkbox`의 `aria-label="${todo.title} 완료 처리"` 패턴과 통일).
   - 모든 인터랙티브 요소 최소 44px 터치 타겟 유지 (`TodayTodoItem`의 `Checkbox`가 이미 44px 패턴을
     쓰고 있으므로 신규 삭제 버튼도 동일 규격으로 맞출 것).
   - CTA 버튼 2개(랜딩)는 탭 순서상 "Google로 시작하기"가 먼저 오도록(주 전환 경로 우선).
5. **애니메이션/트랜지션**: 필수 아님. 기존 코드베이스 톤에 맞춰 버튼 hover는
   `transition: background-color 0.2s ease` 정도만 적용(과한 모션 지양, `LoginPage`/`EmptyState`와
   동일 패턴).
6. **테스트 관점**: `useGuestTodos`는 순수 로컬 로직이라 유닛 테스트 작성이 쉬움 — 새로고침 시
   초기화된다는 요구사항 자체는 "영속화 코드가 없음"으로 검증(즉, localStorage/sessionStorage를
   사용하지 않았는지 확인하는 것이 곧 회귀 테스트 포인트).
7. **랜딩 페이지 이미지 에셋**: 별도로 준비된 일러스트/스크린샷이 없다는 전제로 스펙을 작성함.
   실제 목업/스크린샷 에셋이 생기면 히어로 우측에 이미지 배치하는 2컬럼 레이아웃으로 확장 가능하나,
   현재 스펙은 텍스트 중심 1컬럼 히어로로 한정.

---

## 5. 신규 파일 구조 요약

```
client/src/
├── router.tsx                              (수정: 0장 구조로 재구성)
├── features/
│   ├── auth/
│   │   └── components/
│   │       └── rootGate.tsx                (신규)
│   ├── landing/
│   │   ├── design/spec.md                  (본 문서)
│   │   ├── pages/landingPage.tsx           (신규)
│   │   ├── pages/landingPage.styles.tsx    (신규)
│   │   └── components/
│   │       ├── landingHeader.tsx           (신규)
│   │       ├── heroSection.tsx             (신규)
│   │       ├── ctaButtons.tsx              (신규)
│   │       ├── featureGrid.tsx             (신규)
│   │       └── featureCard.tsx             (신규)
│   ├── guest/
│   │   ├── hooks/useGuestTodos.ts          (신규)
│   │   ├── pages/guestTodayPage.tsx        (신규)
│   │   ├── pages/guestTodayPage.styles.tsx (신규)
│   │   └── components/
│   │       ├── guestHeader.tsx             (신규)
│   │       ├── guestBanner.tsx             (신규)
│   │       └── guestAddTodoInput.tsx       (신규)
│   └── today/
│       └── components/todayTodoItem.tsx    (수정: optional prop 2개 추가, 하위 호환 유지)
```
