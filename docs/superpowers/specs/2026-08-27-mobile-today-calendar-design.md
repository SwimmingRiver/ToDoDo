# 모바일 앱 — 오늘/캘린더 페이지 추가 아키텍처 설계

- 대상: `mobile/` (React Native/Expo 앱)
- 작성일: 2026-08-27
- 상태: 사용자 검토 대기 (승인 시 `writing-plans` → 구현)

## 0. 배경

모바일 8-Task 플랜(`docs/superpowers/plans/2026-08-20-mobile-app-react-native.md`)은 v1 범위를 "핵심 할일 관리만"으로 잡으며 칸반·캘린더를 의도적으로 제외했다. Task 1~7과 UI 스타일 이식(PR #90~97), TodoDetailScreen 추가(PR #98/#99)까지 끝난 지금, 사용자가 "기능이 너무 없다"는 이유로 웹에 있는 오늘/캘린더 화면을 모바일에도 추가하고 싶어한다.

웹은 하단 탭 4개(오늘/목록/캘린더/칸반)를 쓰는 반응형 레이아웃을 이미 갖고 있다. 브레인스토밍에서 확인된 제약과 결정:

| 항목 | 결정 |
| --- | --- |
| 칸반 | 이식하지 않음 — 드래그가 좁은 화면과 안 맞아, 기존에 이미 구현된 "탭 → 상태변경 바텀시트" 패턴으로 대체 |
| 상위 내비게이션 | 하단 탭 3개(오늘/목록/캘린더)로, 웹과 동일한 구조 |
| 캘린더 라이브러리 | `react-native-calendars` (웹의 FullCalendar+dnd-kit은 DOM 전용이라 이식 불가) |
| 오늘 페이지 범위 | 웹과 동일하게 전체 구현(주간 스트립+진행률 바+진행중/완료 목록) |
| 캘린더 드래그 리스케줄 | 이식하지 않음 — 지난 칸반 논의와 같은 이유(좁은 화면, 제스처 충돌) |

## 1. 결정된 설계 개요

- `RootNavigator`의 단일 Stack을 `인증 분기 Stack → Tab(오늘/목록/캘린더) → 각 탭 내부 Stack`으로 재구성한다.
- 웹의 `isDateInTodoRange`, `toDateKey`, `toDateKeyFromISO`, `getStripDates`, `getDaysLeft` 로직을 `mobile/src/shared/utils/dateRange.ts`에 순수 함수로 새로 작성한다(웹 파일을 import하지 않음 — RN 번들러가 `client/` 밖 파일을 못 읽는 기존 제약, `mobile/src/theme/colors.ts` 상단 주석 참고).
- 오늘/캘린더 화면 모두 기존 `useTodos()`(TanStack Query, Firestore 구독 없이 폴링) 데이터를 그대로 재사용한다 — 신규 쿼리 훅 없음.
- 날짜 탭 시 그 날의 할 일 목록은 기존 `BottomSheet` 컴포넌트(`shared/ui/bottomSheet`)를 재사용한다 — 상태변경 때 쓰던 것과 동일한 컴포넌트, 다른 콘텐츠.

### 명시적으로 채택하지 않은 것

- **칸반 보드 화면**: 위 배경 절 참고. 상태변경은 이미 리스트 화면의 탭→바텀시트로 커버됨.
- **캘린더 드래그 리스케줄**: 터치 제스처가 리스트 스크롤과 충돌하고, 웹에서도 반복 항목은 막혀 있어 모바일에서 얻는 가치가 작음. 날짜를 바꾸려면 `TodoFormScreen`을 연다.
- **`packages/core`에 날짜 유틸 이동**: 이번 기능만으로 core에 새 계층을 만들 근거가 약함. 웹도 아직 `client/src/shared/utils`에 로컬로 두고 있어 대칭적이다. 세 번째 소비처가 생기면 그때 승격을 재검토한다.
- **Firestore 실시간 리스너 도입**: 오늘/캘린더 화면도 기존 `useTodos()`의 폴링 방식을 그대로 쓴다. 실시간성 요구가 이번 스코프에 없다.
- **주간 스트립의 range 포함 확장**: 웹 쪽에서도 "마감 임박(빨간 점)" 마커는 의도적으로 dueAt 단독 기준을 유지하고 있다(`useTodayTodos.ts` 주석 참고). 모바일도 동일 정책을 그대로 따른다.

## 2. 내비게이션 구조

```
RootNavigator (Stack, 인증 분기)
└── (인증됨) MainTabs (BottomTabNavigator)
    ├── 오늘 탭 (Stack)
    │   └── TodayScreen
    ├── 목록 탭 (Stack)
    │   ├── TodoListScreen
    │   └── TodoFormScreen
    └── 캘린더 탭 (Stack)
        └── CalendarScreen
```

- `TodoDetailScreen`/`TodoFormScreen`은 특정 탭에 종속되지 않고 어느 탭에서 진입했든 그 탭의 Stack 위에 쌓인다 — React Navigation의 nested navigator 패턴대로, 각 탭 Stack의 `Screen` 목록에 `TodoDetail`/`TodoForm`을 등록한다.
- 탭 아이콘: `lucide-react-native`에서 웹과 동일하게 `Sun`(오늘) / `ListTodo`(목록) / `CalendarDays`(캘린더).
- 로그인 화면은 지금처럼 Tab 밖의 최상위 Stack에 남는다 — 인증 분기 자체는 바꾸지 않음.

**파라미터 타입: 탭별로 분리한다(공유 타입 대신).** 하나의 큰 `TodoStackParamList`를 세 탭이 공유하면 "오늘 탭 화면에서 타입상 목록 탭 전용 라우트로 navigate 가능"한 것처럼 보이는 부정확함이 생긴다. `TodoDetail`/`TodoForm`의 파라미터 모양만 공유 타입으로 뽑고, 탭별 스택 타입은 각자 선언한다:

```ts
// navigation/types.ts
export type TodoDetailParams = { id: string };
export type TodoFormParams = { parentId?: string; dueAt?: string } | undefined;

export type TodayStackParamList = {
  Today: undefined;
  TodoDetail: TodoDetailParams;
  TodoForm: TodoFormParams;
};

export type TodoListStackParamList = {
  TodoList: undefined;
  TodoForm: TodoFormParams;
  TodoDetail: TodoDetailParams;
};

export type CalendarStackParamList = {
  Calendar: undefined;
  TodoDetail: TodoDetailParams;
  TodoForm: TodoFormParams;
};
```

`TodoFormParams`에 `dueAt`을 추가한 이유는 5절의 "빈 날짜에서 바로 추가" 때문이다 — 캘린더/오늘 화면에서 특정 날짜를 탭한 채로 추가 화면을 열면 그 날짜를 마감일로 미리 채워준다.

## 3. 공유 날짜 유틸리티 (`mobile/src/shared/utils/dateRange.ts`)

웹 로직을 1:1로 옮기되 순수 함수만 남긴다(React 의존 없음, Jest로 유닛 테스트):

```ts
export type DayMarker = "none" | "normal" | "danger";

export const toDateKey = (date: Date): string => /* YYYY-MM-DD, 로컬 기준 */;
export const toDateKeyFromISO = (iso: string): string => /* UTC 저장값 → 로컬 날짜 키, dueAt-utc-storage 메모 정책 준수 */;
export const isDateInTodoRange = (dateKey: string, todo: Todo): boolean => /* startAt~dueAt 포함 판정 */;
export const getStripDates = (windowStart: string): Date[] => /* 7일 배열 */;
export const getDaysLeft = (dueAtIso: string): number;
```

주의: `dueAt`/`startAt`은 UTC `Z` 문자열로 저장돼 있어 `split("T")[0]`으로 날짜를 뽑으면 KST에서 하루 밀린다(기존 메모 정책). `toDateKeyFromISO`는 반드시 로컬 변환을 거친다 — 이 부분이 이번 기능에서 가장 버그 나기 쉬운 지점이라 유닛 테스트에서 타임존 경계 케이스(자정 근처 UTC 시각)를 명시적으로 다룬다.

## 4. 오늘 페이지 (`TodayScreen`)

**구성 요소** (`mobile/src/screens/TodayScreen.tsx` + `mobile/src/shared/ui/`에 신규 프레젠테이션 컴포넌트):

- `WeekStrip`: 7일 가로 스크롤, 날짜별 `DayMarker`로 점 색상(`danger` → `colors.danger.main`, `normal` → `colors.brand.fill`, `none` → 표시 안 함). 탭하면 `selectedDate` 변경.
- `DailyProgress`: 선택된 날짜의 완료/전체 카운트 + 진행률 바.
- 진행중/완료 목록: 기존 `ProjectCard`/`ChildTodoCard` 대신, 오늘 화면은 프로젝트 트리 구조가 아니라 평평한 목록이므로 `TodoListScreen`과는 다른 단순 리스트 아이템 컴포넌트를 하나 새로 만든다(`TodayTodoItem`) — 체크박스+제목+기간 뱃지.
- 항목 탭 → `TodoDetail`로 네비게이트, 체크박스 탭 → 기존 `useUpdateTodo`로 `status`/`doneAt` 토글(웹 `toggleDone`과 동일 로직).

**데이터 흐름**: `useTodos()` → `dateRange.ts`의 `isDateInTodoRange`로 `selectedDate` 필터 → `status !== "done"` / `status === "done"`로 분리 → `doneTodos`는 `doneAt` 내림차순 정렬(웹과 동일).

**상태**: `selectedDate`(기본값 오늘), `windowStart`(주간 스트립 기준일) — 화면 로컬 `useState`, 전역 상태 없음.

## 5. 캘린더 페이지 (`CalendarScreen`)

**구성 요소** (`mobile/src/screens/CalendarScreen.tsx`):

- `react-native-calendars`의 `Calendar` 컴포넌트, `markingType="multi-dot"`로 날짜별 점 표시.
  - 점 색상: overdue(마감 지났고 미완료) → `colors.danger.main`, 그 외 진행중 → 해당 `statusColors[status].main`, 완료만 있는 날은 표시하지 않음(웹 마커 정책과 동일하게 "위험 신호" 우선).
  - **반복 항목 전용 표시는 이번 스코프에서 완전히 제외한다** — 모바일은 아직 반복 할 일 생성/편집 UI 자체가 없고(웹에서 만든 반복 항목이 보이기만 하는 상태), 이 기능만을 위해 반복 배지·구분 색을 새로 만들 근거가 약하다. 반복 여부와 무관하게 상태/overdue 기준으로만 점을 찍는다.
- 날짜 탭(`onDayPress`) → `BottomSheet` 오픈. 항목이 있든 없든 항상 연다.
  - 항목이 있으면 `isDateInTodoRange`로 필터링한 목록(오늘 화면의 `TodayTodoItem` 재사용) + 상단/하단에 "할 일 추가" 버튼.
  - 항목이 0건이면 `EmptyState`("이 날짜엔 할 일이 없어요") + 같은 "할 일 추가" 버튼.
  - "할 일 추가" 버튼 → 바텀시트 닫고 `TodoForm`으로 네비게이트, `dueAt: selectedDate`를 파라미터로 넘겨 마감일을 미리 채운다(2절 `TodoFormParams.dueAt`).
- 항목 탭 → 바텀시트 닫고 `TodoDetail`로 네비게이트.
- 월 전환(`onMonthChange`)은 라이브러리 기본 동작 그대로 — 별도 데이터 재요청 없음(`useTodos()`가 이미 전체 목록을 들고 있음).

**명시적 스코프 제외**: 이벤트 생성(캘린더에서 바로 할 일 추가), 주간 뷰 토글(웹은 `dayGridMonth`/`dayGridWeek` 토글 지원) — 1차는 월간 뷰만.

## 6. 로딩/에러/빈 상태

- `useTodos()`의 `isLoading`/`isError`는 기존 `TodoListScreen`과 동일한 컴포넌트(`ListSkeleton`, 에러 시 `EmptyState` + 재시도 안내)를 오늘/캘린더 화면에도 그대로 재사용한다.
- 오늘 화면에서 선택 날짜에 할 일이 0건이면 `EmptyState`("오늘 할 일이 없어요") + 5절과 동일한 "할 일 추가" 버튼(선택된 날짜를 `dueAt`으로 프리필). 캘린더와 인터랙션을 통일한다.
- 캘린더 바텀시트에서 해당 날짜에 할 일이 0건이어도 바텀시트는 항상 연다(5절) — 빈 상태를 보여주는 것 자체가 "이 날짜에 추가하기" 진입점이 되도록.
- `TodoFormScreen`은 이미 `route.params?.parentId` 방식으로 파라미터를 읽고 있어(`useRoute<RouteProp<..., "TodoForm">>()`), `dueAt`도 같은 패턴으로 추가해 초기값에 반영한다.

## 7. 테스트 계획

기존 mobile 컨벤션(Jest + `@testing-library/react-native`, TDD)을 그대로 따른다.

- `dateRange.ts`: 순수 함수 유닛 테스트, 타임존 경계 케이스 포함 (`personal-mac-low-disk`/CI와 무관하게 로컬 `Date`만 사용, [[absolute-date-test-fixtures]] 정책대로 시스템 시간 mock).
- `TodayScreen`: `useTodos` mock으로 진행중/완료 분리, 진행률 계산, 체크박스 토글 mutation 호출 검증.
- `CalendarScreen`: 마킹 색상 계산 로직(overdue/status 우선순위)과 날짜 탭 시 필터링 결과를 유닛 테스트로, 컴포넌트 렌더 테스트는 바텀시트가 항목 유무와 무관하게 항상 열리는지, "할 일 추가" 버튼이 `dueAt` 파라미터를 채워 `TodoForm`으로 navigate하는지를 검증.
- `TodoFormScreen`: 신규 `route.params.dueAt`이 초기 마감일 값에 반영되는지 회귀 테스트 추가.
- 내비게이션 재구성: 기존 `RootNavigator` 관련 테스트(있다면)가 깨지지 않는지 확인 + 탭 전환 후 뒤로가기 스택이 꼬이지 않는지는 시뮬레이터 수동 확인([[e2e-local-java21]] 환경 제약 참고, 자동화 E2E는 8-Task 플랜에서도 이미 범위 밖으로 결정됨).

## 8. 스펙 리뷰 결정 (2026-08-27)

1. **빈 날짜 탭** → 바텀시트를 항상 열고, 빈 상태에도 "할 일 추가" 버튼을 둔다(5·6절 반영).
2. **반복 항목 표시** → 이번 스코프에서 완전히 제외(5절 반영). 모바일에 반복 생성/편집 UI가 없는 상태라 지금 만들 근거가 없다.
3. **내비게이션 타입** → 탭별로 분리(`TodayStackParamList`/`TodoListStackParamList`/`CalendarStackParamList`), `TodoDetail`/`TodoForm` 파라미터 모양만 공유 타입으로 추출(2절 반영).
