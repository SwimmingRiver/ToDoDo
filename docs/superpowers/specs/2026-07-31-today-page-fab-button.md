# 오늘 페이지 할 일 추가 버튼 — FAB(Floating Action Button) 전환 설계

- 대상 파일: `client/src/features/today/pages/todayPage.tsx`, `client/src/features/today/pages/todayPage.styles.tsx`
- 작성일: 2026-07-31
- 상태: 사용자 검토 대기 (승인 시 `ui-ux-improver`가 구현)
- **이 문서는 `2026-07-31-today-page-add-todo-design.md`를 대체한다.** 해당 문서는 폐기됨(문서 상단에 대체 표시 추가함).

## 0. 변경 배경 (왜 다시 설계하는가)

이전 스펙(`2026-07-31-today-page-add-todo-design.md`)에 따라 오늘 페이지에 목록 페이지(`todoList.tsx`)와 동일한 "하단 고정 풀와이드 바" 형태의 `AddButton`을 구현·커밋 완료했다(구현 커밋 `754ad28`, `74f757a`, 버그 수정 `24b1a17`). 이 스펙은 "플로팅 오버레이 FAB는 채택하지 않는다"고 명시적으로 결정했었다.

사용자가 로컬 dev 서버에서 실제 구현 결과를 확인한 뒤 피드백을 줬다: 모바일 크기에서는 하단 풀와이드 바가 수긍이 가지만, 태블릿/데스크톱처럼 화면이 넓어지면 화면 전체 폭을 가로지르는 두꺼운 바가 어색하다는 것이다. 이에 대해 "① 모바일만 바 유지 + 태블릿/데스크톱은 FAB로 반응형 분기" / "② 전 화면 폭에서 FAB로 통일" 두 옵션을 제시했고, 사용자는 **② 전체 통일(모든 화면 크기에서 FAB)**을 선택했다.

즉 이번 스펙의 결론은 이전 스펙의 정반대다: 하단 고정 풀와이드 바를 걷어내고, 모바일/태블릿/데스크톱 구분 없이 동일한 FAB 하나로 통일한다.

## 1. 결정된 설계 개요

- 기존에 구현된 레이아웃 골격(`Container` → `WeekStrip`/`DailyProgress`(상단 고정) → `ScrollArea`(스크롤 영역) → `List`)은 **그대로 유지**한다.
- `ScrollArea` 바깥에 flex 흐름으로 배치되던 풀와이드 `AddButton`을 제거하고, 대신 `Container` 우하단에 **`position: absolute`로 오버레이되는 원형/필(pill) 플로팅 버튼 `Fab`**를 추가한다.
- 클릭 시 동작(모달 오픈, `initialDueAt` 전달)은 **변경 없음**.
- 화면 크기별 분기(모바일 전용 vs 데스크톱 전용 스타일)는 두지 않는다 — 오직 화면 가장자리에 가까울 때의 여백 값만 아주 소폭 다르다(4번 항목 참조). 버튼의 모양·크기·라벨·색상은 모든 화면 크기에서 동일하다.

## 2. FAB 스타일 스펙

### 2.1 형태: 아이콘 + 라벨을 유지하는 필(pill) 버튼

원형 아이콘 전용 FAB가 아니라 **아이콘(`Plus`) + 라벨("새 할일")을 유지한 pill 형태**를 채택한다.

이유:
- "할 일 추가"는 상시 노출되는 주요 액션이며, 아이콘만으로는 최초 사용자에게 의미가 완전히 명확하지 않다. 라벨을 남기면 별도 `aria-label` 설계 없이도 버튼의 텍스트 콘텐츠 자체가 접근성 이름(accessible name)이 된다.
- 기존 목록 페이지 `AddButton`, 이전 오늘 페이지 구현과 동일하게 `<Plus size={16} /> 새 할일` 마크업을 그대로 재사용할 수 있어 변경 범위가 작다.
- Gmail의 "편지쓰기" 버튼처럼 라벨이 있는 pill FAB는 데스크톱에서도 어색하지 않은, 이미 널리 쓰이는 패턴이다.

### 2.2 크기/스타일 — 모든 화면 크기 공통(분기 없음)

```
height: 48px;
padding: 0 20px;
border-radius: 24px;              /* height/2, 완전한 pill */
display: flex;
align-items: center;
justify-content: center;
gap: 8px;
background-color: ${colors.brand.primary};  /* 기존 AddButton과 동일 토큰 재사용 */
color: white;
font-size: 14px;
font-weight: 500;
border: none;
cursor: pointer;
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
```

- `width`는 `auto` — 풀와이드였던 기존 버튼과 달리 콘텐츠(아이콘+라벨+패딩)에 맞춰 크기가 정해진다.
- 높이 48px는 CLAUDE.md의 "모든 인터랙티브 요소 최소 44px" 기준을 충족한다.
- 모바일 전용 축소 높이(기존 44px)는 **적용하지 않는다** — "전체 통일" 결정에 따라 화면 크기와 무관하게 48px 고정.
- 아이콘: `<Plus size={16} />` (기존과 동일, 변경 없음)
- 색상: `colors.brand.primary` 재사용(신규 토큰 불필요). hover 배경은 기존 `AddButton`과 동일하게 `#0d5e49` 리터럴 값을 그대로 재사용한다(기존 코드도 토큰이 아닌 리터럴이므로 새로 토큰화하지 않음).

### 2.3 인터랙션 상태

```
&:hover {
  background-color: #0d5e49;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  transform: translateY(-1px);
}

&:active {
  transform: translateY(0) scale(0.97);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

&:focus-visible {
  outline: 2px solid ${colors.brand.secondary};
  outline-offset: 2px;
}
```

- `:focus-visible` 아웃라인은 기존 `AddButton`에는 없던 스타일이지만, FAB는 화면 위에 떠 있는 독립적인 오버레이 요소가 되므로 키보드 포커스 시 위치를 명확히 알 수 있도록 신규로 추가한다.

## 3. 배치 방식 (position, 좌표, z-index)

### 3.1 `position: absolute` — `fixed`가 아니라 `absolute`를 쓰는 이유 (중요, 반드시 이대로 구현)

`todayPage.styles.tsx`의 `Container`에 `position: relative;`를 추가하고, `Fab`는 그 안에서 `position: absolute`로 배치한다. **`position: fixed`(뷰포트 기준)는 채택하지 않는다.**

근거 — 앱 레이아웃 구조(`client/src/App.tsx`, `client/src/App.styles.tsx`) 확인 결과:

- 모바일/태블릿(`useMediaQuery("tablet")`, 즉 **너비 ≤ 768px** — `breakpoints.tablet` 기준. `todayPage.styles.tsx`가 지금까지 버튼 크기 분기에 써온 `media.mobile`(≤480px)과는 다른 기준이니 혼동하지 말 것)에서는 `<Main>`이 `padding-bottom: ${BOTTOM_TAB_BAR_HEIGHT}px`(65px)를 이미 갖고 있다. 오늘 페이지의 `Container`(`height: 100%`)는 이 `Main`의 콘텐츠 박스 안에 렌더링되므로, `Container`의 하단 경계는 이미 `BottomTabBar`(65px, `position:fixed;bottom:0;z-index:10`) 바로 위에서 끝난다.
- 데스크톱(> 768px)에서는 `BottomTabBar` 대신 일반 문서 흐름의 `<Footer />`가 `ContentContainer`(SNB+Main을 감싸는 영역) 바로 다음 형제로 렌더링된다. `Footer`는 `position:fixed`가 아니지만, 상위 `Container`가 `height: 100vh`인 flex column이라 실질적으로 뷰포트 하단에 고정된 것처럼 보인다. `Footer`의 실제 높이(패딩 16px×2 + 텍스트 한 줄 ≈ 50~55px)는 어디에도 상수로 정의돼 있지 않다 — 이 값에 의존한 하드코딩된 `bottom` 오프셋을 만들면 Footer 스타일이 바뀔 때마다 깨진다.
- 반면 `Container`에 `position: relative`를 주고 `Fab`를 그 안에서 `position: absolute; bottom: 24px; right: 24px`로 배치하면, `Fab`는 **오늘 페이지 자신의 콘텐츠 박스 기준**으로 위치가 정해진다. 이 콘텐츠 박스는 모바일/태블릿에서는 이미 `Main`의 `padding-bottom`만큼 탭바 위에서 끝나고, 데스크톱에서는 `Footer` 바로 앞에서 끝난다. 즉 **탭바/Footer의 정확한 높이를 몰라도, `Container` 하나의 경계 안에서만 24px 오프셋을 주면 두 레이아웃 모두에서 자동으로 안전하다.**
- SNB(데스크톱 전용 좌측 사이드바, `client/src/layouts/snb/snb.tsx`)는 `right` 기준 배치와 무관하다 — SNB는 화면 왼쪽에, `Fab`는 `Container`(Main 콘텐츠 영역) 오른쪽 끝에 붙으므로 SNB의 열림/닫힘 폭(200px/40px)과 무관하게 절대 겹치지 않는다.

**구현 시 반드시 확인할 것**: `Container`에 `position: relative`를 빠뜨리면 `Fab`의 `position: absolute`가 상위의 포지셔닝된 조상(현재 체인에는 없음 → 뷰포트 기준으로 계산됨, 사실상 `fixed`와 동일하게 동작)까지 거슬러 올라가 위에서 설명한 안전장치가 모두 무효화되고 Footer/탭바와 실제로 겹치게 된다.

### 3.2 좌표

```
Container {
  position: relative;   /* 신규 추가 */
  /* display: flex; flex-direction: column; height: 100%; 기존 유지 */
}

Fab {
  position: absolute;
  bottom: 24px;
  right: 24px;

  ${media.mobile} {   /* ≤480px: 화면 여백이 좁으므로만 소폭 축소, 모양/크기/z-index는 동일 */
    bottom: 16px;
    right: 16px;
  }
}
```

- `media.mobile`(480px) 분기는 탭바 회피 목적이 **아니다**(그건 이미 `Container` 콘텐츠 박스 경계로 해결됨) — 순수하게 좁은 화면에서 가장자리 여백을 8px 그리드에 맞춰 24px→16px로 줄이는 시각적 미세조정이다.

### 3.3 z-index

```
z-index: 2;
```

- `TodayTodoItem`(`todayTodoItem.styles.tsx`) 내부에 로컬 `z-index: 1`(항목 자체 배지/체크박스 겹침 처리용)이 이미 존재하므로, `Fab`가 리스트 항목보다 위에 그려지도록 그보다 큰 값을 명시적으로 지정한다.
- `BottomTabBar`(`z-index: 10`)와는 애초에 `Container` 경계 안에서 배치가 끝나 시각적으로 겹칠 일이 없으므로 그 값과 직접 비교할 필요는 없지만, 혹시 모를 레이아웃 변경에 대비해 `10`보다 낮은 안전한 값(`2`)을 유지한다.
- `Modal`(`ModalBackground z-index: 10000`, `ModalContainer z-index: 1000`)은 `Fab`보다 항상 위에 그려져야 하며, 이미 두 값 모두 `2`보다 훨씬 크므로 별도 조치 불필요.

## 4. 탭바/Footer/SNB와의 관계 요약표

| 화면 크기 | 하단 요소 | Fab와의 관계 |
|---|---|---|
| ≤ 768px (모바일·태블릿, `BottomTabBar` 노출) | `BottomTabBar`, `position:fixed`, 65px, `z-index:10` | `Container`가 이미 `Main`의 `padding-bottom:65px`만큼 탭바 위에서 끝남 → `Fab`는 그 안에서 `bottom:24px`(또는 480px 이하에서 16px) 추가 여백만 가지면 됨. 탭바 위에 40~49px가량의 여유 간격이 생김 |
| > 768px (데스크톱, SNB+Footer 노출) | `Footer`(일반 흐름, 사실상 뷰포트 하단 고정처럼 보임), `SNB`(좌측, 폭 40~200px) | `Fab`는 `Container`(Main 콘텐츠 영역) 경계 안에서 `bottom:24px; right:24px` → Footer 시작 지점보다 24px 위에서 끝나 절대 겹치지 않음. `right` 기준 배치라 좌측 SNB와는 애초에 무관 |

## 5. 스크롤 컨테이너(`ScrollArea`)와의 관계

- `Fab`는 `ScrollArea`의 자식이 아니라 `Container`의 자식(스크롤 영역 밖)이다 — 리스트를 스크롤해도 `Fab`는 화면(정확히는 `Container` 콘텐츠 박스) 우하단에 고정된 채로 유지된다.
- 이전 풀와이드 바 버전과의 핵심 차이: 이전에는 `AddButton`이 `Container`의 flex 흐름에 참여해 자기 높이(48px)만큼 공간을 차지했고, `ScrollArea`(`flex:1`)는 그 나머지 높이만 사용했다. `Fab`는 `position: absolute`로 흐름에서 완전히 빠지므로 **`ScrollArea`는 `Container`의 전체 높이를 다시 차지하게 되고, 리스트를 끝까지 스크롤하면 마지막 항목이 `Fab` 아래에 시각적으로 겹칠 수 있다.** 이는 FAB 패턴에서 흔히 나타나는 정상적인 트레이드오프(예: Gmail 편지쓰기 버튼이 메일 목록 마지막 줄과 겹치는 것과 동일)이며 버그가 아니다.
- 다만 마지막 항목이 `Fab`에 완전히 가려 탭할 수 없게 되는 것은 막아야 하므로, `ScrollArea`에 하단 여유 패딩을 추가한다:

```
ScrollArea {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-bottom: 88px;   /* Fab 높이 48px + 오프셋 24px + 여유 16px */
}
```

  - 모바일에서 오프셋이 16px로 줄어도(48+16+16=80px) 88px 패딩이 이를 충분히 덮으므로 화면 크기별로 이 값을 분기하지 않는다(통일 원칙 유지, 여분 16~24px 정도의 하단 공백은 시각적으로 무해함).

## 6. 인터랙션 — 변경 없음

- 클릭 시 `isAddOpen` state를 `true`로 설정하는 기존 로직 그대로 유지.
- 기존 `Modal` + `TodoForm` 흐름 그대로 재사용.
- `TodoForm`에 `initialDueAt={`${selectedDate}T00:00`}` 전달 방식 변경 없음.
- 버튼 라벨/아이콘: `<Plus size={16} /> 새 할일` 변경 없음.
- hover/active/focus-visible 스타일은 2.3절 참조(신규 추가, 이전 풀와이드 바에는 없던 `:focus-visible`/`:active` 스타일 추가).

## 7. 목록 페이지(`todoList.tsx`)와의 일관성 — 의도된 트레이드오프

- 이번 스코프는 오늘 페이지(`todayPage.tsx`/`todayPage.styles.tsx`)로 한정한다. 목록 페이지의 `AddButton`(하단 고정 풀와이드 바)은 **건드리지 않는다.**
- 그 결과 앱 안에 "할 일 추가" 버튼 패턴이 두 가지(오늘 페이지: 우하단 FAB / 목록 페이지: 하단 풀와이드 바) 공존하게 된다. 이는 **의도된 트레이드오프**다 — 오늘 페이지는 캘린더형 위젯(`WeekStrip`, `DailyProgress`)이 상단을 차지해 화면이 이미 여러 구역으로 나뉘어 있어 FAB가 자연스럽고, 목록 페이지는 단일 리스트+정렬/필터 UI 위주라 풀와이드 바가 여전히 자연스럽다는 판단이나, 이번 스펙에서 목록 페이지 쪽을 재검증하지는 않았다.
- 목록 페이지도 동일 패턴(FAB)으로 통일할지 여부는 **이번 스코프 밖**이며, 사용자가 별도로 요청하지 않는 한 목록 페이지는 수정하지 않는다.

## 8. 범위

### 변경 대상

- `client/src/features/today/pages/todayPage.styles.tsx`
  - `Container`에 `position: relative;` 추가
  - `ScrollArea`에 `padding-bottom: 88px;` 추가
  - `AddButton`(풀와이드 바) 제거, `Fab`(pill 플로팅 버튼) 신규 추가 — 2절/3절 스타일 그대로
  - `List`는 변경 없음
- `client/src/features/today/pages/todayPage.tsx`
  - `AddButton` import를 `Fab`로 교체, JSX에서 렌더 위치를 `Container`의 마지막 자식으로 유지(단, 흐름이 아닌 오버레이이므로 DOM 순서상 `ScrollArea` 다음에 두되 시각적으로는 겹쳐 그려짐 — DOM 순서 자체는 그대로 둬도 무방)
  - 클릭 핸들러, `Modal`/`TodoForm` 연결 로직은 변경 없음
- `client/src/features/today/pages/__tests__/todayPage.test.tsx`
  - 텍스트 기반 쿼리(`screen.getByText('새 할일')`)로 작성된 기존 테스트는 대부분 그대로 통과해야 한다(라벨 텍스트 유지). 스타일/포지셔닝 관련 스냅샷·클래스명 의존 테스트가 있다면 갱신 필요(현재는 없는 것으로 확인됨)

### 범위 밖 (변경하지 않음)

- `todoList.tsx`, `todoList.styles.tsx`의 `AddButton`(풀와이드 바) — 일절 수정하지 않음
- `WeekStrip`, `DailyProgress`, `TodaySection`, `TodayTodoItem` 등 오늘 페이지 하위 컴포넌트의 내부 로직/스타일
- `EmptyState`의 action prop 제거 등 이전 스펙에서 이미 반영된 변경 사항 — 그대로 유지(되돌리지 않음)
- `App.tsx`/`App.styles.tsx`/`BottomTabBar`/`Footer`/`SNB` — 레이아웃 상수(`BOTTOM_TAB_BAR_HEIGHT` 등)를 참조만 하고 수정하지 않음
- 새로운 공용(shared) FAB 컴포넌트 추출 — 하지 않는다. 오늘 페이지가 자신의 스타일을 소유하는 기존 컨벤션을 따른다(목록 페이지 `AddButton`과 마찬가지로 feature-scoped)

## 9. 접근성 요구사항

- `Fab`는 시각적 텍스트("새 할일")를 그대로 유지하므로 별도 `aria-label` 없이도 접근성 이름이 확보된다. 별도 `aria-label` prop을 추가하지 않는다(라벨 텍스트와 중복되는 aria-label은 오히려 스크린리더 중복 안내를 유발할 수 있음).
- `Plus` 아이콘은 장식적 요소이므로 스크린리더가 이중으로 읽지 않도록 유지한다(lucide-react 아이콘은 기본적으로 `aria-hidden`을 설정하지 않으므로, 구현 시 `<Plus size={16} aria-hidden="true" />`로 명시하는 것을 권장 — 필수는 아니나 접근성 향상을 위해 권장).
- `:focus-visible` 스타일(2.3절)은 키보드 사용자가 화면에 떠 있는 `Fab`의 포커스 위치를 시각적으로 인지할 수 있도록 반드시 포함한다.
- 버튼 높이 48px는 CLAUDE.md의 "모든 인터랙티브 요소 최소 44px" 요구사항을 충족한다.

## 10. 애니메이션/트랜지션 명세

- `transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;`
- hover: `translateY(-1px)` + 그림자 확대(0 6px 16px rgba(0,0,0,0.2))로 "떠오르는" 느낌
- active(press): `translateY(0) scale(0.97)` + 그림자 축소(0 2px 8px rgba(0,0,0,0.15))로 눌림 피드백
- 모달 오픈/클로즈 트랜지션은 기존 `Modal` 컴포넌트 것을 그대로 사용, 신규 트랜지션 추가하지 않음

## 11. 검증

- 유닛/컴포넌트 테스트: 기존 `todayPage.test.tsx`의 텍스트 기반 쿼리(`getByText('새 할일')`, 클릭 → 모달 오픈, `initialDueAt` 전달 등)는 라벨을 유지하므로 대부분 수정 없이 통과해야 한다. 다만 로딩/에러/빈 상태에서도 버튼이 "항상 렌더링"된다는 기존 테스트 의도는 그대로 유지되어야 한다(조건부 렌더링 여전히 없음).
- 로컬 개발 서버(`npm run dev`)에서 다음을 육안으로 확인:
  - 모바일 너비(≤480px): `Fab`가 하단 탭바 위 16px 오프셋에 떠 있고 탭바와 절대 겹치지 않는지
  - 태블릿 너비(481~768px): 탭바 위 24px 오프셋에서 동일하게 확인
  - 데스크톱 너비(>768px): `Fab`가 화면 우하단에 뜨고, `Footer`와 겹치지 않는지, 좌측 `SNB`(열림/닫힘 두 상태 모두)와 무관하게 위치가 흔들리지 않는지
  - 리스트를 끝까지 스크롤했을 때 마지막 항목이 `Fab`에 완전히 가려 탭 불가능한 상태가 되지 않는지(`ScrollArea` 하단 패딩 88px가 적용됐는지)
  - `Fab` hover/active/focus-visible 상태가 각각 명세대로 보이는지
  - 클릭 → 모달 오픈 → `initialDueAt`이 현재 선택된 날짜로 채워지는지(기존과 동일 동작 재확인)

## 12. ui-ux-improver에게 전달할 사항

- **가장 중요한 구현 디테일**: `Container`에 `position: relative`를 빠뜨리지 말 것 (3.1절 — 이걸 빠뜨리면 `Fab`가 뷰포트 기준으로 계산되어 데스크톱에서 Footer와 겹치는 회귀가 발생한다).
- `position: fixed`가 아니라 `position: absolute`를 쓰는 것이 이번 스펙의 핵심 결정이다. 일반적인 "FAB는 fixed"라는 직관과 다르므로 구현 중 임의로 `fixed`로 바꾸지 말 것.
- `media.mobile`(480px)과 `media.tablet`(768px, 이 컴포넌트에서 직접 쓰이진 않지만 `BottomTabBar` 노출 기준)을 혼동하지 말 것 — 이 스펙에서 `media.mobile` 분기는 탭바 회피가 아니라 순수 여백 미세조정 목적이다.
- `ScrollArea`의 `padding-bottom: 88px` 추가를 빠뜨리지 말 것 — 없으면 리스트 마지막 항목이 `Fab`에 가려 탭이 안 되는 실사용 버그가 된다.
- 기존 `todayPage.test.tsx`의 텍스트 기반 쿼리는 대부분 그대로 재사용 가능하나, 구현 후 전체 테스트를 재실행해 회귀가 없는지 반드시 확인할 것.
- 목록 페이지(`todoList.tsx`)는 이번 스코프가 아니므로 손대지 말 것(7절).
