# Dashboard 캘린더 중심 개편 — 디자인 스펙

- 대상 파일: `client/src/features/dashboard/`
- 작성일: 2026-06-27
- 상태: **구현 완료** (커밋 `81f6db7 feat: 파이차트 제거 및 캘린더 대시보드 개편`) — 본 문서는 구현 참고용 기록으로 보존

---

## 0. 변경 범위 요약

| 항목 | 현재 | 변경 후 |
|---|---|---|
| 파이차트 | dashboard에 공존 | 제거 (pieChart.tsx, pieChartPage.tsx 삭제 또는 라우트 분리는 PM 확인) |
| 캘린더 뷰 | 월간 고정 | 월간 / 주간 전환 |
| 날짜 클릭 | 조회 전용 BottomSheet | 조회 + 생성 버튼 포함 |
| 드래그 | 없음 | 이벤트 드래그 → dueAt 즉시 저장 |
| 기한 초과 | 강조 없음 | 빨간 이벤트 바 |

---

## 1. 화면 구조

### 1-1. 전체 레이아웃 (월간 뷰, 데스크톱 기준)

```
┌──────────────────────────────────────────────────────────┐
│ (기존 Header / SNB 유지)                                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  [월간]  [주간]          < 2025년 6월 >  [오늘]    │  │  ← 뷰 전환 + FullCalendar 내장 toolbar
│  ├───────────────────────────────────────────────────┤  │
│  │  일      월      화      수      목      금      토 │  │
│  ├──────┬──────┬──────┬──────┬──────┬──────┬──────┤  │
│  │  1   │  2   │  3   │  4   │  5   │  6   │  7   │  │
│  │      │■■■■  │      │      │      │      │      │  │  ← 초록 이벤트 바 (todo/doing/done)
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤  │
│  │  8   │  9   │ 10   │ 11   │ 12   │ 13   │ 14   │  │
│  │      │      │▓▓▓▓▓▓│      │■■■■  │      │      │  │  ← 빨간 이벤트 바 (기한 초과)
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤  │
│  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 1-2. 뷰 전환 버튼 위치

뷰 전환 버튼은 FullCalendar 기본 toolbar 위, 캘린더 컨테이너 내부 상단에 별도 행으로 배치한다.
FullCalendar의 `headerToolbar` prop에 커스텀 버튼을 추가하는 방식이 아니라, `CalendarContainer` 내부에 `ViewToggle` 컴포넌트를 먼저 렌더링한 뒤 FullCalendar를 렌더링하는 구조를 사용한다.

```
┌────────────────────────────────────────────────────┐
│  [월간] [주간]   ← ViewToggle (좌측 정렬)           │  ← 신규 행
├────────────────────────────────────────────────────┤
│  < 2025년 6월 >                            [오늘]   │  ← FullCalendar headerToolbar
├────────────────────────────────────────────────────┤
│  일   월   화   수   목   금   토                   │
│  ...                                               │
└────────────────────────────────────────────────────┘
```

### 1-3. BottomSheet (날짜 클릭 후)

```
┌──────────────────────────────┐
│  ────  (핸들, 모바일만 표시)   │
│                               │
│  2025년 6월 10일 화요일        │  ← 선택된 날짜 타이틀
│  ─────────────────────────── │
│                               │
│  ┌─────────────────────────┐ │
│  │▌ 디자인 시안 검토         │ │  ← 기존 DayDetailItem 유지
│  │  진행 중 · 마감: 6월 10일 │ │
│  └─────────────────────────┘ │
│  ┌─────────────────────────┐ │
│  │▌ 기한 초과 할 일          │ │  ← 초과 항목: 왼쪽 보더 #E24B4A
│  │  할 일 · 마감: 6월 8일   │ │     배경 #FBEAEA
│  └─────────────────────────┘ │
│                               │
│  ┌─────────────────────────┐ │
│  │  + 이 날짜에 할 일 추가  │ │  ← 신규 AddButton (초록 아웃라인)
│  └─────────────────────────┘ │
│                               │
│  ─────────────────────────── │
│         취소                   │
└──────────────────────────────┘

[빈 상태 - 해당 날짜 todo 없음]
┌──────────────────────────────┐
│  2025년 6월 10일 화요일        │
│  ─────────────────────────── │
│                               │
│  (캘린더 아이콘)               │
│  이 날짜에 할 일이 없습니다    │
│                               │
│  ┌─────────────────────────┐ │
│  │  + 이 날짜에 할 일 추가  │ │
│  └─────────────────────────┘ │
│  ─────────────────────────── │
│         취소                   │
└──────────────────────────────┘
```

### 1-4. 할 일 생성 Modal (BottomSheet 위에 띄움)

```
┌──────────────────────────────────┐
│  [X]                              │  ← 기존 Modal 컴포넌트 재사용
│                                   │
│  할 일                            │
│  ┌────────────────────────────┐  │
│  │ 무엇을 해야 하나요?         │  │
│  └────────────────────────────┘  │
│                                   │
│  [더보기 ▼]                       │
│   └ 설명, 우선순위, 시작일시,      │
│     만료일시 (= 선택한 날짜 pre-fill)│
│                                   │
│  ┌────────────────────────────┐  │
│  │          Submit             │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### 1-5. 주간 뷰 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│  [월간] [주간]                                            │
│  < 2025년 6월 9일 - 6월 15일 >                 [오늘]    │
├─────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┤
│     │ 일/9 │ 월/10│ 화/11│ 수/12│ 목/13│ 금/14│ 토/15│
│     │      │■■■■  │      │▓▓▓▓▓ │      │      │      │
└─────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
```
주간 뷰는 `dayGridPlugin`의 `dayGridWeek` view를 사용한다.
이벤트가 시간 단위 표시가 아닌 all-day bar 형식으로 표시되므로 월간 뷰와 일관된 시각 언어를 유지한다.

---

## 2. 디자인 언어

### 2-1. 색상

| 용도 | 토큰 | 값 |
|---|---|---|
| 이벤트 바 (todo 상태) | `statusColors.todo.main` | `#6B7280` |
| 이벤트 바 (doing 상태) | `statusColors.doing.main` | `#3B82F6` |
| 이벤트 바 (done 상태) | `statusColors.done.main` | `#1D9E75` |
| 이벤트 바 (기한 초과) | `colors.danger.main` | `#E24B4A` |
| 기한 초과 이벤트 배경 (옅은) | `colors.danger.background` | `#FBEAEA` |
| 기한 초과 BottomSheet 항목 배경 | `colors.danger.background` | `#FBEAEA` |
| 기한 초과 BottomSheet 항목 보더 | `colors.danger.main` | `#E24B4A` |
| 뷰 전환 버튼 활성 배경 | `colors.brand.secondary` | `#1D9E75` |
| 뷰 전환 버튼 활성 텍스트 | `#FFFFFF` | |
| 뷰 전환 버튼 비활성 배경 | `transparent` | |
| 뷰 전환 버튼 비활성 텍스트 | `colors.text.secondary` | `#5F6368` |
| 뷰 전환 버튼 비활성 보더 | `colors.border.secondary` | `#D1D5DB` |
| AddButton 텍스트/아이콘 | `colors.brand.secondary` | `#1D9E75` |
| AddButton 보더 | `colors.brand.secondary` | `#1D9E75` |
| AddButton hover 배경 | `#F0FBF7` (brand.secondary 10% 알파 상당) | |
| 날짜 셀 hover 배경 | `#F5F5F5` (기존 유지) | |
| 드래그 drop 타겟 셀 | `#E8F5EF` (brand.secondary 15% 알파 상당) | |

### 2-2. 기한 초과 판정 기준

```
isOverdue(todo) =
  todo.dueAt !== null
  AND new Date(todo.dueAt) < startOfToday()
  AND todo.status !== "done"
```

`startOfToday()`는 오늘 날짜의 00:00:00 기준. `dueAt`이 오늘 자정 이전이면 초과로 판정한다.
기존 `shared/utils/due.ts`의 유틸 함수 패턴을 참고하거나 캘린더 컴포넌트 내 인라인 계산 사용.

### 2-3. 간격 및 크기

| 요소 | 값 |
|---|---|
| 뷰 전환 버튼 패딩 | `6px 16px` |
| 뷰 전환 버튼 border-radius | `6px` |
| 뷰 전환 버튼 폰트 크기 | `14px` |
| 뷰 전환 버튼 폰트 굵기 | `500` |
| 뷰 전환 버튼 그룹 gap | 0 (버튼 그룹 연속 배치, 좌우 버튼이 인접) |
| 뷰 전환 행 하단 여백 | `8px` |
| 이벤트 바 border-radius | `4px` (기존 유지) |
| BottomSheet AddButton 패딩 | `12px 16px` |
| BottomSheet AddButton border-radius | `8px` |
| BottomSheet AddButton 폰트 크기 | `14px` |
| BottomSheet AddButton 상단 여백 (리스트 또는 EmptyMessage와의 gap) | `12px` |
| BottomSheet AddButton 하단 여백 (CancelButton 구분선 위) | `8px` |
| 모든 인터랙티브 요소 최소 터치 타겟 | `44px` (height 기준) |

### 2-4. 타이포그래피

뷰 전환 버튼, AddButton 모두 기존 `CalendarContainer` 내 폰트 시스템 상속. 별도 폰트 도입 없음.

---

## 3. 컴포넌트 설계

### 3-1. 수정 대상

#### `calendar.tsx`

현재 단일 컴포넌트. 아래 4개 기능을 추가한다.

**추가할 state:**
```ts
const [calendarView, setCalendarView] = useState<"dayGridMonth" | "dayGridWeek">("dayGridMonth");
const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
```

**수정할 FullCalendar props:**
```ts
// 기존
plugins={[dayGridPlugin, interactionPlugin]}
initialView="dayGridMonth"

// 변경
plugins={[dayGridPlugin, interactionPlugin]}
initialView={calendarView}
editable={true}              // 드래그 활성화
eventDrop={handleEventDrop}  // 드래그 완료 콜백
```

**추가할 이벤트 변환 로직 (events useMemo 내):**
```ts
// 기한 초과 여부를 extendedProps에 추가하고 color를 override
const today = new Date();
today.setHours(0, 0, 0, 0);

return todos
  ?.filter((todo: Todo) => todo.startAt !== null || todo.dueAt !== null)
  .map((todo: Todo) => {
    const overdue =
      todo.dueAt !== null &&
      new Date(todo.dueAt) < today &&
      todo.status !== "done";

    return {
      id: todo.id,
      title: todo.title,
      start: todo.startAt ?? undefined,
      end: todo.dueAt ?? undefined,
      color: overdue
        ? colors.danger.main
        : (statusColors[todo.status as Status]?.main ?? statusColors.todo.main),
      extendedProps: {
        status: todo.status,
        overdue,
      },
    };
  });
```

**추가할 handleEventDrop:**
```ts
const handleEventDrop = useCallback((info: EventDropArg) => {
  const todo = todos?.find((t: Todo) => t.id === info.event.id);
  if (!todo) return;

  const newDueAt = info.event.end
    ? info.event.end.toISOString()
    : info.event.start?.toISOString() ?? null;

  useUpdateTodo.mutate({
    ...todo,
    dueAt: newDueAt,
  } as Todo);
}, [todos, useUpdateTodo]);
```

`handleEventDrop`에서 `useUpdateTodo`를 사용하기 위해 `useTodo()`에서 `useUpdateTodo`도 구조분해한다.

**수정할 BottomSheet children:**
조회 목록 하단에 AddButton 추가. AddButton 클릭 시 `isCreateModalOpen = true`.

**추가할 Modal (BottomSheet 아래, JSX 최하단):**
기존 `Modal` 컴포넌트 + `TodoForm` 조합. `TodoForm`은 `dueAt` prop을 받아 pre-fill한다.
단, 현재 `TodoForm`은 `defaultValues.dueAt`을 `todo` prop에서만 읽으므로, 날짜 pre-fill을 위해 `initialDueAt?: string` prop을 추가하거나 `todo` prop에 partial 객체를 전달하는 방식 중 하나를 선택한다.

**권장 방식: `TodoForm`에 `initialDueAt` prop 추가**
```ts
// TodoForm interface 확장 (todoForm.tsx 수정 필요)
interface TodoFormProps {
  todo?: Todo;
  parentId?: string;
  initialDueAt?: string;  // 신규
  onClose?: () => void;
}
```
`initialDueAt`이 주어지면 `defaultValues.dueAt`에 해당 값을 datetime-local 포맷(`yyyy-MM-DDTHH:mm`)으로 변환하여 세팅.

**수정된 BottomSheet children 구조:**
```tsx
<BottomSheet ...>
  {selectedDateTodos.length > 0 ? (
    <DayDetailList>
      {selectedDateTodos.map((todo: Todo) => (
        <DayDetailItem
          key={todo.id}
          $color={isOverdue(todo) ? colors.danger.main : statusColors[todo.status]?.main}
          $overdue={isOverdue(todo)}
        >
          ...
        </DayDetailItem>
      ))}
    </DayDetailList>
  ) : (
    <EmptyMessage>이 날짜에 할 일이 없습니다</EmptyMessage>
  )}
  <AddButton onClick={() => setIsCreateModalOpen(true)}>
    <Plus size={16} />
    이 날짜에 할 일 추가
  </AddButton>
</BottomSheet>

<Modal isOpen={isCreateModalOpen} setIsOpen={setIsCreateModalOpen}>
  <TodoForm
    initialDueAt={selectedDate ?? undefined}
    onClose={() => setIsCreateModalOpen(false)}
  />
</Modal>
```

#### `calendar.styles.tsx`

**수정:**
- `.fc-daygrid-event`의 `pointer-events: none` 제거 → 드래그를 위해 이벤트 바가 마우스 이벤트를 받아야 함
- 드래그 중 drop 타겟 셀 스타일 추가

**추가:**
- `ViewToggleRow` - 뷰 전환 버튼 행 래퍼
- `ViewButton` - 뷰 전환 개별 버튼 (`$active: boolean`)
- `AddButton` - BottomSheet 내 할 일 추가 버튼
- 기한 초과 이벤트 drag 중 배경색 (FullCalendar drag ghost)
- `DayDetailItem`에 `$overdue?: boolean` prop 추가 → 배경색 분기

### 3-2. 신규 컴포넌트 없음

뷰 전환 버튼은 `calendar.styles.tsx`에 styled-components로 정의하고 `calendar.tsx` 내에서 직접 렌더링한다. 별도 파일 분리는 불필요한 복잡성을 추가하므로 하지 않는다.

### 3-3. 인터페이스 정의

**ViewButton:**
```ts
const ViewButton = styled.button<{ $active: boolean }>`
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid ${({ $active }) =>
    $active ? colors.brand.secondary : colors.border.secondary};
  background-color: ${({ $active }) =>
    $active ? colors.brand.secondary : "transparent"};
  color: ${({ $active }) =>
    $active ? "#ffffff" : colors.text.secondary};
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  min-height: 44px;

  &:first-child {
    border-radius: 6px 0 0 6px;
  }
  &:last-child {
    border-radius: 0 6px 6px 0;
    border-left: none;
  }
`;
```

**DayDetailItem (수정):**
```ts
const DayDetailItem = styled.li<{ $color: string; $overdue?: boolean }>`
  padding: 12px 16px;
  border-left: 4px solid ${({ $color }) => $color};
  background-color: ${({ $overdue }) =>
    $overdue ? colors.danger.background : "#f9f9f9"};
  margin-bottom: 8px;
  border-radius: 0 8px 8px 0;
`;
```

**AddButton:**
```ts
const AddButton = styled.button`
  width: calc(100% - 32px);
  margin: 12px 16px 8px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1.5px solid ${colors.brand.secondary};
  border-radius: 8px;
  background-color: transparent;
  color: ${colors.brand.secondary};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  min-height: 44px;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: #f0fbf7;
  }
  &:active {
    background-color: #d1f5e8;
  }
`;
```

**ViewToggleRow:**
```ts
const ViewToggleRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  padding: 0 4px;
`;
```

---

## 4. 인터랙션 플로우

### 4-1. 날짜 클릭 → 조회 + 생성

```
사용자가 캘린더 날짜 셀 클릭
  ↓
setSelectedDate(info.dateStr)
setIsBottomSheetOpen(true)
  ↓
BottomSheet 슬라이드업 (기존 애니메이션 유지)
  → 해당 날짜 todo 목록 표시
  → 하단에 "+ 이 날짜에 할 일 추가" 버튼 항상 표시
  ↓
[사용자가 AddButton 클릭]
  ↓
setIsCreateModalOpen(true)
  ↓
Modal 오픈 (BottomSheet 위에 z-index 9999로 겹침)
  → TodoForm 렌더링, dueAt = selectedDate 00:00 pre-fill
  ↓
[사용자가 Submit]
  ↓
useCreateTodo.mutate(data) 호출
  → 성공: toast.success + Modal 닫힘 + BottomSheet 유지 (목록 자동 갱신)
  → 실패: toast.error
  ↓
[사용자가 Modal X 버튼 또는 배경 클릭]
  ↓
setIsCreateModalOpen(false) (BottomSheet는 유지)
```

### 4-2. 드래그 → dueAt 변경

```
사용자가 이벤트 바를 클릭+홀드
  ↓
FullCalendar 기본 drag ghost 표시 (이벤트 바 반투명 복사본이 커서 따라 이동)
  ↓
다른 날짜 셀 위에 올라갈 때
  ↓
FullCalendar 기본 동작: 해당 날짜 셀이 하이라이트됨
  → 추가 스타일: .fc-day:hover (드래그 중) 배경 #E8F5EF
    (FullCalendar의 .fc-highlight 클래스에 배경 적용)
  ↓
마우스 릴리즈 (드롭)
  ↓
handleEventDrop(info) 호출
  → info.event.id로 todo 찾기
  → info.event.end 또는 info.event.start로 새 dueAt 계산
  → useUpdateTodo.mutate({ ...todo, dueAt: newDueAt })
  → 성공: 캘린더 즉시 반영 (optimistic update 미적용, invalidateQueries로 서버 재조회)
  → 실패: info.revert() 호출 → 이벤트 원래 위치로 복귀 + toast.error
  ↓
```

드래그 실패 시 원상복구는 FullCalendar의 `info.revert()`를 호출해야 하므로, `handleEventDrop` 내 `useUpdateTodo.mutate`의 `onError` 콜백에서 `info.revert()` 호출. `info`를 클로저로 capture해야 하므로 `useCallback` 의존성 배열에 주의.

**중요:** 현재 `.fc-daygrid-event`에 `pointer-events: none`이 설정되어 있어 이벤트 바가 클릭/드래그를 받지 못한다. 이 CSS를 제거해야 드래그가 동작한다. 제거 후 날짜 클릭(`dateClick`)과 이벤트 클릭이 충돌하지 않는지 확인 필요 (FullCalendar는 이벤트 클릭과 날짜 클릭을 분리 처리하므로 일반적으로 충돌 없음).

### 4-3. 기한 초과 강조 표시

```
events useMemo 재계산 시
  ↓
각 todo에 대해 isOverdue 판정
  ↓
overdue === true → color: colors.danger.main (#E24B4A)
overdue === false → color: statusColors[status].main (기존)
  ↓
FullCalendar가 event.color로 이벤트 바 배경색 적용
  ↓
결과: 초과 항목 = 빨간 이벤트 바, 정상 항목 = 상태별 색상 바
```

BottomSheet 내에서도 기한 초과 항목은 `$overdue={true}` → 배경색 `#FBEAEA`, 왼쪽 보더 `#E24B4A`.

### 4-4. 뷰 전환

```
사용자가 [월간] 또는 [주간] 버튼 클릭
  ↓
setCalendarView("dayGridMonth" | "dayGridWeek")
  ↓
FullCalendar의 calendarRef.current.getApi().changeView(calendarView) 호출
  → useEffect로 calendarView state 변화 감지 후 changeView 호출
     OR FullCalendar의 `initialView` 대신 `key` prop 변경으로 재마운트 (간단하지만 비효율)
     → 권장: useEffect + getApi().changeView()
  ↓
FullCalendar 뷰 전환 애니메이션 없이 즉시 변경
  ↓
[주간] 활성 → 해당 주의 7일 표시
  → 기존 월간 뷰 이벤트/드래그/클릭 동작 모두 동일하게 작동
```

**useEffect 패턴:**
```ts
useEffect(() => {
  if (calendarRef.current) {
    calendarRef.current.getApi().changeView(calendarView);
  }
}, [calendarView]);
```

---

## 5. 상태 정의

### 5-1. 로딩 상태

기존 `Spinner` 컴포넌트 유지. `isLoading === true`이면 `CalendarContainer` 전체를 `LoadingWrapper + Spinner`로 대체.

### 5-2. 에러 상태

기존 `EmptyState` 컴포넌트 유지 (AlertCircle 아이콘, "캘린더 데이터를 불러오지 못했습니다").

### 5-3. 이벤트 없는 날짜 클릭

BottomSheet 내 todo 목록 없음 → 기존 `<EmptyMessage>이 날짜에 할 일이 없습니다</EmptyMessage>` 유지.
AddButton은 빈 상태에서도 항상 표시.

### 5-4. 드래그 중

FullCalendar 기본 ghost UI (별도 커스텀 없음). drop 타겟 셀에는 `.fc-highlight` 클래스가 자동 부여되므로 이 클래스에 `background-color: #E8F5EF` 스타일 추가.

### 5-5. 드래그 실패 (네트워크 에러)

`info.revert()` 호출 → 이벤트 원래 위치로 즉시 복귀. `toast.error("저장 실패", "할 일 날짜 변경 중 오류가 발생했습니다")` 출력.

### 5-6. 뷰 전환 버튼 상태

| 상태 | 월간 버튼 | 주간 버튼 |
|---|---|---|
| 월간 활성 | 배경 #1D9E75, 텍스트 #fff | 배경 transparent, 텍스트 #5F6368 |
| 주간 활성 | 배경 transparent, 텍스트 #5F6368 | 배경 #1D9E75, 텍스트 #fff |
| hover (비활성 버튼) | 배경 #F4F5F6 | 배경 #F4F5F6 |

---

## 6. 모바일 대응

### 6-1. 뷰 전환 버튼 (모바일 ≤480px)

```
${media.mobile} {
  font-size: 12px;
  padding: 6px 12px;
  min-height: 44px; /* 터치 타겟 유지 */
}
```

### 6-2. 캘린더 툴바 (기존 모바일 스타일 유지 + 추가)

기존 `.fc-toolbar-title { font-size: 16px }`, `.fc-button { font-size: 12px }` 유지.

뷰 전환 버튼 행은 모바일에서도 동일하게 좌측 정렬 유지. 캘린더가 작아지므로 버튼 텍스트는 "월간"/"주간" (2글자+단위)으로 충분.

### 6-3. BottomSheet

기존 모바일 BottomSheet 동작 유지 (핸들 표시, 슬라이드업, 80vh 최대 높이). AddButton은 Content 영역 내 하단에 위치하므로 스크롤이 필요한 경우 스크롤 후 접근 가능.

`Content` styled-component가 `overflow-y: auto; flex: 1`로 설정되어 있어 긴 리스트에서 AddButton이 숨지 않도록 AddButton을 `Content` 내부에 위치시키되, 리스트 하단 고정이 필요한 경우 `Content`를 `display: flex; flex-direction: column`으로 변경하고 리스트에 `flex: 1`을 주는 방식을 검토한다.

### 6-4. 드래그 (모바일 터치)

FullCalendar의 `interactionPlugin`은 터치 이벤트도 지원한다 (`touchstart`/`touchmove`). 단, 모바일에서 드래그 중 스크롤과 충돌할 수 있다. FullCalendar의 `longPressDelay` prop으로 터치 드래그 인식 딜레이를 설정할 수 있다. 기본값 1000ms(1초)에서 시작하고, 불편하면 500ms로 단축.

```tsx
<FullCalendar
  ...
  longPressDelay={1000}  // 터치 드래그 인식 딜레이 (ms)
/>
```

### 6-5. 주간 뷰 (모바일)

모바일에서 주간 뷰는 7일을 좁은 화면에 표시하므로 날짜 셀이 작아진다. FullCalendar `dayGridWeek`는 날짜 셀 너비를 자동으로 조정한다. 이벤트 바 텍스트는 `11px` (기존 유지)로 표시되나 텍스트 overflow ellipsis가 더 빨리 발생한다. 허용 가능한 수준이므로 별도 처리 없음.

---

## 7. 접근성 요구사항

- 뷰 전환 버튼: `aria-pressed={calendarView === "dayGridMonth"}` / `aria-pressed={calendarView === "dayGridWeek"}` 로 현재 활성 상태 전달
- 뷰 전환 버튼 그룹: `role="group"`, `aria-label="캘린더 뷰 전환"` wrapper
- AddButton: `aria-label="이 날짜에 새 할 일 추가"` (날짜 정보 포함 권장: `aria-label={${selectedDate} 날짜에 새 할 일 추가}`)
- 기한 초과 이벤트 바: FullCalendar에서 `eventClassNames` prop으로 `.overdue-event` 클래스 추가, `aria-label`에 "기한 초과" 텍스트 포함은 FullCalendar의 `eventContent` 콜백으로 커스텀 렌더링 시 적용 가능 (선택 사항 — 색상만으로 의미 전달은 충분하나, 스크린리더 사용자를 위해 `eventContent`에 시각적으로 숨긴 "기한 초과" 텍스트 추가 권장)
- 모달 닫기 버튼: 기존 `aria-label="모달 닫기"` 유지
- 드래그 완료/실패 Toast: 기존 `useToast` 패턴으로 충분 (스크린리더가 role="alert" 영역 읽음)

---

## 8. FullCalendar 플러그인 의존성

현재 사용 중: `@fullcalendar/daygrid`, `@fullcalendar/interaction`

추가 필요:
- 주간 뷰(`dayGridWeek`)는 `dayGridPlugin` 안에 포함되어 있으므로 **추가 패키지 설치 불필요**
- 드래그(`eventDrop`)는 `interactionPlugin` 안에 포함 → **추가 패키지 설치 불필요**
- 추가 import: `EventDropArg` 타입 (`@fullcalendar/interaction`)

---

## 9. 수정 파일 목록 요약

| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `features/dashboard/components/calendar.tsx` | 수정 | 뷰 전환 state, viewToggle UI, isOverdue 판정, eventDrop 핸들러, BottomSheet AddButton, create Modal |
| `features/dashboard/components/calendar.styles.tsx` | 수정 | pointer-events 제거, ViewToggleRow/ViewButton/AddButton 추가, DayDetailItem $overdue prop, .fc-highlight 배경색 |
| `features/todo/components/todoForm/todoForm.tsx` | 수정 | `initialDueAt?: string` prop 추가 |
| `features/todo/components/todoForm/todoFrom.styles.tsx` | 변경 없음 | |
| `features/dashboard/Pages/pieChartPage.tsx` | 삭제 또는 라우트 제거 | 파이차트 제거 (라우트 변경은 라우팅 파일 별도 확인 필요) |

---

## 10. ui-ux-improver에게 전달할 사항

1. **pointer-events 제거 우선**: `calendar.styles.tsx`의 `.fc-daygrid-event { pointer-events: none }` 제거가 드래그 기능의 전제조건. 제거 후 기존 날짜 클릭(`dateClick`)이 정상 동작하는지 확인.

2. **EventDropArg 타입**: `import type { EventDropArg } from "@fullcalendar/interaction"` — 기존 `DateClickArg`와 같은 패키지에서 import.

3. **handleEventDrop 클로저 주의**: `info.revert()`를 `onError` 콜백에서 호출하려면 `info` 객체를 `useCallback` 클로저 밖에서 참조해야 함. `useCallback` 의존성 배열을 정확히 지정하거나 `useCallback` 없이 일반 함수로 작성하고 `useMemo`로 events가 안정화되면 충분.

4. **calendarView useEffect**: `changeView()` 호출은 `calendarRef.current`가 마운트된 후에만 가능. useEffect dependency에 `calendarView`를 넣고, `calendarRef.current` null 체크 필수.

5. **TodoForm initialDueAt 포맷**: `datetime-local` input은 `"2025-06-10T00:00"` 형식 필요. `selectedDate`는 `"2025-06-10"` 형식이므로 `${selectedDate}T00:00` 로 변환.

6. **Modal z-index**: BottomSheet의 Overlay가 `z-index: 9998`. Modal의 `ModalBackground`가 더 높은 z-index를 가져야 BottomSheet 위에 표시됨. 기존 `modal.styles.tsx`의 z-index 확인 후 필요 시 조정 (9999 이상).

7. **파이차트 제거 범위**: `pieChart.tsx`, `pieChart.styles.tsx`, `pieChartPage.tsx` 파일 삭제 및 `dashboard/index.ts`에서 export 제거. 라우팅 파일(`App.tsx` 또는 router 설정)에서 `/pie-chart` 라우트 제거 여부는 별도 확인 필요 — 스펙에서는 dashboard 범위만 다루며 라우팅 변경은 확인 후 적용.

8. **longPressDelay**: 모바일 드래그 UX 확인 후 500ms~1000ms 사이에서 조정. 기본값(1000ms)으로 시작 권장.

9. **접근성**: 뷰 전환 버튼 그룹에 `role="group"` + `aria-label` 추가 필수. AddButton `aria-label`에 날짜 정보 포함.
