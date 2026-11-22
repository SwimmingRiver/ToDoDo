# 모바일 인사이트(완료 통계) 이식 설계

작성일: 2026-11-22 · 관련: `2026-09-20-insights-period-project-filter-design.md`(웹 원본), `2026-11-20-mobile-ai-plan-design.md`·`2026-11-21-mobile-calendar-integration-design.md`(앱 이식 선례)

## 왜 하는가

스토어 첫 출시 조건(사용자 결정)은 프리미엄 기능 3개(AI 플랜·구글 캘린더·인사이트)가 모두 앱에 있는 것이다. AI 플랜(#192)과 캘린더 연동(#194·#197)은 들어갔고, 인사이트가 마지막이다. 원칙(11-18 사용자): 같은 계정이면 웹과 앱 어디서나 똑같이 프리미엄이고, 웹과 앱의 간극을 최대한 없앤다.

## 지금 웹은 어떻게 동작하나

- 화면: `client/src/features/insights/pages/insightsPage.tsx`. 위에서부터 필터 바(기간 탭 4개 + 프로젝트 select) → 연속 달성일 카드 → 요약 카드 4개(완료율·기한 준수율·반복 완료율·일반 완료율, 각 `완료/전체` 보조 표기) → (프로젝트 선택 시만) 프로젝트 상태 구성 누적 막대 + 범례 → 우선순위 분포 가로 막대 → 완료 추이 세로 막대.
- 계산은 전부 `@tododo/core`의 `insights/`(순수 함수): `resolvePeriodRange`, `scopeTodosByProject`, `computeCompletionRate`, `computeDueAdherence`, `computeRecurringVsOneOffRate`, `computePriorityDistribution`, `bucketCompletions`/`resolveTrendGranularity`, `computeStreak`(필터 무관, 전체 기준), `computeStatusBreakdown`, `listProjectOptions`. 라벨(`PERIOD_TAB_LABELS`, `PERIOD_TITLE_LABELS`)과 기본 필터(`DEFAULT_INSIGHTS_FILTER` = 이번 달·전체 프로젝트)도 core에 있다.
- 차트 기하도 core(`insights/chart`의 `layoutBarChart`, `layoutHorizontalBars`, `layoutStackedBar`). 웹 컴포넌트(`components/charts/*`)는 그 숫자를 `<svg>`에 옮겨 그리기만 한다 — 주석상 RN에서 react-native-svg로 같은 레이아웃을 그리려고 이렇게 나눴다.
- 데이터: `useTodosForStats`가 archived 포함 전체 이력을 1회 조회(`fetchAllUserTodos`), `enabled: !!uid && isPremium`, `staleTime` 5분, 뮤테이션 무효화 배선 없음(의도적). 필터 변경은 `useMemo` 재계산만 하고 네트워크 요청이 없다.
- 선택된 프로젝트가 옵션에서 사라지면 필터를 전체로 되돌린다.
- 상태: 권한 로딩/데이터 로딩 → 스켈레톤, 에러 → "통계를 불러오지 못했습니다 / 네트워크 연결을 확인하고 다시 시도해주세요", 무료 → 잠금 안내("완료 통계는 프리미엄 기능입니다" + 설명 + CTA). 완료 추이가 비면 "이 기간에 기록이 없습니다 / 할 일을 완료하면 여기에 추이가 쌓입니다", 상태 구성이 0건이면 "하위 할 일이 없습니다".

**앱 현황:** `mobile/src`에 인사이트 코드는 0건. 하단 탭 3개(오늘·목록·캘린더), 각 탭 스택에 `Account` 라우트가 있고 헤더 아이콘으로 간다. 프리미엄 판정은 `mobile/src/premium`의 `useIsPremium()`. 잠금 안내 선례는 `mobile/src/aiPlan/components/PlanLockedNotice.tsx`(CTA → `navigation.navigate("Account")`). `react-native-svg`는 이미 의존성에 있다. core의 `fetchAllUserTodos`는 `recurring/startupMaintenanceApi.ts` 안의 비공개 함수다.

## 목표

1. 앱 하단에 4번째 탭 **"통계"**를 추가하고, 웹과 같은 카드·지표·필터를 보여준다.
2. 숫자는 웹과 항상 같다 — 계산·라벨·차트 기하를 core에서 그대로 쓴다.
3. 무료 사용자도 탭은 보이고, 누르면 잠금 안내와 구독 경로(계정 화면)를 만난다.
4. 할 일을 완료하고 통계 탭으로 오면 대체로 바로 반영돼 있다.

## 비목표

- 새 지표·차트 추가, 웹 인사이트 변경(core 함수 공개 외).
- 할 일 뮤테이션마다 통계 쿼리 무효화(웹도 의도적으로 안 함).
- 보관함 조회 UI, 차트 인터랙션(탭해서 값 보기 등 — 웹의 hover `<title>`은 대응하지 않고 접근성 라벨로 대신한다).
- 태블릿 레이아웃(iPhone 전용 확정).
- 오프라인 캐시 영속화.

## 안티골 (동작해도 실패로 보는 것)

- 같은 계정·같은 필터에서 웹과 앱 숫자가 다르다.
- 무료 사용자에게 전체 이력 조회가 나간다(비용·불필요).
- 통계 탭을 오갈 때마다 매번 전체 이력을 다시 읽는다(1분 내 재방문 포함).
- 기존 3개 탭 동작이나 탭 아이콘·계정 헤더가 바뀐다.

## 제약

- 날짜는 로컬 키 기준(core `insights/date.ts`), `dueAt.split("T")` 금지 — core 함수만 쓰면 지켜진다.
- `@tododo/core` 루트 import 규칙은 기존 앱 코드와 같게 따른다.
- 새 네이티브 의존성 추가 없음(Pods·네이티브 재빌드 불필요해야 한다 — 개인 Mac 디스크 여유가 적음).
- 터치 영역 44pt 이상(기간 탭, 프로젝트 선택 버튼, 바텀시트 행).

## 검토한 방법

**진입점** (사용자 선택: A)
- **A. 하단 4번째 탭 "통계"** — 선택. 웹 사이드바 최상위 메뉴와 대응하고, 무료 사용자에게도 노출돼 구독 홍보가 된다. 탭이 4개가 된다.
- B. 계정 화면 안 메뉴 — 탭 구성은 유지되지만 유료 기능이 잘 안 보인다.
- C. 헤더 아이콘 — 어디서나 접근되지만 의미가 안 드러나고 헤더가 복잡해진다.

**갱신 시점** (사용자 선택: ②)
- ① 웹과 동일(staleTime 5분) — 완료 직후 탭 전환 시 숫자가 안 바뀌어 고장처럼 보인다.
- **② 통계 탭에 포커스될 때 다시 불러오되, 마지막 조회가 1분 이내면 생략** — 선택. 체감 정확도는 ③에 가깝고 기존 할 일 코드를 건드리지 않는다.
- ③ 할 일 뮤테이션마다 통계도 무효화 — 즉시 반영되지만 손댈 곳이 많아 회귀 위험, 웹이 의도적으로 피한 방식.

**계산·차트 구현**: core 함수와 core 차트 기하를 그대로 쓰고 react-native-svg로 그린다. 앱에서 따로 계산하면 웹과 숫자가 갈라질 위험이 있어 대안으로 두지 않았다.

## 결정된 설계

### 데이터
- core: `fetchAllUserTodos(db, userId)`를 `startupMaintenanceApi.ts`에서 공개(그 파일 또는 `api/`로 옮겨 export, 시그니처 유지). 기존 사용처 동작은 그대로. 웹 `insightsApi.ts`는 client 쪽 `fetchAllUserTodos`를 쓰고 있으니 바꾸지 않는다(범위 밖).
- 앱 `useTodosForStats`: `queryKey: ["todosForStats", uid]`, `enabled: !!uid && isPremium`, `staleTime: 60_000`. 통계 화면이 포커스될 때(`useFocusEffect` 등) stale이면 refetch — 1분 이내 재방문은 요청 없음.
- 앱 `useProductivityMetrics(filter)`: 웹 훅과 같은 계산(같은 core 함수, 같은 인자). 순수 계산부는 웹·앱 공통으로 core로 올릴지 빌더 판단(아래 "빌더 몫").

### 내비게이션
- `InsightsStack`(`Insights`, `Account` 라우트) + 탭 "통계", 아이콘은 lucide `ChartColumn`(또는 동급 막대 차트 아이콘), 위치는 캘린더 오른쪽(마지막). 헤더 제목 "통계", 다른 스택과 같은 계정 헤더 아이콘.
- `navigation/types.ts`에 `InsightsStackParamList` 추가.

### 화면 (1열 세로 스크롤)
```
┌ 통계                      [👤] ┐
│ [이번 주][이번 달][최근 90일][전체] │  ← 기간 탭(가로 4등분)
│ [ 전체 프로젝트           ▾ ]   │  ← 누르면 바텀시트
│ ┌ 🔥 5일  연속 완료 중         ┐│
│ │        전체 기간 기준         ││
│ ├ 이번 달 완료율   72%  18/25  ┤│  ← 요약 4개, 2×2 그리드
│ ├ 기한 준수율 · 반복 · 일반     ┤│
│ ├ 프로젝트 상태 구성(선택 시)   ┤│
│ ├ 우선순위 분포(가로 막대)      ┤│
│ └ 완료 추이(세로 막대)          ┘│
└─────────────────────────────────┘
```
- 문구·카드 제목·빈 상태·에러·잠금 안내 문구는 웹과 동일(위 "지금 웹은" 참고). 잠금 CTA 라벨은 앱 `PlanLockedNotice`와 같은 "구독 알아보기", 누르면 `navigate("Account")`.
- 프로젝트 선택: 버튼에 현재 값("전체 프로젝트" 또는 프로젝트명, 완료 프로젝트는 "(완료)" 접미사). 누르면 기존 `shared/ui/bottomSheet`로 목록(맨 위 "전체 프로젝트"), 현재 항목 체크 표시, 고르면 닫힘.
- 선택한 프로젝트가 옵션에서 사라지면 전체로 되돌린다(웹과 동일).
- 로딩: 권한·데이터 로딩 중 스켈레톤(기존 `ListSkeleton` 재사용 또는 카드형 간단 스켈레톤).
- Pull-to-refresh: 넣는다(빌더 몫 아님 — 수동 갱신 경로가 있어야 ② 정책의 1분 공백을 메운다). 당기면 staleTime 무시하고 refetch.

### 차트 (react-native-svg)
- `BarChart`, `HorizontalBars`, `StackedBar`를 앱 컴포넌트로 만든다. 기하는 core `layout*` 결과만 쓰고, 색은 앱 `theme/colors`·`statusColors`의 웹 대응 토큰.
- 너비는 `onLayout`으로 측정, 0이면 그리지 않는다(웹 `width===0` 규칙과 같음).
- 접근성: 차트 컨테이너에 `accessibilityRole="image"` + 웹 `ariaLabel`과 같은 문구. 상태 구성은 색만으로 구분하지 않게 범례에 건수 병기(웹과 동일).

### 테스트
- core: 공개한 `fetchAllUserTodos` 기존 테스트가 계속 통과.
- 앱(jest-expo): 잠금(무료면 조회 안 함 + 안내 노출), 로딩·에러, 필터 변경 시 카드 제목·숫자 변화, 프로젝트 선택·사라짐 리셋, 포커스 refetch 정책(1분 이내 생략), 차트 너비 0이면 미렌더. 날짜 의존 테스트는 시스템 시간 mock, `TZ=America/New_York`로도 실행.
- 내비게이션 테스트: 탭 4개, 통계 탭 → 계정 이동.

## 빌더 몫 (내가 정하지 않은 것)
- `useProductivityMetrics`의 계산부를 core로 올려 웹·앱이 공유할지(올리면 웹 훅도 그걸 쓰게 바꾼다 — 동작 불변이어야 함).
- 파일 배치(`mobile/src/insights/` 기능 폴더 + `screens/InsightsScreen.tsx`가 기존 관례와 맞음).
- 스켈레톤 형태, 카드 스타일 세부(기존 앱 카드 스타일 따름).
- 포커스 refetch 구현 방식(`useFocusEffect` + `isStale` 확인 등).
