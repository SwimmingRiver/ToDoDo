# 완료 통계(Insights) 확장 — 기간 프리셋 × 프로젝트 필터 + SVG 차트 — 설계

## Context

2026-09-20 로드맵을 **프리미엄 기능 추가 → 모바일(RN) 웹격차 축소 → 스토어 심사** 순으로 확정했다. 프리미엄 조각은 (1) 통계 시각화 확장, (2) AI 할 일 플랜 생성, (3) 결제/구독 세 가지이며, 이 스펙은 **(1)만** 다룬다. (2)(3)은 각각 별도 스펙으로 진행한다.

`client/src/features/insights/`는 PR #109에서 프리미엄 게이트(`PremiumGate`)가 걸린 완료 통계 화면으로 이미 존재하지만, 다음 세 가지가 부족하다고 판단했다:

- 기간이 7일/30일(완료율)·14일(추이)로 **고정**이라 사용자가 볼 범위를 고를 수 없다.
- 개별 할 일 수준의 집계뿐이라 **"이 프로젝트가 어디까지 왔나"** 관점이 없다.
- 차트가 라이브러리 없이 CSS `div`로 그린 막대 2종(세로 막대 추이, 가로 막대 우선순위 분포)뿐이라 축·눈금이 없어 값을 읽기 어렵다. (파이차트는 `81f6db7`에서 이미 제거됨.)

브레인스토밍에서 확정한 범위:

- 기간: **프리셋 탭 4개**(이번 주 / 이번 달 / 최근 90일 / 전체). 이전 기간 대비 증감, 사용자 지정 범위는 **안 함** — 실사용 가능성이 낮다고 판단.
- 프로젝트: 루트 할 일(`parentId === null`) **하나를 골라** 그 프로젝트 기준으로 모든 지표를 재계산하는 **필터** 방식. 프로젝트 간 비교 뷰는 **안 함** — "한 프로젝트당 기록을 보는 것"이 목적.
- 시각화: 차트 라이브러리를 도입하지 않고, **기하 계산을 `packages/core` 순수 함수로 두고 렌더러는 얇은 `<svg>`** 로 만든다(아래 "왜 라이브러리가 아닌가" 참고).
- 프로젝트 선택 컨트롤: 네이티브 `<select>`.

## 전체 구조

```
useTodosForStats (변경 없음: archived 포함 전체 이력 1회 fetch)
        │
        ▼
useProductivityMetrics(filter)              ← client 훅, useMemo
        │  scopeTodosByProject → resolvePeriodRange → 지표 계산 → 차트 데이터
        ▼
InsightsPage ── InsightsFilterBar (PeriodTabs + 프로젝트 <select>)
             ├─ StreakCard            (필터 무시, 전체 기준)
             ├─ InsightsSummaryCards  (선택 기간 완료율 / 기한 준수 / 반복 비율)
             ├─ CompletionTrend       (BarChart  ← core layoutBarChart)
             ├─ PriorityDistribution  (HorizontalBars ← core layoutHorizontalBars)
             └─ StatusBreakdownCard   (StackedBar ← core layoutStackedBar, 프로젝트 선택 시에만)
```

계산(필터·지표·차트 기하)은 전부 `packages/core/src/insights/`의 순수 함수다. 웹 컴포넌트는 그 숫자를 받아 그리기만 한다. 로드맵 2단계에서 RN 앱은 같은 core 함수를 `react-native-svg`로 그린다.

### 왜 라이브러리가 아닌가

- 이번 범위의 차트는 막대 3종(세로/가로/누적)뿐이라 축·눈금을 직접 계산하는 비용이 감당된다.
- 웹(Recharts)과 RN(gifted-charts 등)은 라이브러리가 달라 차트 코드가 두 벌이 되고, 디자인 토큰을 각 라이브러리 스타일 API로 따로 뚫어야 한다. 기하를 core에 두면 한 벌이고 유닛 테스트가 된다.
- 번들 증분이 거의 0이다(`client/bundle-budget.json` 예산이 CI에서 강제됨).
- 호버 툴팁은 만들지 않는다 — 모바일엔 호버가 없어서, 값을 라벨/`<title>`로 직접 표시하는 편이 양쪽에서 같은 결과를 낸다.

## 필터 모델

```ts
type PeriodPreset = "thisWeek" | "thisMonth" | "last90Days" | "all";

interface InsightsFilter {
  period: PeriodPreset;
  /** 루트 할 일 id. null이면 전체. */
  projectId: string | null;
}

/** 로컬 날짜 키(yyyy-MM-dd) 범위, 양끝 포함. all이면 null. */
type PeriodRange = { startKey: string; endKey: string } | null;
```

| 결정 | 값 | 이유 |
|---|---|---|
| 기본값 | `{ period: "thisMonth", projectId: null }` | 첫 진입에서 데이터가 너무 적지도 많지도 않은 범위 |
| 상태 저장 | 안 함(URL/localStorage X) | YAGNI. 페이지 재진입 시 초기화 |
| 주 시작 요일 | **일요일** | 대시보드 캘린더(FullCalendar 기본값)와 일치 |
| `thisWeek` | 이번 주 일요일 ~ 오늘 | |
| `thisMonth` | 이번 달 1일 ~ 오늘 | |
| `last90Days` | 오늘 포함 최근 90일 | |
| `all` | 범위 없음 | |

기간 경계는 기존 지표 함수와 같은 이유로 **ms 뺄셈이 아니라 로컬 날짜 키 문자열 비교**로 판단한다(`dueAt`/`doneAt`이 UTC ISO로 저장되어 있어 DST/타임존 경계에서 하루가 어긋날 수 있음 — `client/src/features/insights/utils/computeCompletionRate.ts`의 주석과 동일한 근거).

## 프로젝트 스코프

- `scopeTodosByProject(todos, projectId)`: `projectId`가 null이면 전체, 아니면 **루트 자신 + `parentId === projectId`인 자식** 만 남긴다.
- 프로젝트 옵션 목록: `parentId === null`인 루트 전부. **아카이브된 루트도 포함**(통계가 전체 이력 기준이라 옛 프로젝트 기록도 볼 수 있어야 함). 정렬은 진행 중(`status !== "done"`) 먼저 → 완료 순, 각 그룹 안에서 `updatedAt` 내림차순. 라벨은 제목.
- 선택된 `projectId`가 옵션 목록에 없어지면(삭제 등) `null`로 리셋한다.

## 지표

기존 4개 지표 함수는 `client/src/features/insights/utils/`에서 `packages/core/src/insights/`로 **이동**하고 시그니처를 `(todos, range: PeriodRange, now?)`로 통일한다. 계산 로직 자체(완료율은 dueAt→doneAt 기준, 날짜 키 비교 등)는 바꾸지 않는다.

| 지표 | 필터 반응 | 비고 |
|---|---|---|
| 완료율 | 기간·프로젝트 | 기존 7d/30d 두 칸 → 선택 기간 한 칸 |
| 기한 준수율 | 기간·프로젝트 | |
| 반복/단발 비율 | 기간·프로젝트 | |
| 우선순위 분포 | 기간·프로젝트 | |
| 완료 추이 | 기간·프로젝트 | 버킷은 아래 표 |
| 스트릭 | **무시** — 항상 전체 todos·전체 기간 | 프로젝트별 연속 달성일은 의미가 약함. 카드에 "전체 기간 기준" 캡션 |
| 상태 구성(신규) | 프로젝트 선택 시에만 표시 | todo/doing/done 건수. **루트 제외 자식만** 집계(루트 상태는 자식에서 도출되는 값이라 이중 계산 방지). 자식이 없는 루트면 루트 자신 1건 |

완료 추이 버킷(`bucketCompletions`):

| 프리셋 | 버킷 | 개수 |
|---|---|---|
| thisWeek | 일 | 일요일~오늘 (1~7) |
| thisMonth | 일 | 1일~오늘 |
| last90Days | 7일 단위(범위 시작일부터, 일요일 정렬 안 함 — 정렬하면 13/14개로 흔들림) | 13 |
| all | 월 | 첫 완료월 ~ 이번 달. 완료 0건이면 빈 배열 |

빈 버킷은 0으로 채운다. 반환은 `{ key, label, count }[]` — `label`은 렌더러가 그대로 쓰는 짧은 축 라벨(일=`M/d`, 주=시작일 `M/d`, 월=`yyyy.M`).

## 차트 기하 (`packages/core/src/insights/chart/`)

전부 픽셀 단위 숫자만 반환하는 순수 함수. `width <= 0`이면 빈 결과.

- `layoutBarChart({ points, width, height, padding? })` → `{ bars: {x,y,w,h,value,label}[], yTicks: {y,value}[], xLabels: {x,text,visible}[], baselineY }`
  - y 눈금은 "nice number": 최대값을 1·2·5×10ⁿ 단위로 올림, 3~4개.
  - x 라벨은 `ceil(n × LABEL_W / plotWidth)` 간격으로 `visible` 플래그. 마지막 라벨은 항상 표시. 지금 코드의 `index % 3` 하드코딩을 대체.
- `layoutHorizontalBars({ rows, width })` → 행별 `{ fillWidth, ratio }`
- `layoutStackedBar({ segments, width })` → 세그먼트별 `{ x, w, ratio }`. 0인 세그먼트 제외.

## 웹 렌더러 (`client/src/features/insights/components/charts/`)

- `barChart.tsx` / `horizontalBars.tsx` / `stackedBar.tsx` — 각각 `<svg>` 하나. 너비는 컨테이너를 `ResizeObserver`로 측정하는 `shared/hooks/useElementWidth.ts`(신설)로 얻고, 높이는 고정(세로 막대 160px, 가로 막대 행당 24px, 누적 24px). 측정 전 `width 0`이면 빈 컨테이너만 렌더.
- 색은 기존 토큰만: `colors.brand.strong`(막대), `colors.border.tertiary`(눈금선), `colors.text.secondary`(라벨), 상태 막대는 `statusColors`. 새 색 정의 없음.
- 접근성: `<svg role="img" aria-label="이번 달 완료 추이, 최대 5건">` + 막대마다 `<title>` (브라우저 기본 호버 툴팁 겸용).
- 기존 CSS 막대 컴포넌트(`completionTrend.tsx`, `priorityDistribution.tsx`)는 SVG 버전으로 교체. `.styles.tsx`의 막대 관련 styled(`ChartRow`/`Column`/`BarTrack`/`Bar`/`BarFill`)는 삭제하고 `Card`/`Title`만 유지.
- 필터 바: `insightsFilterBar.tsx`. `PeriodTabs`는 `recurrenceTypeTabs.tsx`의 `role="tablist"`/`aria-selected` 패턴, 프로젝트 `<select>`는 `todoForm.styles.tsx`의 `Select` 스타일을 따른다. 좁은 화면에선 두 줄로 wrap.
- 카드 제목은 필터를 따른다("이번 달 완료 추이").
- 필터 결과 데이터가 0건이면 차트 자리에 `EmptyState` "이 기간에 기록이 없습니다".

## 엣지케이스

- `all`에서 완료 0건 → 버킷 0개 → EmptyState.
- 선택 프로젝트 삭제 → 옵션에서 사라지고 `projectId`가 `null`로 리셋.
- 자식 없는 루트를 프로젝트로 선택 → 루트 자신 1건 기준(상태 막대는 1건짜리).
- 너비 측정 전 첫 렌더 → svg 안 그림.
- 타임존: 모든 경계(기간·주·월 버킷)를 로컬 날짜 키로 계산. 절대 `split("T")[0]` 금지.

## 테스트

- core: `packages/core/src/insights/__tests__/`. 시스템 시간은 `vi.useFakeTimers` + `vi.setSystemTime`으로 고정하고 **절대 날짜 리터럴 픽스처 금지**(과거 CI 실패 교훈). 케이스: 주 경계(토→일), 월 경계, 90일 주 버킷 13개, all 월 버킷, 프로젝트 스코프(루트+자식만), 자식 없는 루트, 레이아웃 3종의 눈금/라벨 간격/`width 0`.
- 기존 지표 4개는 core로 옮기면서 테스트도 함께 이동, `range` 시그니처 변경분만 수정.
- 웹: `insightsPage.test.tsx`에 프리셋 탭 클릭 → 카드 제목 변경, 프로젝트 선택 → 상태 막대 등장, 0건 → EmptyState. 차트 컴포넌트는 `role="img"` aria-label과 `<rect>` 개수 수준.
- `packages/core/dist`는 git에 커밋되어 있고 client가 `dist/index.js`를 참조하므로, core 변경 후 `npm run build` 결과물도 함께 커밋한다.

## 범위 밖

- 모바일(RN) 이식 — 로드맵 2단계. core 함수는 그때 그대로 재사용.
- 이전 기간 대비 증감, 사용자 지정 범위, 프로젝트 간 비교 뷰, 호버 툴팁 컴포넌트.
- `useTodosForStats`/Firestore 쿼리, `PremiumGate`/엔타이틀먼트 변경.
- AI 할 일 플랜 생성, 결제/구독 — 별도 스펙.
