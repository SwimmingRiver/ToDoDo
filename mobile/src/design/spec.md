# 모바일 앱 UI 스타일 설계 — LoginScreen / TodoListScreen / TodoFormScreen

## 배경 및 목표

모바일(RN/Expo) 3개 화면은 기능은 완성됐지만 스타일이 전혀 없는 기본 RN 상태다.
이번 설계의 목표는 두 가지다.

1. 웹(`client/`)의 브랜드 컬러·레이아웃·인터랙션 패턴을 그대로 이식해 "같은 앱"처럼
   보이게 한다 — 픽셀 단위 동일이 아니라 색/간격/컴포넌트 언어의 일관성이 기준이다.
2. `TodoFormScreen`에 빠져 있는 `dueAt`(마감일시) 입력을 추가한다. `startAt`(시작일시)도
   함께 다룬다. 이미 구현된 로컬 알림 예약(`useCreateTodo`/`useUpdateTodo` →
   `scheduleReminder`)은 `fields.dueAt`이 채워지는 순간부터 자동으로 동작하므로,
   폼에 입력 UI를 추가하는 것만으로 알림 기능이 살아난다 — 알림 로직 자체는 손댈 필요 없음.

## 범위 밖 (Out of scope)

> **정정 (2026-08-25)**: 이 문서의 이전 버전은 TodoListScreen을
> `client/src/features/todo/components/todoListItem/todoListItem.tsx`를 기준으로 설계했다.
> 그런데 `todoListItem.tsx`는 어디서도 import/렌더링되지 않는 **죽은 컴포넌트**다(자기 자신의
> styles만 재사용될 뿐 라우트에 연결되지 않음). 실제 웹 목록 화면은
> `router.tsx` → `TodoListPage` → `TodoList`(`todoList.tsx`) → `ProjectCard` + `ChildTodoCard`
> 조합이고, 데이터 파생은 `client/src/features/todo/utils/projectUtils.ts`가 담당한다.
> 진행률 바·서브태스크 카운트·overdue 배지·반복 배지는 모바일 `useTodos`가 이미 받아오는
> `Todo[]`만으로 순수 함수로 계산 가능함이 확인되어(사용자 승인 완료) 이번 스펙부터 포함한다.
> "### 2. TodoListScreen" 절이 이번에 전면 재작성된 부분이다. LoginScreen/TodoFormScreen 절은
> 영향 없음.

- 반복 할 일 생성/편집, 하위 할 일 생성(`onAddChild`)은 모바일에 아직 없는 기능이라 제외.
- 검색(`TodoSearch`/`useSearchTodo`)은 모바일 훅에 없는 기능이라 제외.
- 카드 탭 시 상세 페이지 이동(웹 `onCardClick` → `/todo/:id`)은 모바일에 상세 화면 자체가
  없어 대상이 없다 — 아래 "### 2. TodoListScreen" 절에서 펼치기 토글로 흡수하는 방식으로
  대체한다(아래 "의사결정" 참고).
- `TodoFormScreen`은 여전히 "생성 전용"이다. 편집(수정) 화면은 이번 스펙 범위 밖이지만,
  아래 컴포넌트 설계는 추후 `todo?: Todo` prop을 받는 편집 모드로 자연스럽게 확장 가능하도록
  필드 단위로 분리해둔다.

---

## 디자인 언어 (웹 → 모바일 매핑)

### 색상

`client/src/styles/colors.ts` / `statusColors.ts`를 그대로 값으로 가져와
`mobile/src/theme/colors.ts`, `mobile/src/theme/statusColors.ts`에 복제한다(신규 파일,
아래 컴포넌트 설계 참고). 웹과 동일한 값을 쓰므로 별도 매핑표가 아니라 "그대로 복사"가 원칙이다.

| 토큰 | 값 | 용도 (웹과 동일) |
| --- | --- | --- |
| `brand.strong` | `#0F6E56` | 글자·아이콘, 흰 글자 얹는 솔리드 배경(제출 버튼, 하단 추가 버튼), 포커스 보더 |
| `brand.strongHover` | `#0A4E3C` | 위 요소의 pressed 상태 (RN에는 hover가 없으므로 `Pressable`의 `pressed` 스타일에 사용) |
| `brand.fill` | `#1D9E75` | 흰/회색 배경 위 비텍스트 장식 전용 (예: 로딩 스피너 색, 루트 카드 `ColorDot`의 정상 상태 색) |
| `brand.tint` | `#E8F5EF` | 연한 배경 (선택된 우선순위 칩, 포커스된 입력 필드 배경, `RecurrenceBadge` 배경 등) |
| `statusColors.todo/doing/done` | 회색/파랑/틴 계열 (`main`/`light`/`border` 3톤) | 자식 카드 `ColorDot`·카드 전체 보더 색(`statusColors.ts` 값 그대로, 루트 카드에는 상태색을 쓰지 않음 — 아래 참고) |
| `danger.main` `#E24B4A`, `danger.subtle` `#F5C2C1`, `danger.text` `#C53A39`, `danger.background` `#FBEAEA` | | 삭제 아이콘 버튼, 우선순위 "높음" 좌측 보더, overdue 관련 배지/점/진행률/카드 보더, 유효성 에러 텍스트 |
| `background.primary` `#FFFFFF`, `background.secondary` `#F4F5F6` | | 화면/카드 배경 |
| `text.primary` `#1A1A1A`, `text.secondary` `#5F6368`, `text.tertiary` `#9AA0A6` | | 제목/본문/보조 텍스트 |
| `border.secondary` `#D1D5DB`, `border.tertiary` `#E5E7EB` | | 입력 필드·카드 보더 |

기존 web-only 하드코딩(예: `TodoIconButton` danger hover `#ffebee`/`#d32f2f`, `DueBadge`의
`#ef4444`/`#f97316`/`#f59e0b`)은 토큰이 아니라 리터럴이다. 모바일에서는 의미가 가장 가까운
토큰(`danger.background`/`danger.text`)으로 치환하되, `DueBadge`의 3단계 색상(초과/D-day/임박)은
토큰이 없으므로 웹과 동일한 리터럴 값을 그대로 이식한다(시각 차이 없음이 우선). 단,
`DueBadge`는 이번 TodoListScreen 재설계에서 목록 카드 사용처가 사라진다 — 아래 "### 2.
TodoListScreen" 및 컴포넌트 패턴 표 참고.

### 간격 · 반경 · 타이포그래피

웹 `todoForm`/`projectCard` 스타일에서 실제 쓰인 값을 그대로 8px 그리드로 정리한다
(웹도 대체로 8의 배수를 쓰고 있어 기존 패턴과 일치):

- 간격: `4 / 8 / 12 / 16 / 24 / 32`
- 모서리 반경: 입력·카드 `6~12px`(웹: Input 6px, 카드 12px, 하단 버튼 10px 그대로 사용)
- 폰트 크기: 라벨 `14px/600`, 본문 `14px`, 보조 텍스트 `11~13px`, 화면 타이틀 `20px/700`(네이티브
  헤더 타이틀), 로그인 카드 타이틀 `28px/700`(웹 `loginPage.styles.tsx` Title과 동일)
- 터치 타겟: 모든 Pressable 최소 44×44 (client/CLAUDE.md 기준과 동일하게 유지)

`breakpoints.ts`(반응형 미디어쿼리)는 모바일 네이티브 앱에는 적용 대상이 아니다(단일 폰 레이아웃
기준, 태블릿 대응은 범위 밖) — 안전 영역 처리는 이미 설치된 `react-native-safe-area-context`로
충분하다. 단, 웹 `ProjectCard`는 `useMediaQuery("tablet")`로 자신의 좁은 화면(모바일 웹) 분기에서
자식 목록을 인라인 대신 BottomSheet로 보여주는 반응형 변형을 갖고 있다 — RN 앱은 항상 "좁은
화면"이지만, 이 변형을 그대로 채택하지는 않는다(아래 "의사결정" 참고, 기존 RN 인라인 펼치기 패턴
유지 권장).

### 컴포넌트 패턴 (웹 → RN 대응)

| 웹 패턴 | RN 대응 | 비고 |
| --- | --- | --- |
| `Input`/`TextArea`(styled `<input>`) | `TextInput` + custom 보더/라운드 스타일 | 포커스 시 `border-color: brand.strong` 동일 |
| `Select`(우선순위, `<select>`) | 3개 세그먼트 칩(낮음/보통/높음) | **의도적 변경** — 아래 "의사결정" 참고 |
| `StatusSelect` + `BottomSheet` | `Pressable` 칩 → 커스텀 BottomSheet(Modal 기반) | 인터랙션까지 동일하게 이식(아래 참고) |
| `ProjectCard`의 `ColorDot`(8px 원형 점) | `Pressable` + 8px 원형 `View` | **정정** — 이전 버전은 "카드 좌측 보더 색상"이라 잘못 설명했다. 실제로는 카드 좌측에 놓인 작은 점이다. 탭하면 상태변경 BottomSheet가 열린다(카드 탭과는 별개의 형제 `Pressable`) |
| `ProjectCard`의 `ProgressBar`/`ProgressFill`(3px 높이) | 동일한 3px 높이 바 | 서브태스크 done 비율(%), overdue면 danger 색 |
| `ProjectCard`의 `OverdueBadge`("N일 초과") | 동일 배지 | `getProjectOverdue` 로직 그대로 포팅 |
| `shared`의 `RecurrenceBadge`/`RecurrenceMissedBadge` | 동일 배지 | `recurrenceId`가 있는 할 일에 `RecurrenceBadge`, `overdueArchived`된 형제가 있으면 `RecurrenceMissedBadge`("N회 밀림") |
| ~~`DueBadge`~~ | TodoListScreen에는 사용하지 않음 | **정정** — 웹 `ProjectCard`/`ChildTodoCard` 어디에도 `DueBadge`는 없다(다른 화면인 `dueTodo.tsx`/Today 위젯 전용). `DueBadge.tsx` 컴포넌트 파일 자체는 삭제하지 않고 남겨두되(추후 Today류 화면에서 재사용 가능), 목록 카드에서는 제거하고 대신 `OverdueBadge`만 쓴다 |
| `TodoIconButton`(편집/삭제 아이콘) | 아이콘 전용 `Pressable` + `accessibilityLabel` | 아이콘셋은 `lucide-react-native` 권장(아래 참고). **정정** — 루트 카드(`ProjectCard`)에는 편집 아이콘이 없다(웹도 없음, 삭제+펼치기만). 편집 아이콘은 자식 카드(`ChildTodoCard`)에만 있다 |
| `EmptyState` | 동일 레이아웃의 RN `EmptyState` 컴포넌트 | 아이콘+제목+설명+선택적 액션 버튼 |
| `CheckboxSkeleton` | 단순 회색 바 skeleton row (애니메이션은 `Animated.loop`로 opacity pulse) | 체크박스 특수 애니메이션까지는 이식하지 않고 "로딩 중" 신호만 담당 |
| `AddButton`(하단 고정, brand.strong 풀폭) | 화면 하단 고정 `Pressable` 버튼, 동일 색/높이(48px)/라운드(10px) | `SafeAreaView`의 하단 인셋 위에 배치 |
| `datetime-local` input | `@react-native-community/datetimepicker` 네이티브 모달 | 아래 "dueAt/startAt 입력" 절 참고 |
| `ConfirmModal`(삭제 확인) | 기존 `Alert.alert` 유지 | **의도적 예외** — 아래 "의사결정" 참고 |

---

## 화면 구조

### 1. LoginScreen

```
┌─────────────────────────────┐
│  (background.secondary 배경) │
│                               │
│                               │
│        ┌───────────────┐     │
│        │    ToDoDo      │     │  ← 28px/700, text.primary
│        │                │     │
│        │ [에러 메시지]   │     │  ← danger.background 배경 pill, 에러 있을 때만
│        │                │     │
│        │ [G] Google로 로그인│  │  ← 흰 배경, border.secondary, text.secondary
│        └───────────────┘     │     (Card: 흰 배경, radius 12, shadow)
│                               │
└─────────────────────────────┘
```

- 카드: 흰 배경, radius 12px, 은은한 그림자(웹 `box-shadow: 0 2px 12px rgba(0,0,0,0.08)` →
  RN `shadowOpacity`/`elevation`으로 근사).
- 버튼: 로딩 중(`isLoading`) 상태에는 텍스트를 "로그인 중..."으로 바꾸고 `disabled` 처리 —
  웹 `loginPage.tsx`와 동일한 문구.
- 구글 버튼 아이콘: `@react-native-google-signin/google-signin`의 기본 `GoogleSigninButton`
  대신, 웹과 동일한 4색 G 로고 + "Google로 로그인" 텍스트로 커스텀 렌더링한다(SVG →
  `react-native-svg` 필요, 아래 의존성 참고). 구글 브랜드 가이드 위반 없음(색상/문구만 규정,
  버튼 형태는 자유).

### 2. TodoListScreen — 데이터 있음

기준 소스: `client/src/features/todo/components/todoList.tsx` +
`.../components/projectCard.tsx` + `.../components/childTodoCard.tsx` +
`.../utils/projectUtils.ts` (전부 실제로 렌더링되는 라이브 코드, `todoListItem.tsx`가 아님).

```
┌─────────────────────────────┐
│ ‹  할 일                     │  ← 네이티브 헤더, text.primary/20px/700
├─────────────────────────────┤
│ 프로젝트 3개                  │  ← 12px, text.tertiary (웹 ProjectCountText 이식)
│ ┌───────────────────────┐   │
│ │●  분기 보고서 작성  반복 2회밀림 3일초과 🗑 ▾│ ← ColorDot(danger, overdue) · 배지들 · 삭제 · 펼치기
│ │   5개 할일 · 진행 중          │             │
│ │▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░│  ← ProgressFill(overdue → danger)
│ ├───────────────────────┤  (펼친 상태)
│ │  ●  세부 데이터 정리      ✎ 🗑 │  ← 자식, 좌측 28px 들여쓰기, 점=상태색(doing=파랑)
│ │┃●  계약서 검토           ✎ 🗑 │  ← priority=high: 카드 좌측 3px danger 보더
│ └───────────────────────┘   │
│ ┌───────────────────────┐   │
│ │●  회의록 정리                🗑 ▸│ ← 접힌 상태
│ │   시작 전                    │
│ │░░░░░░░░░░░░░░░░░░░░░░░░│  ← 서브태스크 0개면 progress 0%
│ └───────────────────────┘   │
├─────────────────────────────┤
│         [ + 할 일 추가 ]      │  ← brand.strong, 흰 텍스트, 하단 고정
└─────────────────────────────┘
```

**데이터 파생 (화면 진입 시 `Todo[]`만으로 계산, 신규 Firestore 필드/훅 불필요)**

- 루트 필터링: `status === "done"`인 루트 할 일은 목록에서 완전히 숨긴다(웹 `todoList.tsx`의
  `activatedTodos` 필터와 동일). 자식은 `done`이어도 계속 보인다.
- 반복 대표 1건: 같은 `recurrenceId`를 가진 인스턴스는 `collapseRecurringInstances`로 대표
  1건만 카드로 노출한다(순수 함수, `mobile/src/shared/utils/projectUtils.ts`로 그대로 포팅).
- **빈 상태 판정 정정**: 현재 모바일 구현(`TodoListScreen.tsx`)은 `isEmpty = allTodos.length
  === 0`으로 판정한다. 이 기준은 위 "루트 done 필터링"을 적용하면 틀릴 수 있다 — 예를 들어
  루트가 전부 `done`이면 `allTodos`는 비어있지 않지만 화면에 보일 카드는 0개다. 웹처럼
  **필터링·반복 축약을 마친 뒤의 프로젝트 카드 개수**(`projectCards.length === 0`)로
  `isEmpty`를 판정하도록 고쳐야 한다.

**루트 카드 (`ProjectCard` 대응)**

- 카드 전체 보더: 0.5~1px, 색상은 `isOverdue ? danger.subtle : border.tertiary`(카드 둘레
  전체이지 좌측만이 아니다 — 이전 버전의 "좌측 보더=상태색" 설명은 오류였다).
- 좌측 `ColorDot`(8px 원): 색상은 `isOverdue ? danger.main : brand.fill`. **주의**: 루트 점은
  상태(todo/doing/done)를 색으로 표현하지 않는다 — overdue 여부만 반영한다(웹과 동일 동작).
  탭하면 상태변경 BottomSheet(할 일/진행 중/완료 3택)가 열린다.
- 제목(`text.primary`/14px/500, 1줄 말줄임) + 서브타이틀(`text.tertiary`/11px):
  `${total}개 할일 · ${statusText}`(서브태스크가 없으면 `statusText`만 표시, 예: "시작 전").
- 배지(제목 옆, 순서 고정 — 반복 → 밀린 회차 → overdue): `todo.recurrenceId != null`이면
  `RecurrenceBadge`, `getRecurringMissedCount(...) > 0`이면 `RecurrenceMissedBadge`("N회
  밀림"), `isOverdue`면 `OverdueBadge`("N일 초과").
- 우측: 삭제 아이콘(danger, `accessibilityLabel="프로젝트 삭제"`) + 펼치기/접기 chevron
  (`accessibilityLabel`은 "프로젝트 펼치기"/"프로젝트 접기"). **편집(연필) 아이콘 없음** —
  웹 `ProjectCard`도 루트에는 편집 버튼이 없다(편집은 자식 카드 전용).
- 카드 하단 3px `ProgressBar`: 서브태스크 done 비율(%), `isOverdue ? danger.main : brand.fill`.
- 제목/서브타이틀 영역(ColorDot·아이콘 버튼 제외)을 탭하면 펼치기/접기 토글 — 웹의
  `onCardClick`(상세 페이지 이동)을 대체하는 모바일 전용 동작이다(상세 화면 자체가 없으므로
  펼치기 토글과 통합, 아래 "의사결정" 참고). chevron 버튼과 동작이 겹치지만, RN에서는 두
  `Pressable`이 같은 Row의 형제 요소로 나뉘어 있어(웹처럼 `e.stopPropagation()`이 필요한
  중첩 구조가 아님) 구현이 단순하다.

**자식 카드 (`ChildTodoCard` 대응, 펼쳤을 때만 인라인으로 노출)**

- 좌측 28px 들여쓰기(웹과 동일).
- 카드 전체 보더: 0.5px, 색상은 `statusColors[status].border`(상태별로 옅게 다름 — todo 회색
  계열/doing 파랑 계열/done 초록 계열). **추가로** `priority === "high"`일 때만 좌측 3px
  `danger.main` 보더로 덮어쓴다(그 외 우선순위는 시각 표시 없음 — 기존 "!" 텍스트 아이콘
  방식은 폐기하고 좌측 보더로 통일한다).
- 좌측 `ColorDot`(8px, `statusColors[status].main` 색 — 자식은 루트와 달리 실제 상태색을
  쓴다). 탭하면 상태변경 BottomSheet가 열린다(웹은 인라인 3-pill이지만, RN은 이미 승인된
  "탭→바텀시트" 패턴을 그대로 재사용 — 아래 "의사결정" 참고).
- 제목(13px, `text.primary`, 최대 2줄) — **탭해도 아무 동작 없음**(웹은 상세 페이지 이동이지만
  모바일에 상세 화면이 없고, 자식은 이미 펼쳐진 상태라 추가로 토글할 대상도 없다).
- 우측: 편집(연필, `accessibilityLabel="할 일 편집"`, 현재는 no-op — 편집 화면 자체가 범위
  밖이라 기존 동작 유지) + 삭제(휴지통, `accessibilityLabel="할 일 삭제"`) 아이콘.
- 자식이 0개인데 펼쳤을 때: "하위 항목이 없습니다" 텍스트 행(웹 `EmptyChildMessage`와 동일
  카피, `text.tertiary`/12px).
- 하위 할 일 추가(웹 `onAddChild`의 Plus 아이콘)는 이번에도 범위 밖 — 루트 카드 우측에
  추가하지 않는다.

### 2-1. TodoListScreen — 로딩

```
┌─────────────────────────────┐
│ ‹ 할 일                      │
├─────────────────────────────┤
│ ▭▭▭▭▭▭▭▭▭▭▭   (skeleton row) │
│ ▭▭▭▭▭▭▭▭      (skeleton row) │
│ ▭▭▭▭▭▭▭▭▭     (skeleton row) │
└─────────────────────────────┘
```

`ActivityIndicator` 단독 대신, 카드 형태의 skeleton row 3~5개(회색 바, opacity pulse
애니메이션)로 교체 — 웹 `CheckboxSkeleton`과 같은 역할(빈 화면 깜빡임 최소화).

### 2-2. TodoListScreen — 에러

```
┌─────────────────────────────┐
│ ‹ 할 일                      │
├─────────────────────────────┤
│           ⚠ (AlertCircle)    │
│    데이터를 불러오지 못했습니다│
│  네트워크 연결을 확인하고     │
│      다시 시도해주세요        │
└─────────────────────────────┘
```

웹 `todoListPage.tsx`의 `EmptyState` 카피를 그대로 사용(`"데이터를 불러오지 못했습니다"` /
`"네트워크 연결을 확인하고 다시 시도해주세요"`) — 단, 기존 테스트가 요구하는 문구
`"할 일을 불러오지 못했습니다"`는 유지해야 하므로 **문구는 기존 테스트 문자열을 그대로 두고,
레이아웃/아이콘만 EmptyState 스타일로 교체**한다(아래 "전달 사항" 참고).

### 2-3. TodoListScreen — 빈 상태

```
┌─────────────────────────────┐
│ ‹ 할 일                      │
├─────────────────────────────┤
│         📋 (ClipboardList)   │
│        할 일이 없습니다       │
│  새로운 할 일을 추가하고      │
│ 생산적인 하루를 시작해보세요! │
│       [ + 새 할일 추가 ]      │
└─────────────────────────────┘
```

웹 `todoList.tsx`의 EmptyState 카피(`"할 일이 없습니다"` / `"새로운 할 일을 추가하고
생산적인 하루를 시작해보세요!"` / `"새 할일 추가"`) 그대로 이식. 이 상태로 전환되는 기준은
위 "빈 상태 판정 정정" 항목대로 **필터링 이후** 프로젝트 카드 개수 0건이다(루트가 전부
`done`이라 화면에 보일 카드가 없는 경우도 포함).

### 3. TodoFormScreen — 기본(접힘)

```
┌─────────────────────────────┐
│ ‹  할 일 추가                 │
├─────────────────────────────┤
│ 할 일                         │
│ ┌───────────────────────┐   │
│ │ 무엇을 해야 하나요?      │   │
│ └───────────────────────┘   │
│                     더보기 ▾ │
│                               │
│         [   추가   ]          │  ← brand.strong, 48px, radius 10
└─────────────────────────────┘
```

### 3-1. TodoFormScreen — 펼침(더보기)

```
┌─────────────────────────────┐
│ ‹  할 일 추가                 │
├─────────────────────────────┤
│ 할 일                         │
│ ┌───────────────────────┐   │
│ │ 무엇을 해야 하나요?      │   │
│ └───────────────────────┘   │
│                               │
│ 설명                          │
│ ┌───────────────────────┐   │
│ │ 상세 설명을 입력하세요   │   │
│ └───────────────────────┘   │
│                               │
│ 우선순위                      │
│ ┌────┐┌────┐┌────┐          │
│ │낮음││보통││높음│  ← 선택된 칩: brand.tint 배경 + brand.strong 텍스트│
│ └────┘└────┘└────┘          │
│                               │
│ 시작일시                      │
│ ┌───────────────────────┐   │
│ │ 2026.08.25 09:00     ✕│   │  ← 값 있으면 X로 클리어 가능
│ └───────────────────────┘   │
│                               │
│ 만료일시                      │
│ ┌───────────────────────┐   │
│ │ 날짜·시간 선택         ▸│   │  ← placeholder(text.tertiary), 값 없으면 화살표만
│ └───────────────────────┘   │
│ (시작일시는 마감일시보다 늦을 수 없습니다) ← danger.text, 12px, 웹과 동일 카피
│                               │
│                      간단히 ▴ │
│                               │
│         [   추가   ]          │
└─────────────────────────────┘
```

- "더보기/간단히" 토글로 설명·우선순위·시작일시·만료일시를 접고 펼치는 구조를 그대로 이식
  (웹 `DetailSection`의 정보 위계와 동일 — 제목만 먼저, 나머지는 선택적 노출).
- 시작일시/만료일시 필드는 `Input`과 동일한 보더 박스 안에 값을 표시하는 **탭형 필드**다.
  탭하면 네이티브 날짜/시간 피커가 뜬다(값 편집 자체는 텍스트 입력이 아니라 피커로만).

---

## dueAt / startAt 입력 UI (신규)

### 데이터 흐름

- `TodoFormScreen`은 현재 `startAt: null, dueAt: null`을 항상 고정 전달한다 — 이 부분만
  실제 입력값으로 교체하면 된다. `useCreateTodo`가 이미 `fields.dueAt`으로 `scheduleReminder`를
  호출하므로 알림 예약은 폼 구현만으로 자동 연결된다.
- 저장 형식은 웹과 동일하게 **UTC ISO 문자열**(`Date.toISOString()`)이어야 한다(dueAt/startAt
  UTC 저장 규칙, `client/src/features/todo/utils` 관례와 동일). 네이티브 피커가 반환하는 `Date`
  객체를 그대로 `toISOString()`하면 된다 — 로컬 자정으로 문자열을 자르는 방식(`split("T")[0]`)은
  금지.
- 유효성 검사: `startAt > dueAt`이면 제출을 막고 인라인 에러를 보여준다. 웹
  `getTodoDateValidationError`와 동일한 카피("시작일시는 마감일시보다 늦을 수 없습니다")를
  그대로 쓴다 — 이 함수는 순수 로직(Date 비교)이라 RN에서도 그대로 재사용 가능
  (`client/src/features/todo/utils/todoDateValidation.ts` import 또는 동일 로직 포팅).

### 인터랙션 (네이티브 피커)

- 필드를 탭하면 `DateTimePicker`가 뜬다. iOS는 `display="inline"` 또는 `"spinner"`를 모달
  형태(BottomSheet 컨테이너 안)로 감싸 웹의 바텀시트 언어와 통일감을 준다. Android는 플랫폼
  관례상 날짜 다이얼로그 → 시간 다이얼로그가 순차로 뜨는 것이 자연스럽다(OS 기본 동작이라
  별도 구현 불필요, `mode="date"` 선택 후 `mode="time"` 재호출).
- 값 표시 포맷: `YYYY.MM.DD HH:mm` (24시간제, 웹 `datetime-local`이 보여주는 정보와 동일—
  단 웹은 브라우저 로캘 표시를 쓰므로 완전 동일 포맷은 아니지만 "날짜+시간을 함께, 24시간제"
  라는 정보 밀도는 맞춘다).
- 비어있을 때 placeholder: "날짜·시간 선택"(text.tertiary 색) + 우측 화살표 아이콘.
- 값이 있을 때: 값 텍스트(text.primary) + 우측 X 아이콘(탭하면 해당 필드만 null로 초기화,
  피커를 열지 않음).
- `startAt`이 `dueAt`보다 늦게 설정되면 즉시(제출 전에도) 인라인 에러를 보여주는 것을
  권장한다 — 최근 웹에서 "시작일시가 마감일시보다 늦어도 저장되던 버그"(커밋 `81f5886`)를
  수정한 이력이 있으므로, 모바일은 처음부터 제출 시점 검증 + 가능하면 즉시 검증까지 둘 다
  갖추는 편이 안전하다.

---

## 컴포넌트 설계

새 공유 컴포넌트는 `mobile/src/shared/ui/`에 둔다(웹 `shared/ui/` 구조를 그대로 따름).

```
mobile/src/theme/
  colors.ts            // client/src/styles/colors.ts 값 복제
  statusColors.ts       // client/src/styles/statusColors.ts 값 복제
  spacing.ts             // 4/8/12/16/24/32 상수

mobile/src/shared/ui/
  button/Button.tsx            // variant: "primary" | "outline" | "text"
  iconButton/IconButton.tsx    // icon, accessibilityLabel, variant?: "danger"
  card/Card.tsx                 // 흰 배경, radius. **정정**: prop을 "좌측 보더 색"
                                 // 단일값이 아니라 (1) 카드 전체 둘레 보더색(자식=상태색,
                                 // 루트=overdue 여부) + (2) 좌측 강조 보더(자식의
                                 // priority=high 전용, 3px danger)로 분리해야 한다
  colorDot/ColorDot.tsx          // 8px 원형 점 (신규) — 루트/자식 카드 공용, 상태변경
                                  // BottomSheet 트리거
  progressBar/ProgressBar.tsx    // 3px 높이 바 (신규) — progress(0~100), isOverdue?
  overdueBadge/OverdueBadge.tsx  // "N일 초과" 배지 (신규)
  recurrenceBadge/RecurrenceBadge.tsx        // "반복" 배지 (신규, 웹 shared/ui 포팅)
  recurrenceMissedBadge/RecurrenceMissedBadge.tsx // "N회 밀림" 배지 (신규, 웹 shared/ui 포팅)
  projectCard/ProjectCard.tsx    // 루트 카드 (신규) — 웹 ProjectCard 대응, TodoListScreen의
                                  // TodoRow(루트 분기)를 대체
  childTodoCard/ChildTodoCard.tsx // 자식 카드 (신규) — 웹 ChildTodoCard 대응, TodoListScreen의
                                  // TodoRow(자식 분기)를 대체
  statusChip/StatusChip.tsx     // **정정** — 기존 구현(라벨+아이콘+chevron 칩)은 웹 어디에도
                                 // 없는 패턴이었다. `ColorDot`으로 대체하고 이 컴포넌트는
                                 // 폐기(또는 ColorDot 기반으로 재작성)
  bottomSheet/BottomSheet.tsx   // Modal 기반, 웹 BottomSheet와 동일 옵션 리스트 UI
  dueBadge/DueBadge.tsx         // TodoListScreen에서는 사용 안 함 — 다른 화면(Today류) 대비 보존
  dateTimeField/DateTimeField.tsx // 탭형 필드 + 네이티브 피커 + X 클리어
  priorityChips/PriorityChips.tsx // 낮음/보통/높음 세그먼트
  emptyState/EmptyState.tsx     // icon, title, description, actionLabel?
  skeleton/ListSkeleton.tsx     // row count → pulse 애니메이션 바

mobile/src/shared/utils/
  due.ts             // 기존 — getDaysLeft/getDueBadgeLabel(+ isTodoOverdue 추가 필요,
                       // 아래 "전달 사항" 참고)
  projectUtils.ts     // 신규 — client/src/features/todo/utils/projectUtils.ts의
                       // getProjectProgress/getProjectSubtaskInfo/getProjectOverdue/
                       // getRecurringMissedCount/collapseRecurringInstances를 로직
                       // 변경 없이 그대로 포팅(순수 함수, Todo[] 인자만 받음)
```

### `IconButton`

```ts
interface IconButtonProps {
  icon: LucideIcon; // lucide-react-native
  onPress: () => void;
  accessibilityLabel: string; // 웹 aria-label과 동일 문구 사용
  variant?: "default" | "danger";
  disabled?: boolean;
}
```

### `BottomSheet`

```ts
interface BottomSheetOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}
interface BottomSheetProps<T extends string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: BottomSheetOption<T>[];
  selectedValue?: T;
  onSelect: (value: T) => void;
}
```

RN `Modal`(`transparent`, `animationType="none"`) + `Animated.timing`으로 slide-up/dim-in을
직접 구현(추가 의존성 없이 가능). 닫힘 애니메이션 200ms — 웹과 동일 타이밍.

### `ColorDot`

```ts
interface ColorDotProps {
  color: string; // 자식 카드: statusColors[status].main / 루트 카드: isOverdue ? danger.main : brand.fill
  onPress?: () => void; // 없으면 순수 표시(가능성 낮음 — 항상 상태변경 트리거로 쓰임)
  accessibilityLabel: string; // "프로젝트 상태 변경" | "할 일 상태 변경" (웹 aria-label과 동일)
}
```

### `ProgressBar`

```ts
interface ProgressBarProps {
  progress: number; // 0~100
  isOverdue?: boolean; // true면 danger.main, 아니면 brand.fill
}
```

### `OverdueBadge`

```ts
interface OverdueBadgeProps {
  daysOver: number; // "N일 초과"로 렌더링
}
```

### `ProjectCard` / `ChildTodoCard`

```ts
// client/src/features/todo/utils/projectUtils.ts의 ProjectCardData와 동일한 shape
interface ProjectCardData {
  todo: Todo;
  childTodos: Todo[];
  progress: number;
  subtaskInfo: { total: number; statusText: string };
  overdueInfo: { isOverdue: boolean; daysOver: number };
  recurringMissedCount: number;
}

interface ProjectCardProps {
  data: ProjectCardData;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onOpenStatusSheet: (todo: Todo) => void;
  onDelete: (id: string) => void;
  // onEdit/onAddChild 없음 — 루트 카드에는 편집/하위추가 UI가 없다(범위 밖, 웹과 동일)
}

interface ChildTodoCardProps {
  todo: Todo;
  onOpenStatusSheet: (todo: Todo) => void;
  onEdit: (todo: Todo) => void; // 현재는 no-op — 편집 화면 자체가 범위 밖(기존 동작 유지)
  onDelete: (id: string) => void;
}
```

### `DateTimeField`

```ts
interface DateTimeFieldProps {
  label: string; // "시작일시" | "만료일시"
  value: string | null; // ISO string
  onChange: (isoString: string | null) => void;
  placeholder?: string; // 기본 "날짜·시간 선택"
}
```

### `PriorityChips`

```ts
interface PriorityChipsProps {
  value: "low" | "medium" | "high";
  onChange: (value: "low" | "medium" | "high") => void;
}
```

---

## 상태 정의

| 화면 | 로딩 | 에러 | 빈 상태 |
| --- | --- | --- | --- |
| LoginScreen | 버튼 텍스트 "로그인 중..." + disabled | 카드 내부 danger 배경 에러 pill | 해당 없음 |
| TodoListScreen | `ListSkeleton` 3~5행 | `EmptyState`(AlertCircle, 기존 테스트 문구 유지) | `EmptyState`(ClipboardList, "할 일이 없습니다" + 액션 버튼) — 판정 기준은 필터링 이후 프로젝트 카드 개수(위 "빈 상태 판정 정정" 참고) |
| TodoFormScreen | 제출 버튼 disabled + "추가 중..." (선택) | 필드 하단 인라인 red 텍스트(제목 필수/날짜 순서) + 폼 하단 general 에러 | 해당 없음(폼 자체가 빈 상태 대상 아님) |

---

## 디자인 토큰

- 색상: 위 "디자인 언어 → 색상" 표. `mobile/src/theme/colors.ts` / `statusColors.ts`로
  값 복제(웹 파일 직접 import는 RN 번들러 대상 밖이라 불가 — 값만 동기화).
- 간격: 4/8/12/16/24/32 (8px 그리드)
- 반경: 6/8/10/12
- 터치 타겟: 모든 Pressable 최소 44×44
- 반응형(`breakpoints.ts`): 모바일 네이티브 앱에는 적용 대상 아님(스코프 밖)

---

## 의사결정 (승인 필요 — 근거 포함)

웹과 "시각적으로 차이 없음"을 최우선으로 하되, RN 플랫폼 관례와 기존 테스트 계약이 상충하는
지점이 3곳 있다. 아래는 권장안이며, 승인해주시면 그대로 스펙을 확정한다.

1. **우선순위 입력을 `<select>` 대신 3-세그먼트 칩으로 변경 (권장)** — 네이티브 드롭다운은
   RN에 표준 컴포넌트가 없고(플랫폼별로 Picker UX가 크게 다름), 옵션이 3개뿐이라 세그먼트 칩이
   더 빠르고 발견성 높은 선택 방식이다. 선택된 칩은 `brand.tint` 배경 + `brand.strong` 텍스트로,
   브랜드 컬러 사용 규칙과도 맞는다.

2. **상태 변경을 "탭-사이클"에서 웹과 동일한 "탭→바텀시트 3택"으로 변경 (권장, 테스트 영향 있음)**
   — 현재 모바일은 상태 칩을 누르면 바로 다음 상태로 순환한다(`status-toggle-{id}` 테스트가 이
   동작을 전제로 함). 웹은 항상 바텀시트로 원하는 상태를 직접 고른다. "시각적으로 차이 없음"
   요구를 인터랙션까지 확장해 웹과 동일한 바텀시트 방식을 권장하며, 이 경우
   `TodoListScreen.test.tsx`의 상태 관련 테스트 3~4건은 "토글 시 바텀시트가 열리고, 옵션을
   선택하면 mutate가 호출된다" 형태로 다시 작성해야 한다(테스트 재작성은 구현 단계 작업).
   만약 테스트 계약을 그대로 유지하고 싶다면 탭-사이클을 유지하되 시각(색/아이콘/모양)만
   웹과 맞추는 대안도 가능 — 이 경우 인터랙션은 웹과 다르다는 점만 감수하면 된다.

3. **삭제 확인은 네이티브 `Alert.alert` 유지 (권장, 웹 `ConfirmModal`과 다름)** — 파괴적 확인은
   모바일에서 OS 네이티브 다이얼로그를 쓰는 것이 플랫폼 관례이고, 이미 구현·테스트되어 있어
   위험이 낮다. "시각적으로 차이 없음"은 색/레이아웃/컴포넌트 언어의 일관성을 뜻하는 것으로
   해석해, 파괴적 확인처럼 OS 관례가 강한 지점은 예외로 둔다. 완전한 시각 동일성을 원하면
   커스텀 `ConfirmModal`을 이식하는 대안도 가능(추가 구현 범위 증가).

4. **카드 탭(웹 `onCardClick`) 동작을 펼치기/접기 토글로 흡수 (권장, 신규)** — 모바일에는 상세
   페이지 자체가 없으므로 웹의 "카드 탭 → 상세 이동"에 대응할 화면이 없다. 아무 동작도 하지
   않는 것(순수 no-op)보다는, 이미 존재하는 chevron 펼치기 토글과 같은 동작을 카드 제목
   영역에도 걸어 탭 가능 영역을 넓히는 편이 자연스럽다(발견성·터치 타겟 모두 개선). chevron
   버튼과 기능이 중복되지만 부작용은 없다.

5. **자식 목록 펼치기 방식은 기존 RN 인라인 확장을 유지, 웹의 `<768px BottomSheet` 변형은
   채택하지 않음 (권장, 신규)** — 웹 `ProjectCard`는 `useMediaQuery("tablet")`로 좁은 화면일 때
   자식 목록을 인라인 `ExpandedArea` 대신 별도 BottomSheet(`ChildTodoCardList` +
   `SheetDeleteButton`)로 보여준다. RN 앱은 항상 이 "좁은 화면" 조건에 해당하지만, 이미
   상태변경에 BottomSheet를 쓰기로 했으므로(위 2번) 자식 목록까지 BottomSheet로 이중화하면
   레이어가 겹쳐 혼란스럽다. 기존 RN 구현의 FlatList 인라인 펼치기(`collapsedIds` 기반)를
   그대로 유지하는 편이 더 단순하고 이미 검증된 패턴이다.

---

## 의사결정 확정 (2026-08-25, 사용자 승인)

1. 우선순위 UI → **3-세그먼트 칩** 채택
2. 상태 변경 인터랙션 → **탭→바텀시트 3택**으로 변경 채택. `TodoListScreen.test.tsx`의 상태 토글 테스트 3~4건 재작성 필요.
3. 삭제 확인 → 기존 **`Alert.alert` 유지** (ConfirmModal 이식 안 함)
4. 신규 의존성 3개(`@react-native-community/datetimepicker`, `lucide-react-native`, `react-native-svg`) **설치 진행** 승인

## 의사결정 확정 (2026-08-25, 사용자 승인 — TodoListScreen 재설계분)

1. 카드 탭 → 펼치기/접기 토글로 흡수. **확정.**
2. 자식 목록은 기존처럼 인라인 유지(웹의 `<768px` BottomSheet 변형 미채택). **확정.**
3. `packages/core/src/types/todo.ts`의 `Todo` 타입에 `recurrenceId`/`overdueArchived`/
   `recurrence` optional 필드 추가. **확정** (client와 동일 타입으로 맞추는 순수 추가, 하위
   호환 영향 없음).

## ui-ux-improver에게 전달할 사항

- **신규 의존성 필요**:
  - `@react-native-community/datetimepicker` — dueAt/startAt 네이티브 피커. Expo SDK 57과
    호환되는 버전으로 설치(`npx expo install @react-native-community/datetimepicker` 권장 —
    Expo가 호환 버전을 자동 선택).
  - `lucide-react-native` — 웹과 동일한 아이콘 세트(PencilIcon, TrashIcon, Plus, ChevronRight/Down,
    Circle, Loader, CheckCircle, Check, AlertCircle, ClipboardList, X, Repeat)를 그대로 쓰기
    위함. `@expo/vector-icons`(번들 포함)는 아이콘 형태가 달라 "시각적으로 차이 없음" 요구와
    충돌하므로 배제.
  - `react-native-svg` — LoginScreen의 구글 4색 G 로고 이식용(웹은 인라인 SVG 사용).
  - 위 3개 모두 GB 단위 다운로드는 아니지만(각각 수백 KB~수 MB 수준 네이티브 모듈), 설치 전
    사용자에게 알리고 진행할 것.
- **`packages/core` Todo 타입 보강 필요 (TodoListScreen 재설계로 신규 발견)**:
  `mobile/src/hooks/useTodos.ts`가 쓰는 `@tododo/core`의 `Todo` 타입
  (`packages/core/src/types/todo.ts`)에는 `recurrenceId`/`overdueArchived`/`recurrence` 필드가
  **선언되어 있지 않다**. 반면 `getTodos()`의 `mapDocToTodo`는 Firestore 문서를 `{ id, ...data }`로
  그대로 스프레드하므로, 반복 할 일 문서라면 런타임에는 값이 실제로 존재한다(타입에만 없음).
  `RecurrenceBadge`/`RecurrenceMissedBadge`/`collapseRecurringInstances`/`getRecurringMissedCount`를
  포팅하려면 이 필드들을 `client/src/features/todo/types/todo.type.ts`와 동일하게(모두
  optional, 값 이름 동일) `packages/core`의 `Todo`에 추가해야 컴파일된다. Firestore 쿼리나
  마이그레이션은 필요 없다(기존 optional 필드 추가라 하위 호환). 이 변경은 `packages/core`가
  client와 공유하는 패키지이므로, 추가만 하고 기존 필드는 건드리지 말 것.
- **`mobile/src/shared/utils/due.ts` 보강**: 웹의 `isTodoOverdue`(`client/src/shared/utils/due.ts`)가
  모바일에 아직 없다. `getProjectOverdue`가 이 함수를 사용하므로 함께 포팅할 것(로직: `!dueAt ||
  status === "done"` → false, 아니면 `getDaysLeft(dueAt) < 0`).
- **테스트 영향**: 위 "의사결정 2"에서 상태 인터랙션을 바텀시트로 바꾸기로 확정하면
  `TodoListScreen.test.tsx`의 상태 토글 관련 테스트(약 4건)를 함께 수정해야 한다. 추가로 이번
  재설계로 인해:
  - 루트 카드에서 편집(연필) 아이콘이 사라지므로, 루트 행에 대해 `accessibilityLabel="할 일
    편집"`을 기대하는 기존 테스트가 있다면 제거/수정 필요(자식 행에는 계속 존재).
  - 루트가 `done`이면 화면에서 사라지는 필터가 추가되므로, 완료된 루트를 만들고 목록에
    남아있는지 확인하는 기존 테스트가 있다면 "숨겨짐"으로 기대값을 뒤집어야 한다.
  - `isEmpty` 판정 기준이 `allTodos.length`에서 필터링 이후 개수로 바뀌므로, "자식만 있고
    루트가 전부 done인 상태"를 빈 상태로 기대하는 테스트를 추가하는 것을 권장.
  - 삭제 버튼을 아이콘 전용으로 바꾸면 `screen.getByText("삭제")` 쿼리가 깨지므로
    `screen.getByLabelText("할 일 삭제")` / `"프로젝트 삭제"` 등 accessibilityLabel 기반 쿼리로
    갱신 필요.
  `TodoFormScreen.test.tsx`의 `getByPlaceholderText("할 일 제목")` / `getByText("추가")`는
  문구를 그대로 유지하면 영향 없음.
- **접근성**: 아이콘 전용 버튼은 반드시 `accessibilityLabel`을 웹 `aria-label`과 동일 문구로
  지정("프로젝트 삭제", "프로젝트 펼치기"/"프로젝트 접기", "할 일 편집", "할 일 삭제" 등).
  `ColorDot`은 `accessibilityRole="button"` + 상태를 알 수 있는 `accessibilityLabel`("프로젝트
  상태 변경" 등, 값 자체는 색으로만 표현하지 말고 라벨에 텍스트로 담을 것 — 색맹 접근성).
  우선순위 칩은 `accessibilityRole="button"`(또는 `"radio"`류 그룹으로 처리 시
  `accessibilityState={{selected}}`) 지정. 날짜 필드는 `accessibilityLabel`에 현재 값을 포함
  (예: "시작일시, 2026년 8월 25일 오전 9시" 또는 값 없으면 "시작일시, 선택 안 함").
- **애니메이션**: 바텀시트 등장 200ms(웹 닫힘 타이밍과 동일), "더보기" 섹션 펼침/접힘은
  `LayoutAnimation` 또는 `Animated`로 300ms ease-in-out(웹 `grid-template-rows 0.3s`와 동일
  타이밍) — 없어도 기능상 문제는 없으나 있으면 웹과 체감이 더 가까워진다. `ProgressFill`의
  `width` 변화는 웹과 동일하게 `Animated.timing` 300ms ease로 처리 권장(선택 사항).
- **UTC 저장 규칙 준수**: dueAt/startAt은 항상 `Date.toISOString()`(UTC "Z" 문자열)로 저장.
  로컬 날짜 문자열을 직접 자르거나 조합하지 말 것(기존 프로젝트에서 반복된 실수 지점).
