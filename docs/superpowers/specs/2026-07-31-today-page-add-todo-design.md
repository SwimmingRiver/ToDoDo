# 오늘 페이지 상시 노출 할 일 추가 버튼 설계

- 대상 파일: `client/src/features/today/pages/todayPage.tsx`, `client/src/features/today/pages/todayPage.styles.tsx`
- 작성일: 2026-07-31
- 상태: **폐기됨 — `2026-07-31-today-page-fab-button.md`로 대체됨 (2026-07-31)**

> **[대체 공지, 2026-07-31]** 이 문서에서 결정한 "목록 페이지와 동일한 하단 고정 풀와이드 바" 설계는 구현 후 사용자 검토 결과 데스크톱/태블릿에서 어색하다는 피드백을 받아 폐기되었다.
> 오늘 페이지의 할 일 추가 버튼은 이제 화면 크기와 무관하게 통일된 FAB(Floating Action Button) 패턴으로 전환한다.
> 최신 설계는 [`2026-07-31-today-page-fab-button.md`](./2026-07-31-today-page-fab-button.md)를 참조할 것. 이 문서는 변경 배경 기록용으로만 보존한다.


## 1. 문제 정의

메인 화면인 "오늘" 페이지(`/today`)는 할 일이 하나도 없을 때만 `EmptyState`의 "새 할 일 추가" 버튼을 통해 투두를 추가할 수 있다. 할 일이 하나라도 있으면(`hasTodos === true`) `EmptyState` 자체가 렌더링되지 않으므로, 이 버튼도 함께 사라진다. 즉 오늘 화면에서 가장 흔한 상태(할 일이 이미 있는 평상시)에는 투두를 추가할 진입점이 화면 어디에도 없다.

로컬 개발 서버(`/today`)에서 실제로 확인한 결과, 할 일 3건이 있는 상태에서 화면 전체를 스크롤해봐도 추가 버튼이 전혀 노출되지 않음을 확인했다.

목록 페이지(`todoList.tsx`)는 리스트가 비어있든 아니든 `TodoListContainer`(height:100%, flex column) 하단에 `AddButton`이 항상 고정 노출되어 이런 문제가 없다. 오늘 페이지만 이 패턴에서 벗어나 있다.

이 문제는 PM/UX 검토에서도 "메인 화면의 핵심 기능 결손"으로 분류되었고, 목록 페이지와 동일한 하단 고정 버튼 패턴을 적용하는 것으로 방향을 정했다(플로팅 오버레이 FAB는 채택하지 않음 — 목록 페이지의 `AddButton`이 실제로는 `position: fixed` 오버레이가 아니라 flex 레이아웃으로 하단에 고정되는 방식임을 확인했고, 동일 패턴을 재사용하는 쪽이 앱 전체의 일관성 측면에서 더 낫다고 판단).

## 2. 결정된 설계

### 레이아웃 재구성

`todayPage.tsx`의 `Container`를 `todoList.tsx`의 `TodoListContainer`와 동일한 구조로 바꾼다:

- `Container`: `height: 100%; display: flex; flex-direction: column` (기존 `overflow-y: auto`는 제거하고 아래 `ScrollArea`로 이동)
- `WeekStrip`, `DailyProgress`는 `Container` 최상단에 위치, 스크롤 영역 밖에 고정
- 신규 `ScrollArea` (`flex: 1; overflow-y: auto`)가 로딩 스켈레톤 / 에러 `EmptyState` / 빈 상태 `EmptyState` / 할 일 리스트(`TodaySection` 2개)를 감싼다
- 신규 `AddButton`(목록 페이지의 `AddButton`과 시각적으로 동일한 스타일 — `colors.brand.primary` 배경, 데스크톱 48px / `media.mobile` 44px 높이, full-width, `border-radius: var(--border-radius-lg, 10px)`)을 `ScrollArea` 바깥, `Container`의 마지막 자식으로 배치. 로딩/에러/빈 상태/리스트 상태와 무관하게 **항상** 렌더링된다(목록 페이지 `AddButton`과 동일한 조건 없음 방식)

### 버튼 동작

- 클릭 시 기존 `isAddOpen` state를 `true`로 설정 — 이미 존재하는 `Modal` + `TodoForm` 흐름을 그대로 재사용
- `TodoForm`에 `initialDueAt={`${selectedDate}T00:00`}`를 전달한다. `calendar.tsx`가 이미 쓰고 있는 것과 동일한 패턴으로, `WeekStrip`에서 현재 선택된 날짜(`selectedDate`, `YYYY-MM-DD` 형식)를 새 할 일의 마감일 기본값으로 채운다
- 버튼 라벨/아이콘은 목록 페이지와 통일: `<Plus size={16} /> 새 할일`

### EmptyState 변경

- "오늘 할 일이 없습니다" `EmptyState`(현재 `actionLabel="새 할 일 추가"`, `actionIcon={Plus}`, `onAction={() => setIsAddOpen(true)}`)에서 `actionLabel`/`actionIcon`/`onAction` prop을 제거한다. 하단에 상시 노출되는 `AddButton`과 중복되는 CTA를 없애기 위함이며, 안내 문구(`title`/`description`)는 그대로 유지한다
- "할 일을 불러오지 못했습니다" 에러 상태 `EmptyState`의 "다시 시도"(`onAction={() => useGetTodos.refetch()}`) 액션은 변경하지 않는다 — 재시도라는 별개 목적의 액션이므로 하단 추가 버튼과 중복되지 않는다

## 3. 범위

### 변경 대상

- `client/src/features/today/pages/todayPage.tsx` — 레이아웃 구조 변경(`ScrollArea`로 감싸기), 신규 `AddButton` 추가 및 클릭 핸들러, `TodoForm`에 `initialDueAt` 전달, "빈 상태" `EmptyState`의 action prop 제거
- `client/src/features/today/pages/todayPage.styles.tsx` — `ScrollArea`, `AddButton` styled-component 신규 추가
- `todayPage` 관련 기존 테스트(빈 상태 `EmptyState`의 액션 버튼 클릭을 검증하는 테스트 등) — 새 하단 버튼 기준으로 갱신

### 범위 밖 (변경하지 않음)

- 데스크톱/모바일 브레이크포인트별 다른 처리 없음 — 버튼은 항상 동일한 방식으로 렌더링되고, 반응형은 기존 `media.mobile` 스타일만 재사용(목록 페이지 `AddButton`과 동일)
- 새로운 공용(shared) 버튼 컴포넌트 추출은 하지 않는다 — 목록 페이지와 마찬가지로 각 feature가 자신의 스타일을 소유하는 기존 컨벤션을 따른다
- `WeekStrip`, `DailyProgress`, `TodaySection`, `TodayTodoItem` 등 기존 컴포넌트의 내부 로직/스타일은 변경하지 않는다 — 오늘 페이지 레이아웃 컨테이너 구조와 추가 버튼만 다룬다
- `todoList.tsx`의 `AddButton`을 직접 수정하거나 리팩터링하지 않는다

## 4. 검증

- 유닛/컴포넌트 테스트: 할 일이 있는 상태에서도 하단 `AddButton`이 렌더링되는지, 클릭 시 `Modal`이 열리고 `TodoForm`에 `initialDueAt`이 `selectedDate` 기준으로 전달되는지, 로딩/에러 상태에서도 버튼이 계속 노출되는지, 빈 상태 `EmptyState`에 더 이상 action 버튼이 없는지
- 로컬 개발 서버(`npm run dev`)에서 오늘 화면을 직접 열어 할 일이 있는 상태/없는 상태 양쪽에서 버튼 동작과 레이아웃(상단 고정/리스트만 스크롤/하단 고정)을 육안으로 확인
