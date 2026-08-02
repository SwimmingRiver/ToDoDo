# 상세 페이지 하위 투두(subtask) 표시 — 디자인 스펙

- 대상 파일: `client/src/features/todo/components/todoDetail/`
- 작성일: 2026-08-02
- 상태: **사용자 검토 대기** — 승인 후 ui-ux-improver가 구현

---

## 0. 문제 정의 및 근거

`TodoDetail`(`todoDetail.tsx`)은 이미 하위 투두 존재 여부를 계산하고 있다.

```tsx
const hasChildren = useMemo(() => {
  if (!todo) return false;
  return (allTodos ?? []).some((t) => t.parentId === todo.id);
}, [allTodos, todo]);
```

그런데 이 `hasChildren`은 **반복(recurrence) 설정을 막는 조건**으로만 쓰이고(`recurrenceDisabled = hasChildren || !startAtWatch`), 실제 하위 투두 목록은 화면 어디에도 렌더링되지 않는다. 즉 "하위 투두가 있어서 반복을 켤 수 없다"는 안내는 있지만, 정작 그 하위 투두가 무엇인지는 상세 페이지에서 확인할 방법이 없다 — 이것이 사용자가 제기한 문제의 원인이다.

목록 화면(`todoList.tsx` → `projectCard.tsx`)과 칸반 보드(`kanbanItem.tsx`) 두 곳을 확인한 결과, 하위 투두를 시각적으로 보여주는 곳은 **목록 화면의 `ProjectCard` 펼치기 영역과 모바일 `BottomSheet`뿐**이다. 칸반 카드(`kanbanItem.tsx`)에도 하위 투두 표시가 전혀 없다 — 이번 스코프 밖이지만 향후 개선 후보로 기록해둔다.

---

## 1. 현재 코드 구조 파악 결과

| 파일 | 역할 |
|---|---|
| `features/todo/components/todoDetail/todoDetail.tsx` | 상세 패널(Overlay + 우측 슬라이드 Panel). `useTodoDetail`로 단일 todo 조회, `useGetTodos`로 전체 todo 목록(`allTodos`)도 이미 가져오고 있음. `hasChildren` 계산 로직 있으나 목록 미표시 |
| `features/todo/components/todoDetail/todoDetail.styles.tsx` | Panel/Form 관련 styled-components. `FormGroup`+`Label` 패턴이 섹션 구획의 기본 단위 |
| `features/todo/components/childTodoCard.tsx` | 하위 투두 1개를 렌더링하는 카드. 상태 dot 클릭 시 인라인 상태 변경 pill 노출, 제목 클릭 시 `navigate(/todo/{id})`, 편집/삭제 아이콘 버튼 포함. **부모 컴포넌트에 독립적** — `todo`, `onEdit`만 props로 받음 |
| `features/todo/components/projectCard.tsx` | 목록 화면에서 루트 투두(`parentId === null`)를 "프로젝트 카드"로 렌더링. 데스크톱은 헤더 클릭 시 `ExpandedArea`로 아코디언 펼침, 모바일은 chevron 클릭 시 `BottomSheet` 안에 `ChildTodoCardList`로 표시. 두 경우 모두 내부에서 `ChildTodoCard`를 재사용 |
| `features/todo/components/projectCard.styles.tsx` | `ExpandedArea`(아코디언 펼침 영역, 회색 배경+상단 보더+`max-height` 스크롤), `ChildTodoCardList`(단순 세로 리스트, 배경 없음), `ChildCardWrapper` 등 `ChildTodoCard`가 쓰는 스타일 전부 정의 |
| `features/todo/utils/projectUtils.ts` | `getProjectProgress`, `getProjectSubtaskInfo`, `getProjectOverdue` 등 — `childTodos` 배열로부터 진행률/요약 텍스트를 계산하는 순수 함수. `ProjectCardData` 타입도 여기 정의 |
| `features/todo/components/todoList.tsx` | `childTodos: todos.filter((t) => t.parentId === rootTodo.id)` 형태로 `allTodos`에서 직접 필터링해 `ProjectCard`에 전달. `TodoForm`에 `parentId` prop을 넘겨 하위 투두 추가 모달을 여는 `onAddChild` 진입점도 여기 있음 |
| `features/kanban/components/kanbanItem.tsx` | `parentId`/`childTodos` 관련 코드 없음 — 하위 투두 미표시 (스코프 밖, 참고용) |

---

## 2. 배치 위치 제안

### 2-1. 위치: "마감일시" 필드와 "반복 설정" 섹션 사이

```
... 제목 / 설명 / 상태·우선순위 Select / 시작일시 / 마감일시
                          ↓
                  [하위 할 일 섹션]  ← 신규
                          ↓
              [반복 설정 섹션] (기존, !todo.parentId 조건부)
                          ↓
                    PanelFooter
```

**이유**

1. `recurrenceDisabled`가 `hasChildren`에 의해 결정되는데, 지금은 그 인과관계가 화면에 드러나지 않는다. 하위 할 일 섹션을 반복 설정 바로 위에 두면 "왜 반복이 비활성화돼 있지?"라는 의문에 스크롤 없이 바로 답이 된다.
2. 두 섹션 모두 `!todo.parentId`(루트 투두)일 때만 의미가 있는 "프로젝트 전용" 영역이라 인접 배치가 자연스럽다.
3. `DESIGN_SPEC.md`(todoDetail 리브랜딩 스펙)가 명시한 "레이아웃 구조는 유지, 필요한 예외만 최소로"라는 기존 원칙과 맞물려 — 새 섹션을 폼 최상단에 끼워 넣어 기존 필드 순서를 흔들지 않고, 기존에도 조건부로 있던 마지막 블록(반복 설정) 앞자리에 추가하는 것이 변경 범위가 가장 작다.

### 2-2. 표시 조건

- `todo.parentId === null`(루트/프로젝트 투두)일 때만 섹션 자체를 렌더링한다. 하위 투두의 상세 페이지(`todo.parentId !== null`)에는 렌더링하지 않는다 — 현재 데이터 계층 구조가 1단계(부모→자식)만 지원되고, 목록/칸반 어디에도 자식의 자식을 표시하는 로직이 없기 때문에(2뎁스 이상은 스코프 밖) 동일한 제약을 상세 페이지에도 유지한다.
- 하위 투두가 0개여도 섹션 자체는 보여준다(빈 상태 + 추가 버튼). 하위 투두가 아예 없는 단일 투두와 "루트인데 아직 하위 투두를 안 만든 프로젝트"를 구분하기보다, 상세 페이지에서 바로 첫 하위 투두를 추가할 수 있는 진입점을 항상 제공하는 편이 이번 문제 제기("하위 투두가 안 보인다")의 원인 해소에 더 부합한다.

---

## 3. 컴포넌트 재사용 vs 신규 설계

### 3-1. 재사용: `ChildTodoCard` (그대로, 수정 없음)

개별 하위 투두 행은 `childTodoCard.tsx`를 그대로 재사용한다. 이미 상태 dot, 인라인 상태 변경, 제목 클릭 시 상세 이동, 편집/삭제 버튼까지 모두 구현돼 있고 `todo`/`onEdit`만 받는 독립 컴포넌트라 상세 페이지 컨텍스트에 그대로 꽂을 수 있다. 새로 만들 이유가 없다.

- 제목 클릭 시 `navigate(/todo/{childId})` 동작도 그대로 유지 — 상세 패널이 열린 상태에서 하위 투두를 클릭하면 같은 패널이 그 하위 투두의 상세로 전환된다(기존 목록 화면에서의 동작과 동일한 패턴이라 학습비용 없음).

### 3-2. 재사용: `ChildTodoCardList` (컨테이너), `EmptyChildMessage` (빈 상태)

`projectCard.styles.tsx`의 `ChildTodoCardList`(`display:flex; flex-direction:column; gap:8px; padding:12px 16px;` — 배경/보더 없는 순수 세로 리스트)를 컨테이너로 재사용한다.

**`ExpandedArea`는 재사용하지 않는다.** `ExpandedArea`는 회색 배경 + 상단 보더로 "카드 헤더에 아코디언처럼 붙어있는 영역"이라는 시각 문맥을 전제로 만들어졌다(목록의 `CardContainer` 안, 헤더 클릭으로 펼쳐짐). 상세 페이지는 이미 그 자체로 스크롤 가능한 흰 배경 Panel이라 같은 회색 배경을 또 씌우면 이질감이 생긴다. 반면 `ChildTodoCardList`는 배경 없는 단순 리스트라 `FormGroup` 톤(흰 배경, 라벨+콘텐츠 세로 배치)과 자연스럽게 어울린다 — 실제로 이미 모바일 `BottomSheet`(역시 흰 배경 위)에서 `ExpandedArea` 대신 `ChildTodoCardList`가 쓰이고 있어 선례도 일치한다.

### 3-3. 신규: `SubtaskSection` 래퍼 (todoDetail.styles.tsx에 추가)

기존 `FormGroup`/`Label` 패턴을 그대로 따르되, 라벨 줄에 개수 배지 + "추가" 버튼 + (하위 투두가 있을 때만) 접기/펼치기 토글을 얹은 헤더 행이 필요하므로 이 부분만 신규로 만든다.

```
SubtaskSectionHeader   ← 신규 (Label 대체, flex row: 라벨+카운트 / 우측 정렬 버튼들)
SubtaskProgressBar     ← 재사용 후보: projectCard.styles의 ProgressBar/ProgressFill
SubtaskListContainer   ← 재사용: ChildTodoCardList + max-height/overflow 속성만 추가
EmptyChildMessage      ← 재사용: projectCard.styles 그대로
```

`ProgressBar`/`ProgressFill`(목록 화면 프로젝트 카드의 진행률 바)도 함께 재사용한다. `projectUtils.ts`의 `getProjectProgress(allTodos, todo.id)`, `getProjectSubtaskInfo(allTodos, todo.id)`를 그대로 호출하면 되므로 계산 로직 신규 작성이 필요 없다 — `TodoDetail`은 이미 `allTodos`를 갖고 있어 `hasChildren` 계산부를 아래처럼 확장하는 정도로 충분하다.

```tsx
const childTodos = useMemo(
  () => (allTodos ?? []).filter((t) => t.parentId === todo?.id),
  [allTodos, todo]
);
const hasChildren = childTodos.length > 0; // 기존 계산을 재활용
```

### 3-4. 판단 요약

| 요소 | 재사용 | 신규 |
|---|---|---|
| 하위 투두 카드 1건 | `ChildTodoCard` (수정 없음) | - |
| 리스트 컨테이너 | `ChildTodoCardList` | - |
| 빈 상태 문구 | `EmptyChildMessage` | - |
| 진행률 바 | `ProgressBar`/`ProgressFill` + `getProjectProgress` | - |
| 섹션 헤더(라벨+카운트+추가+접기토글) | - | `SubtaskSectionHeader` |
| 리스트 길이 제한 스크롤 | `ExpandedArea`의 `max-height` 수치만 참고 | `SubtaskListContainer`(새 규칙, 배경 없이 max-height만 적용) |

새 컴포넌트는 "섹션 헤더"와 "리스트 높이 제한 wrapper" 2개뿐이며, 나머지는 전부 기존 자산 재사용이다.

---

## 4. 접기/펼치기(collapse/expand) UI

**필요하다고 판단** — 상세 패널은 이미 제목/설명/상태/우선순위/시작일시/마감일시/(조건부) 반복 설정까지 세로로 길게 쌓이는 폼이다. 하위 투두가 많은 프로젝트(예: 10개 이상)라면 새 섹션이 그대로 전부 펼쳐질 경우 반복 설정·저장 버튼까지 도달하는 스크롤 비용이 커진다.

- **기본 상태: 항상 펼침(expanded).** 이번 스펙의 출발점이 "하위 투두가 안 보인다"는 문제이므로, 기본값을 접어두면 문제를 그대로 재현하는 셈이 된다. 개수와 무관하게 기본은 펼침으로 시작한다.
- **접기 토글은 하위 투두가 1개 이상일 때만 노출.** 0개(빈 상태)일 땐 접을 대상이 없으므로 토글 버튼 자체를 숨기고 빈 상태 문구 + 추가 버튼만 보여준다.
- **인터랙션**: `projectCard.tsx`에서 이미 쓰는 `ChevronRight`/`ChevronDown`(lucide-react) 아이콘과 클릭 토글 패턴을 그대로 재사용 — 새 아이콘 세트를 도입하지 않는다. 상태는 상세 페이지 로컬 `useState<boolean>(true)`로 충분하다(목록처럼 여러 카드의 펼침 상태를 `Set`으로 관리할 필요 없음, 상세 페이지엔 섹션이 하나뿐).
- **리스트가 길 때의 2차 방어선**: 접었다 폈다는 사용자 선택이고, 펼친 상태에서도 하위 투두가 아주 많으면(예: 20개+) `SubtaskListContainer`에 `max-height: 260px`(모바일) / `400px`(데스크톱, `ExpandedArea`와 동일 수치) + `overflow-y: auto`를 적용해 패널 자체가 무한정 길어지는 것을 막는다.

---

## 5. 상태별 시각 처리 (todo/doing/done, 우선순위, 완료 여부)

### 5-1. 상태(todo/doing/done) — 기존 `ChildTodoCard` 그대로 재사용

수정 없이 재사용하므로 시각 규칙도 그대로 따른다 (`styles/statusColors.ts` 토큰):

| 상태 | 카드 좌측 dot | 카드 테두리(`ChildCardWrapper`) |
|---|---|---|
| todo | `#6b7280` (회색) | `#9ca3af` |
| doing | `#3b82f6` (파랑) | `#60a5fa` |
| done | `#1D9E75` (브랜드 그린, primary) | `#34d399` |

카드 상태 dot을 클릭하면 인라인 pill(`todo`/`doing`/`done`)이 펼쳐져 그 자리에서 상태 변경 가능 — 이미 구현돼 있고 그대로 재사용한다.

### 5-2. 완료 여부(done) — 앱 전역 관행 유지, 신규 스타일 도입 안 함

앱 전체(`todoListItem`, `ChildTodoCard`, kanban 카드)를 확인한 결과 **완료 항목에 취소선(strikethrough)이나 투명도 처리를 쓰는 곳이 한 군데도 없다.** 상태는 색(dot/테두리)만으로 전달하는 것이 기존 일관된 언어다. 이번 상세 페이지 하위 투두 섹션에도 같은 원칙을 유지 — done 항목에 새로 취소선/opacity를 넣지 않는다. (앱 전체에 완료 시각 처리를 통일 도입하는 건 이번 스코프보다 큰 변경이라 별도 논의가 필요하면 백로그로 남긴다.)

### 5-3. 우선순위 — `ChildTodoCard`에 신규 시각 요소 추가 제안 (승인 필요, 목록 화면에도 영향)

현재 `ChildTodoCard`는 우선순위를 전혀 표시하지 않는다(상태 dot과 제목만 보임). 하위 투두 상세 확인이라는 목적상 우선순위 노출 가치가 있다고 판단해 다음을 제안한다.

- **`priority === "high"`인 하위 투두에만** `ChildCardWrapper` 좌측에 3px accent 보더를 추가한다. 색상은 `todoDetail`의 `PriorityBadge` high 스타일과 동일한 `colors.danger.main`(`#E24B4A`)을 그대로 재사용한다 — 새 색상 정의 없이 기존 토큰만 가져다 쓴다.
- `medium`/`low`는 별도 표시를 추가하지 않는다. 모든 카드에 뱃지를 달면 정작 중요한 `high`가 묻히고, 리스트가 시각적으로 무거워진다 — "급한 것만 눈에 띄게"라는 최소 신호 원칙.
- **주의**: `ChildTodoCard`는 목록 화면(`projectCard.tsx`, `todoList.tsx`)과 상세 페이지 양쪽에서 공유되는 컴포넌트이므로, 이 변경을 적용하면 **목록 화면의 하위 투두 카드에도 동일하게 high priority accent가 나타난다.** 이는 의도한 부수효과(일관성 향상)로 보이지만, 목록 화면 UI에 손대는 것이므로 사용자 승인이 필요한 지점으로 명확히 표시해둔다. 원치 않으면 `ChildTodoCard`에 `showPriorityAccent?: boolean`(기본 `false`) prop을 추가해 상세 페이지에서만 `true`로 켜는 방식으로 범위를 좁힐 수 있다 — 이 경우 목록 화면은 완전히 그대로 유지된다. **어느 쪽으로 할지는 승인 시 함께 확인 필요.**

---

## 6. 새 하위 투두 추가 진입점

- 위치: `SubtaskSectionHeader` 우측, 접기/펼치기 토글과 함께 배치. 아이콘은 목록 화면 `ProjectCard`에서 이미 쓰는 `Plus`(lucide-react) 아이콘 재사용.
- 클릭 시 동작: 목록 화면의 `onAddChild` → `TodoForm`(`parentId` prop 전달) 모달을 여는 것과 동일한 패턴을 그대로 재사용한다. `TodoForm`은 이미 `parentId?: string` prop을 받아 하위 투두 생성 폼(반복 섹션 숨김 등)을 처리하도록 구현돼 있으므로, 상세 페이지에서도 같은 `TodoForm`을 `Modal`에 얹어 열면 된다 — 새 폼 컴포넌트가 필요 없다.
- 반복 투두 제약 유지: `projectCard.tsx`가 `todo.recurrence != null`일 때 하위 작업 추가 버튼을 비활성화하고 툴팁으로 이유를 안내하는 것과 동일한 규칙을 상세 페이지 추가 버튼에도 적용한다(반복 투두는 하위 작업 추가 불가).
- 빈 상태에서는 `EmptyChildMessage` 아래에 별도의 "+ 첫 하위 할 일 추가" 텍스트 버튼(또는 헤더의 Plus 버튼과 동일 핸들러를 재사용하는 두 번째 진입점)을 둔다 — 목록 화면 프로젝트 카드의 `EmptyState` 패턴(아이콘+문구+액션 버튼)과 톤을 맞춘다.

---

## 7. 레이아웃 와이어프레임

### 7-1. 데스크톱 (Panel 50%, 하위 투두 3개, 펼침 상태)

```
┌──────────────────────────────────────────┐
│              ┌─────────────────────────┐  │
│              │ Todo 상세          [X]  │  │
│              ├─────────────────────────┤  │
│              │ 생성일 / 수정일 / 완료일  │  │
│              │ 현재 상태 / 현재 우선순위 │  │
│              │ 제목 [_________________] │  │
│              │ 설명 [_________________] │  │
│              │ 상태▾        우선순위▾   │  │
│              │ 시작일시 [______________]│  │
│              │ 마감일시 [______________]│  │
│              │                          │  │
│              │ 하위 할 일 (3)      [+] ⌄│  │ ← 신규 SubtaskSectionHeader
│              │ ▓▓▓▓▓▓▓▓▓░░░░░ 60%       │  │ ← 재사용 ProgressBar/Fill
│              │ ┌──────────────────────┐ │  │
│              │ │● 자료 조사       [✎][🗑]│ │  │ ← 재사용 ChildTodoCard
│              │ │● 초안 작성 ┃(high) [✎][🗑]│ │  │   (high면 좌측 accent)
│              │ │● 검토 요청       [✎][🗑]│ │  │
│              │ └──────────────────────┘ │  │
│              │                          │  │
│              │ 반복 설정 (비활성화:      │  │ ← 기존, 바로 아래 위치
│              │  하위 할 일이 있어 반복  │  │
│              │  설정 불가)               │  │
│              ├─────────────────────────┤  │
│              │           [취소] [저장]  │  │
│              └─────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 7-2. 하위 투두 0개 (빈 상태)

```
│ 하위 할 일 (0)                          │  ← 토글 없음(접을 대상 없음)
│ ┌──────────────────────────────────────┐│
│ │      하위 항목이 없습니다              ││  ← 재사용 EmptyChildMessage
│ │      [+ 첫 하위 할 일 추가]            ││  ← 신규 버튼(헤더 Plus와 동일 핸들러)
│ └──────────────────────────────────────┘│
```

### 7-3. 접힌 상태

```
│ 하위 할 일 (3)                    [+] › │  ← 리스트/진행률 바 숨김, 헤더만
```

### 7-4. 모바일 (Panel 100%)

레이아웃 구조 동일, `PanelContent` 패딩(`16px`, 기존 `${media.mobile}` 규칙 유지)만 적용되고 `SubtaskListContainer`의 `max-height`가 `260px`로 축소되는 것 외 변경 없음. `ChildTodoCard`는 이미 모바일 대응 스타일(`min-width` 없음, 텍스트 줄바꿈 처리 등)을 갖고 있어 별도 대응 불필요.

---

## 8. ui-ux-improver에게 전달할 사항

1. **`TodoDetail`의 `hasChildren` 계산부를 `childTodos` 배열 계산으로 확장**하고, 기존 `recurrenceDisabled = hasChildren || !startAtWatch` 로직은 `childTodos.length > 0`으로 대체하되 동작은 완전히 동일하게 유지할 것(로직 변경 아님, 변수만 확장).
2. **`ChildTodoCard`, `ChildTodoCardList`, `EmptyChildMessage`, `ProgressBar`/`ProgressFill`은 그대로 import해서 재사용**한다. `projectCard.styles.tsx`에서 export만 추가하면 되고 새로 복제하지 말 것.
3. **`ExpandedArea`는 상세 페이지에서 쓰지 않는다** — 회색 배경 아코디언 문맥이 상세 패널과 어울리지 않는다는 판단(3-2 참고). 대신 `SubtaskListContainer`(신규, 배경 없음 + `max-height`/`overflow-y:auto`만 추가)를 만들 것.
4. **우선순위 accent(5-3)는 사용자 승인 시 범위를 다시 확인**할 것 — `ChildTodoCard`를 직접 수정해 목록 화면까지 함께 바꿀지, `showPriorityAccent` prop으로 상세 페이지만 한정할지 승인 단계에서 결정된 대로 구현. 임의로 목록 화면까지 바꾸지 말 것.
5. **완료(done) 항목에 취소선/opacity 등 신규 스타일을 추가하지 말 것**(5-2) — 앱 전역에 선례가 없는 패턴을 이 스코프에서 단독 도입하지 않는다.
6. **접기 토글 기본값은 항상 `true`(펼침)**로 시작한다(4절). 접기 상태를 로컬스토리지 등에 영속화하는 요구는 이번 스펙에 없음 — 페이지 재진입 시 항상 펼침으로 리셋되는 것이 기본 동작.
7. **하위 투두 추가 버튼은 `TodoForm`에 이미 있는 `parentId` prop 경로를 그대로 재사용**(6절) — 새 폼을 만들지 말 것. 반복 투두(`todo.recurrence != null`)일 때 추가 버튼 비활성화 + 툴팁 문구도 `projectCard.tsx`와 동일하게 맞출 것.
8. **접근성**: 접기/펼치기 버튼에 `aria-label`(펼침/접힘 상태에 따라 "하위 할 일 접기"/"하위 할 일 펼치기"), 추가 버튼에 `aria-label="하위 할 일 추가"` 지정(기존 `IconButton`/`StatusDotTrigger` 등의 `aria-label` 관행과 동일하게).
9. **애니메이션**: 접기/펼치기 시 별도 트랜지션 애니메이션은 필수 아님(목록 화면 `ExpandedArea`도 애니메이션 없이 즉시 토글) — 필요하면 `max-height` 트랜지션 정도만 선택 적용, 필수 요구사항 아님.
10. **변경 금지 범위**: `Overlay`/`Panel`의 슬라이드 애니메이션, Panel 폭 반응형 분기, 기존 폼 필드 순서(마감일시 앞부분), `handleClose`/`onSubmit`/삭제·반복 시리즈 관련 로직은 이번 스코프에서 건드리지 않는다. 오직 "마감일시 ~ 반복 설정" 사이에 하위 투두 섹션을 삽입하는 것과 `ChildTodoCard` 우선순위 accent(승인된 범위 한정)만 구현 대상.

---

## 9. 백로그 (이번 스코프 아님, 참고용)

- 칸반 카드(`kanbanItem.tsx`)에도 하위 투두 표시가 전혀 없음 — 필요 시 별도 스펙으로 논의.
- 완료 항목 취소선/투명도 처리를 앱 전역(목록/칸반/상세)에 통일 도입할지는 더 큰 스코프의 별도 논의 필요.
- 우선순위 `medium` 표시가 필요해지면 `colors.warning` 토큰(기존 `todoDetail/DESIGN_SPEC.md`에서 이미 "추가 검토" 상태로 남겨둔 토큰) 도입 여부를 그때 다시 확인.
