# 반복 할 일(Recurring Todo) — UI/UX 설계 스펙

- 대상 파일: `client/src/features/todo/`, `client/src/features/kanban/`, `client/src/features/dashboard/`
- 작성일: 2026-07-03
- 상태: **사용자 검토 대기** — 승인 후 ui-ux-improver가 구현
- 관련 문서: `client/src/features/dashboard/DESIGN_SPEC.md` (캘린더 개편안, 별도로 검토 대기 중 — 본 스펙은 **현재 라이브 상태의 캘린더 구조**를 기준으로 작성하되 색상 토큰/톤은 해당 문서와 통일)

## 0. PM 확정 스코프 요약 (설계 전제)

| 항목 | 내용 |
|---|---|
| 반복 주기 | 매일 / 매주(요일 다중 선택) / 매월(같은 날짜) |
| 기준 | `dueAt` 기준 반복만 지원 (완료일 기준 없음) |
| 종료 조건 | 무기한 / 특정 종료일 (N회 반복 없음) |
| 수정 단위 | 항상 전체 시리즈 (이 인스턴스만 수정 불가) |
| 자연어 입력 | 스코프 아웃 |
| 하위 할 일 상호 배제 | 반복 ON ↔ 하위 할 일 기능 비활성 (양방향) |
| kanban 노출 | 반복 인스턴스는 `dueAt <= 오늘`인 것만 노출, 미래는 캘린더 전용 |

필드명(`recurrence`, `recurrenceId` 등)은 아직 미확정이므로 본 스펙은 필드 스키마를 가정하지 않고 **폼 인터랙션 / 모달 / 배지 / 캘린더 표현**에만 집중한다. 아래 의사코드의 `todo.isRecurring`, `todo.recurrenceSummary` 등은 실제 필드명이 아니라 UI 설계 편의상 사용하는 placeholder 표현이다.

---

## 1. 화면 구조

### 1-1. 반복 규칙 입력 폼 — `todoForm.tsx` "더보기" 영역에 통합

**기본 상태 (반복 OFF, 하위 할 일 없음 — 정상 입력 가능)**

```
┌────────────────────────────────────────┐
│ 할 일                                   │
│ ┌──────────────────────────────────┐   │
│ │ 무엇을 해야 하나요?               │   │
│ └──────────────────────────────────┘   │
│                                          │
│ [더보기 ▼]                              │
│  ├ 설명                                 │
│  ├ 우선순위                             │
│  ├ 시작일시                             │
│  ├ 만료일시  [2026-07-10T18:00]         │
│  │                                       │
│  ├ ────────────────────────────────    │
│  │ ☐ 이 할 일을 반복합니다              │  ← 신규: RecurrenceToggle (체크박스)
│  └ ────────────────────────────────    │
└────────────────────────────────────────┘
```

**반복 ON — 매일**

```
│  ☑ 이 할 일을 반복합니다              │
│  ┌────────────────────────────────┐  │
│  │ 반복 주기                        │  │
│  │ [ 매일 ]  매주    매월           │  │  ← RecurrenceTypeTabs (세그먼트 탭)
│  │                                  │  │
│  │ 종료 조건                        │  │
│  │ ● 무기한                         │  │
│  │ ○ 특정 날짜까지  [date picker]  │  │
│  └────────────────────────────────┘  │
```

**반복 ON — 매주 (요일 다중 선택 노출)**

```
│  ☑ 이 할 일을 반복합니다              │
│  ┌────────────────────────────────┐  │
│  │ 반복 주기                        │  │
│  │  매일   [ 매주 ]   매월          │  │
│  │                                  │  │
│  │ 반복 요일                        │  │
│  │  일  (월) 화  (수) 목  (금) 토   │  │  ← WeekdayPicker (원형 chip 다중 선택)
│  │                                  │  │     ※ (월)(수)(금) = 선택됨 표기
│  │  ⚠ 요일을 하나 이상 선택해주세요  │  │  ← 검증 에러 (0개 선택 시)
│  │                                  │  │
│  │ 종료 조건                        │  │
│  │ ○ 무기한                         │  │
│  │ ● 특정 날짜까지  [2026-09-30]    │  │
│  └────────────────────────────────┘  │
```

**반복 ON — 매월**

```
│  ☑ 이 할 일을 반복합니다              │
│  ┌────────────────────────────────┐  │
│  │ 반복 주기                        │  │
│  │  매일    매주   [ 매월 ]         │  │
│  │                                  │  │
│  │ ℹ 매월 10일에 반복됩니다           │  │  ← 만료일시의 '일(day)'에서 자동 유도, 읽기 전용 안내
│  │   (마감일시 기준)                 │  │
│  │                                  │  │
│  │ 종료 조건                        │  │
│  │ ● 무기한                         │  │
│  │ ○ 특정 날짜까지  [date picker]  │  │
│  └────────────────────────────────┘  │
```

**차단 상태 A — 만료일시 미입력 시 (반복 토글 자체를 켤 수 없음)**

```
│  ├ 만료일시  [ 입력되지 않음 ]         │
│  │                                       │
│  ☐ 이 할 일을 반복합니다  (비활성)     │  ← disabled, 회색 처리
│  ℹ 반복 설정은 마감일시를 입력해야      │
│    사용할 수 있습니다                   │
```

**차단 상태 B — 하위 할 일이 있는 항목 수정 시 (반복 토글 비활성)**

```
│  ☐ 이 할 일을 반복합니다  (비활성)     │  ← disabled, 회색 처리, 커서 not-allowed
│  ℹ 하위 할 일이 있는 항목은 반복을      │
│    설정할 수 없습니다                   │
```

**차단 상태 C — 하위 할 일 생성 폼 (parentId가 존재하는 경우)**

반복 섹션 자체를 렌더링하지 않는다 (섹션 자체가 DOM에 없음). 근거는 4-1절 참고.

### 1-2. 시리즈 전체 수정 확인 모달

`shared/ui/confirmModal` 재사용. 반복 중인 할 일(수정 대상이 이미 반복 시리즈인 경우)의 "저장" 클릭 시 노출.

```
┌──────────────────────────────────────┐
│                                        │
│  반복 일정 전체 수정                    │
│  ──────────────────────────────────  │
│  이 변경은 앞으로의 일정에만            │
│  적용됩니다.                           │
│                                        │
│  진행 중이거나 완료된 일정, 이미 지난   │
│  미완료 일정은 그대로 유지됩니다.       │
│                                        │
│                     [ 취소 ] [ 전체 적용 ] │
└──────────────────────────────────────┘
```

### 1-3. kanban 반복 배지

```
┌───────────────────────────────┐
│ 상위 프로젝트명                 │  ← ParentLabel (기존, 있는 경우만)
│ 정수기 필터 교체        ⟳ 반복 │  ← ItemTitle + RecurrenceBadge (우측)
└───────────────────────────────┘
```

제목이 길어 배지와 겹칠 경우 배지가 다음 줄로 wrap:

```
┌───────────────────────────────┐
│ 아주 길고 긴 할 일 제목이         │
│ 여러 줄에 걸쳐 표시되는 경우  ⟳ 반복 │
└───────────────────────────────┘
```

### 1-4. 캘린더 반복 시각 표현

**월간/주간 그리드 이벤트 바** — 제목 앞에 반복 아이콘 prefix

```
┌──────┬──────┬──────┬──────┐
│  8   │  9   │ 10   │ 11   │
│      │⟳필터교체│      │      │  ← 흰색 Repeat 아이콘 + 제목 (기존 색상 로직 유지)
├──────┼──────┼──────┼──────┤
```

**BottomSheet 날짜 상세 리스트** — 배지 + 반복 요약 캡션

```
┌─────────────────────────────┐
│  2026년 7월 10일 금요일        │
│  ───────────────────────    │
│  ┌───────────────────────┐  │
│  │▌ 정수기 필터 교체  ⟳ 반복 │  │  ← RecurrenceBadge 동일 재사용
│  │  할 일 · 마감: 7월 10일   │  │
│  │  매주 월・수・금 반복      │  │  ← 신규 캡션 라인 (반복 요약)
│  └───────────────────────┘  │
└─────────────────────────────┘
```

---

## 2. 디자인 언어

### 2-1. 색상 매핑

| 용도 | 토큰/값 | 비고 |
|---|---|---|
| 반복 아이콘/배지 텍스트 | `#0F6E56` (톤다운 primary) | CLAUDE.md 명시 톤다운 색 재사용 |
| 반복 배지 배경 | `#E8F5EF` | `dashboard/DESIGN_SPEC.md`에서 이미 "brand.secondary 15% 알파 상당"으로 정의된 값과 동일 — **신규 값 아님, 기존 스펙과 통일** |
| 반복 요일 선택 chip (선택됨) | `colors.brand.primary` `#0F6E56` | `weekStrip.styles.tsx`의 `DayCell $isSelected` 배경과 동일 패턴 재사용 |
| 반복 요일 선택 chip (미선택) | `transparent` + 텍스트 `colors.text.tertiary` | `weekStrip.styles.tsx`의 `DayLabel` 비선택 스타일과 동일 |
| 반복 주기 탭 (활성) | `colors.brand.secondary` `#1D9E75` (하단 보더 2px) | `kanbanBoard.styles.tsx`의 `MobileTabButton $active` 패턴 재사용 |
| 검증 에러 텍스트 | `colors.danger.text` `#C53A39` | 요일 미선택, 종료일 유효성 에러 |
| 비활성(disabled) 텍스트/보더 | `colors.text.tertiary` `#9AA0A6` | 반복 토글 비활성 시 |
| 비활성 안내 문구 아이콘 | `colors.text.tertiary` | `lucide-react`의 `Info` 아이콘, 14px |
| 확인 모달 | `shared/ui/confirmModal` 기존 스타일 그대로 | 별도 색상 변경 없음 |

**신규 토큰 제안**: `colors.ts`에 `brand.background: "#E8F5EF"` 추가를 권장합니다 — 이미 두 스펙(캘린더 개편안, 본 스펙)에서 동일 값을 참조하므로 리터럴 중복 대신 토큰화하는 것이 유지보수에 유리합니다 (근거: 기존 `colors.danger.background` 패턴과 대칭).

### 2-2. 아이콘

- 반복 표시: `lucide-react`의 `Repeat` 아이콘 (프로젝트 내 아직 미사용 아이콘이나, 기존 아이콘 세트와 동일 라이브러리이므로 새 의존성 없음)
- 크기: kanban 배지 12px, 캘린더 이벤트 바 prefix 10px, BottomSheet 배지 12px
- 안내 문구 아이콘: `Info` (14px)

### 2-3. 간격

기존 `FormContainer`의 `gap: 12px` 패턴을 반복 섹션 내부에도 그대로 적용합니다 (8px 그리드보다 기존 폼 관행 우선 — 이미 12px 간격이 프로젝트 전역 폼 표준이므로 이를 따르는 것을 권장).

| 요소 | 값 | 근거 |
|---|---|---|
| 반복 섹션 내부 필드 간 gap | `12px` | 기존 `DetailContent` gap과 동일 |
| RecurrenceTypeTabs 높이 | `44px` | 터치 타겟 기준 |
| WeekdayPicker chip 크기 | `36px × 36px` (원형) | `weekStrip.styles.tsx`의 `DayCell`은 44px지만 폼 내부 인라인 배치이므로 36px로 축소 권장 — 단, 터치 영역 확보를 위해 chip 사이 `gap: 6px` 필수 |
| RecurrenceBadge 패딩 | `3px 8px` | `OverdueBadge`와 완전히 동일한 패턴 재사용 |
| RecurrenceBadge border-radius | `6px` (`radius.md`) | `OverdueBadge`와 동일 |
| 확인 모달 버튼 그룹 gap | `12px` | `confirmModal.styles.tsx` 기존 값 유지 |

### 2-4. 타이포그래피

신규 폰트 없음. 기존 `Pretendard` 웹폰트 상속. 안내/에러 문구는 `font-size: 12px`, 배지는 `font-size: 11px` (기존 `OverdueBadge` 기준과 동일).

---

## 3. 컴포넌트 설계

### 3-1. 재사용

| 컴포넌트 | 용도 |
|---|---|
| `shared/ui/confirmModal` | 시리즈 전체 수정 확인 모달 — 신규 컴포넌트 불필요 |
| `weekStrip.styles.tsx`의 `DayCell`/`DayLabel` 시각 패턴 | `WeekdayPicker` chip 스타일의 참조 원형 (동일 파일 import는 아니고, 동일 패턴을 `todoForm` 전용 스타일로 재정의 — today 피처 종속성을 todo 피처가 갖지 않도록 분리) |
| `kanbanBoard.styles.tsx`의 `MobileTabButton` 시각 패턴 | `RecurrenceTypeTabs` 참조 원형 (동일 이유로 별도 파일에 재정의) |
| `projectCard.styles.tsx`의 `OverdueBadge` 시각 패턴 | `RecurrenceBadge` 참조 원형 |

### 3-2. 신규 컴포넌트

#### `RecurrenceFields` (신규, `todoForm/` 하위)

```ts
interface RecurrenceFieldsProps {
  disabled: boolean;              // 하위 할 일 존재 또는 dueAt 미입력 시 true
  disabledReason?: "hasChildren" | "noDueAt";
  dueAt: string | null;           // 매월 반복 시 '일(day)' 유도에 사용
  value: RecurrenceFormValue | null; // null = 반복 OFF
  onChange: (value: RecurrenceFormValue | null) => void;
}

interface RecurrenceFormValue {
  type: "daily" | "weekly" | "monthly";
  weekdays?: number[];            // 0=일 ~ 6=토, type==="weekly"일 때만 사용, 최소 1개
  endType: "indefinite" | "untilDate";
  endDate?: string;               // endType==="untilDate"일 때만 사용
}
```

- `RecurrenceFields`는 `todoForm.tsx`의 `DetailContent` 내부, 만료일시 입력 아래에 위치.
- 내부적으로 체크박스(반복 on/off) + `RecurrenceTypeTabs` + `WeekdayPicker`(조건부) + 종료조건 라디오 그룹을 조합한 복합 컴포넌트.
- `todoDetail.tsx`(할 일 상세 편집 패널)에도 동일하게 통합 필요 — 현재 `todoDetail.tsx`는 `todoForm.tsx`와 별도 구현(중복 코드)이므로, `RecurrenceFields`를 공용 컴포넌트로 분리해 두 곳에서 import.

#### `RecurrenceTypeTabs` (신규)

```ts
interface RecurrenceTypeTabsProps {
  value: "daily" | "weekly" | "monthly";
  onChange: (type: "daily" | "weekly" | "monthly") => void;
}
```

`MobileTabButton` 시각 패턴(하단 보더 2px, 활성 시 `colors.brand.secondary`) 재사용. `role="tablist"` / 각 버튼 `role="tab"` + `aria-selected`.

#### `WeekdayPicker` (신규)

```ts
interface WeekdayPickerProps {
  selected: number[];   // 0=일 ~ 6=토
  onToggle: (day: number) => void;
  error?: boolean;       // 0개 선택 시 true
}
```

원형 chip 7개(일~토), 다중 토글. `weekStrip`의 `DayCell` 패턴을 축소(36px)하여 재정의. `error===true`일 때 하단에 `colors.danger.text` 에러 텍스트 노출.

#### `RecurrenceBadge` (신규, `shared/ui/` 또는 `todo/components/` — 아래 3-3 참고)

```ts
interface RecurrenceBadgeProps {
  compact?: boolean; // true면 아이콘만, false(기본)면 "반복" 텍스트 포함
}
```

kanban 카드, BottomSheet 날짜 상세 리스트, (필요 시) todoDetail 패널 헤더에서 공통 사용. `OverdueBadge` 패턴 그대로 색상만 교체.

### 3-3. 배치 위치 판단

`RecurrenceBadge`는 `todo`, `kanban`, `dashboard` 세 피처에서 공통으로 쓰이므로 `shared/ui/recurrenceBadge/`에 두는 것을 권장합니다 (근거: `OverdueBadge`는 `todo` 피처 전용이라 `projectCard.styles.tsx`에 있지만, `RecurrenceBadge`는 kanban/dashboard까지 걸치는 교차 피처 컴포넌트이므로 `shared/ui`가 더 적절 — CLAUDE.md의 `shared/` = 공통 컴포넌트 원칙과 일치).

### 3-4. 기존 컴포넌트 수정 지점

| 파일 | 수정 내용 |
|---|---|
| `todo/components/todoForm/todoForm.tsx` | `RecurrenceFields` 통합, 저장 시 기존 recurrence 존재 여부에 따라 `ConfirmModal` 분기 |
| `todo/components/todoDetail/todoDetail.tsx` | 동일하게 `RecurrenceFields` 통합 + 저장 시 `ConfirmModal` 분기 |
| `todo/components/projectCard.tsx` | `todo.isRecurring`일 때 "하위 작업 추가"(`Plus` 아이콘) `IconButton`에 `disabled` + `aria-disabled` + `title="반복 할 일에는 하위 작업을 추가할 수 없습니다"` 부여 |
| `todo/components/childTodoCard.tsx` | 변경 없음 (하위 할 일 자체는 반복 설정 대상이 아님 — 4-1절 근거) |
| `kanban/components/kanbanItem.tsx`, `kanbanBoard.styles.tsx` | `ItemTitleRow`(신규 flex wrapper) 추가, `RecurrenceBadge` 조건부 렌더링 |
| `dashboard/components/calendar.tsx` | `events` useMemo에서 `eventContent` 콜백 추가(반복 아이콘 prefix), `DayDetailItem`에 `RecurrenceBadge` + 반복 요약 캡션 라인 추가 |
| `shared/ui/confirmModal/confirmModal.styles.tsx` | `Message`에 `white-space: pre-line;` 추가 (줄바꿈 포함 카피 지원 — 현재 단일 라인 가정) |

---

## 4. 인터랙션 플로우

### 4-1. 하위 할 일 ↔ 반복 상호 배제

```
[케이스 A] 반복 없는 일반 할 일 수정 화면, 하위 할 일 0개
  → 반복 체크박스 활성

[케이스 B] 하위 할 일이 1개 이상 있는 할 일 수정 화면
  → 반복 체크박스 disabled + 안내 문구 노출
  → (하위 할 일을 모두 삭제하면 다음 진입 시 활성화됨 — 실시간 토글 아님, 폼 재오픈 시 반영으로 충분)

[케이스 C] 이미 반복 중인 할 일의 ProjectCard
  → "하위 작업 추가" 아이콘 버튼 disabled
  → 사용자가 버튼에 hover/focus 시 title 툴팁으로 사유 안내
  → 클릭 이벤트 자체를 막음 (disabled 속성으로 충분, 별도 토스트 불필요)

[케이스 D] 하위 할 일 생성/수정 폼 (parentId 존재)
  → 반복 섹션 미노출 (조건부 렌더링 안 함)
```

**케이스 D 근거 및 권장안**: PM 스코프에 하위 할 일 자체의 반복 가능 여부가 명시되어 있지 않으나, "반복 할 일은 하위 할 일을 가질 수 없다"는 상호 배제 원칙과의 일관성, 그리고 반복 인스턴스 생성/삭제 로직이 하위 계층까지 전파될 경우의 복잡도를 고려하면 **하위 할 일에는 반복 설정 자체를 노출하지 않는 것**을 권장합니다. 계층 구조의 최상위(부모/단일 할 일)에서만 반복이 의미를 가지도록 제한하는 것이 MVP 범위에서 가장 단순하고 사고 위험이 적습니다.

### 4-2. 반복 토글 활성 전제조건 — 만료일시 필수

```
사용자가 만료일시를 입력하지 않은 상태
  → 반복 체크박스 disabled + "반복 설정은 마감일시를 입력해야 사용할 수 있습니다"
  ↓
사용자가 만료일시 입력
  → 반복 체크박스 활성화 (즉시, 리렌더 시)
  ↓
사용자가 만료일시를 다시 지움 (반복이 이미 켜진 상태에서)
  → 반복 체크박스 강제 OFF + value를 null로 리셋 + 안내 문구 재노출
  → (조용히 무시하지 않고 명시적으로 리셋 — 반복 규칙만 남고 기준일이 없는 비정상 상태 방지)
```

### 4-3. 매월 반복의 '일(day)' 유도

```
반복 주기 = 매월 선택
  ↓
dueAt의 day 값을 읽어 "매월 {day}일에 반복됩니다 (마감일시 기준)" 읽기 전용 안내 렌더링
  ↓
사용자가 만료일시를 변경
  ↓
안내 문구의 {day} 값도 즉시 재계산되어 갱신
```

31일 등 매월 존재하지 않는 날짜에 대한 처리(예: 2월)는 UI 문구로 사전 안내하는 것을 권장합니다: 만료일시의 `day >= 29`인 경우 안내 문구 하단에 보조 텍스트 추가.

```
ℹ 매월 31일에 반복됩니다 (마감일시 기준)
  31일이 없는 달은 해당 월 마지막 날에 생성됩니다   ← day>=29일 때만 노출되는 보조 캡션
```

(이 보조 문구는 실제 생성 로직이 확정되는 대로 schedule-manager/PM 확인 후 문구 조정 필요 — 로직 자체는 본 스펙 범위 밖)

### 4-4. 시리즈 전체 수정 확인 모달 트리거

```
사용자가 반복 중인 할 일의 수정 폼(todoForm 또는 todoDetail)에서 "저장" 클릭
  ↓
수정 대상 todo가 반복 시리즈에 속하는가? (필드가 무엇이든 무관 — 제목/우선순위만 바꿔도 동일)
  ├─ No  → 기존과 동일하게 즉시 저장 (변경 없음)
  └─ Yes → ConfirmModal 오픈 (제출 자체는 아직 실행 안 함)
              ↓
        [취소] 클릭 → 모달만 닫힘, 폼은 그대로 유지 (입력값 보존)
        [전체 적용] 클릭 → 기존 onSubmit 로직 실행 (mutate 호출)
              → 성공: toast.success + 모달/폼 닫힘
              → 실패: toast.error, 모달은 닫히고 폼은 유지 (재시도 가능하도록)
```

**반복 OFF로 전환하는 저장도 동일하게 취급**: 반복 중이던 할 일의 반복 체크박스를 해제하고 저장하는 것도 "시리즈 수정"의 하나로 간주하여 동일한 확인 모달을 노출합니다 (반복 해제 = 향후 인스턴스 생성을 중단하는 시리즈 변경이므로 정책 문구가 그대로 적용됨).

**신규 할 일 생성 시에는 모달 없음**: 처음 반복을 설정해서 "추가"하는 경우는 기존 인스턴스가 없으므로 확인 모달을 띄우지 않습니다. 트리거 조건은 "기존에 반복 시리즈였던 할 일을 수정 저장"하는 경우로 한정합니다.

### 4-5. kanban 노출 필터 + 배지

```
반복 인스턴스 목록
  ↓
dueAt <= 오늘 인 인스턴스만 kanban 컬럼에 렌더링 (일반 할 일 필터링 로직은 변경 없음 — 이 필터는 반복 인스턴스 전용 추가 조건)
  ↓
kanban에 노출된 각 반복 인스턴스 카드
  → RecurrenceBadge 항상 표시 (아이콘 + "반복" 텍스트)
  ↓
사용자가 배지를 보고 "이 카드는 반복 시리즈의 일부"임을 인지
  → 카드 클릭 시 이동하는 상세 화면(todoDetail)에서 전체 시리즈 정보(반복 주기, 종료조건) 확인 가능해야 함 (todoDetail에도 RecurrenceFields 표시 — 읽기/수정 겸용)
```

### 4-6. 캘린더 시각 표현

```
캘린더는 kanban과 달리 미래 인스턴스도 전부 렌더링 (필터 없음)
  ↓
각 이벤트의 extendedProps.isRecurring 여부에 따라
  eventContent 콜백에서 제목 앞에 Repeat 아이콘(10px, 흰색) prefix 렌더링
  ↓
날짜 클릭 → BottomSheet
  → 반복 인스턴스인 항목에 RecurrenceBadge + "매주 월・수・금 반복" 같은 요약 캡션 추가
  → 기한 초과 표시(기존 $overdue 로직)와 독립적으로 동시 표시 가능
    예: 기한 초과 + 반복 인스턴스인 경우 → 빨간 좌측 보더(기존) + RecurrenceBadge(신규) 동시 노출
```

---

## 5. 상태 정의

### 5-1. 반복 입력 폼

| 상태 | 표현 |
|---|---|
| 기본 (반복 OFF, 입력 가능) | 체크박스 unchecked, 하위 필드 미노출 |
| 반복 ON | 하위 필드(주기 탭, 요일/월 정보, 종료조건) 노출, `DetailSection`과 동일한 grid-template-rows 트랜지션(0.3s) 적용 권장 — 기존 `더보기` 아코디언과 시각적 일관성 |
| 비활성 - 만료일시 없음 | 체크박스 disabled, opacity 0.5, `Info` 아이콘 + 안내 문구 |
| 비활성 - 하위 할 일 존재 | 체크박스 disabled, opacity 0.5, `Info` 아이콘 + 안내 문구 |
| 요일 미선택 에러 (매주) | `WeekdayPicker` 하단 `colors.danger.text` 에러 텍스트, 폼 제출 차단 |
| 종료일 유효성 에러 | "종료일은 마감일 이후여야 합니다" 에러 텍스트, 폼 제출 차단 |
| 제출 중 | 기존 `useUpdateTodo`/`useCreateTodo` mutation의 loading 상태 — 별도 스피너 없이 기존 패턴(제출 버튼 비활성화 등) 유지, 신규 로딩 UI 불필요 |

### 5-2. 시리즈 전체 수정 확인 모달

| 상태 | 표현 |
|---|---|
| 닫힘 (기본) | 렌더링 안 함 |
| 열림 | `Overlay` + `Container`, 배경 클릭 시 취소와 동일 동작(기존 `ConfirmModal` 동작 그대로) |
| 제출 중 | "전체 적용" 버튼에 기존 mutation의 `isPending` 상태 연동 권장 (중복 클릭 방지) — `disabled` 처리 |
| 실패 | 모달 닫힘 + `toast.error` (기존 toast 패턴) |

### 5-3. kanban 배지

| 상태 | 표현 |
|---|---|
| 반복 아님 | 배지 미노출 (기존과 동일) |
| 반복 인스턴스 | `RecurrenceBadge` 항상 노출, 로딩/에러 상태 없음(정적 표시) |

### 5-4. 캘린더

| 상태 | 표현 |
|---|---|
| 로딩 | 기존 `Spinner` 유지 (변경 없음) |
| 에러 | 기존 `EmptyState` 유지 (변경 없음) |
| 반복 이벤트 (월간/주간 그리드) | 아이콘 prefix, 기존 색상 로직(상태별/기한초과) 그대로 유지 |
| 반복 이벤트 (BottomSheet 상세) | `RecurrenceBadge` + 반복 요약 캡션 |
| 빈 상태 (해당 날짜 할 일 없음) | 기존 `EmptyMessage` 유지 (변경 없음) |

---

## 6. 디자인 토큰 요약

| 용도 | 토큰/값 |
|---|---|
| 반복 배지/아이콘 색상 | `#0F6E56` (신규 토큰 제안: `colors.brand.background` 없음 상태이므로 우선 리터럴 사용, 추후 토큰화 권장) |
| 반복 배지 배경 | `#E8F5EF` |
| 요일 chip 선택 배경 | `colors.brand.primary` |
| 반복 주기 탭 활성 | `colors.brand.secondary` |
| 에러 텍스트 | `colors.danger.text` |
| 비활성 텍스트/보더 | `colors.text.tertiary` |
| 반응형 기준 | `breakpoints.ts`의 mobile(~480px) / tablet(~768px) |
| 터치 타겟 | 모든 인터랙티브 요소(체크박스, 탭, chip, 배지 클릭 영역이 있다면) 최소 44px — 단 `WeekdayPicker` chip은 36px 시각 크기 + 상하좌우 패딩으로 실질 히트영역 44px 확보 권장 |

---

## 7. 접근성 요구사항

- 반복 체크박스: `<input type="checkbox">` 네이티브 사용, `aria-describedby`로 비활성 사유 안내 문구 연결
- `RecurrenceTypeTabs`: `role="tablist"` wrapper, 각 버튼 `role="tab"` + `aria-selected` + `aria-controls`(연결된 하위 필드 영역 id)
- `WeekdayPicker`: 각 chip은 `<button type="button" aria-pressed={selected}>` 사용, 그룹 wrapper에 `role="group"` + `aria-label="반복 요일 선택"`
- 요일 미선택/종료일 에러: `role="alert"` 또는 `aria-live="polite"` 영역으로 스크린리더에 즉시 안내
- `RecurrenceBadge`: 아이콘만 있는 `compact` 모드일 경우 반드시 `aria-label="반복 할 일"` 부여 (텍스트 포함 모드는 텍스트 자체로 충분하므로 추가 aria 불필요)
- 시리즈 수정 확인 모달: 기존 `ConfirmModal` 접근성 패턴(포커스 트랩 등) 그대로 승계 — 별도 추가 요구사항 없음
- 캘린더 이벤트 바의 반복 아이콘: 시각 전용 요소이므로 `aria-hidden="true"` 처리, 이벤트 자체의 접근성 텍스트는 FullCalendar 기본 title 속성에 의존 (기존과 동일)

---

## 8. ui-ux-improver에게 전달할 사항

1. **`RecurrenceFields` 위치**: `todoForm.tsx`와 `todoDetail.tsx` 양쪽에서 중복 없이 재사용할 수 있도록 별도 파일로 분리해서 구현할 것을 권장합니다(예: `todo/components/recurrence/recurrenceFields.tsx`). 두 폼이 이미 유사 로직을 중복 구현하고 있으므로(예: `startAt`/`dueAt` 변환 로직) 이번 기회에 최소한 반복 관련 로직만이라도 공용화하는 것이 유지보수에 유리합니다.

2. **`ConfirmModal.Message` 개행 지원**: 현재 `confirmModal.styles.tsx`의 `Message`는 개행 미지원(`white-space` 기본값). `\n`이 포함된 문자열을 그대로 렌더링하려면 `white-space: pre-line;` 한 줄 추가가 필요합니다. 다른 `ConfirmModal` 사용처(삭제 확인 등)에 영향 없는 안전한 변경입니다.

3. **트리거 조건 판별 로직**: "수정 대상이 반복 시리즈에 속하는가"의 판별은 실제 필드 스키마 확정 후 `todo.recurrence != null` 또는 `todo.recurrenceId != null` 형태로 구현될 것으로 예상됩니다. 필드명이 확정되면 `onSubmit` 핸들러 내 분기 조건만 교체하면 되도록, UI 컴포넌트는 `isRecurring: boolean` 같은 파생 prop을 받는 형태로 설계해 필드 스키마 변경에 대한 결합도를 낮추는 것을 권장합니다.

4. **kanban 필터링 로직 위치**: "반복 인스턴스는 `dueAt <= 오늘`만 노출"하는 필터는 `kanbanColumn.tsx` 또는 그 상위 `kanbanBoard.tsx`의 todos 필터링 단계에 추가되어야 하며, **일반(비반복) 할 일의 기존 kanban 노출 로직에는 영향이 없어야 합니다.** 조건 분기 시 `todo.isRecurring`(또는 확정된 필드명) 체크를 먼저 하고 참일 때만 추가 날짜 필터를 적용하는 방식을 권장합니다.

5. **`ItemTitleRow`의 텍스트 줄바꿈 정책**: 배지가 제목을 가리지 않도록 `flex-wrap: wrap`을 적용하고 `ItemTitle`에 별도의 `text-overflow: ellipsis`를 적용하지 않는 것을 권장합니다(1-3절 wireframe 참고) — 축약보다 전체 제목 노출이 우선순위가 높다는 판단입니다. 이 판단에 이견이 있다면 구현 전 재확인 바랍니다.

6. **`RecurrenceBadge` 배치 경로**: `shared/ui/recurrenceBadge/`에 신규 생성 권장 (3-3절 근거). `todo`, `kanban`, `dashboard` 세 피처가 모두 import하므로 `shared/ui/index.ts`에 export 추가 필요.

7. **매월 반복 안내 캡션의 최종 문구**: 4-3절의 "31일이 없는 달은 해당 월 마지막 날에 생성됩니다" 문구는 실제 반복 생성 로직(schedule-manager 스프린트 계획)이 확정된 뒤 문구가 로직과 일치하는지 재확인이 필요합니다. 로직이 다르게 확정될 경우(예: 해당 월 생성 스킵) 문구도 함께 수정되어야 합니다.

8. **`dashboard/DESIGN_SPEC.md`와의 관계**: 캘린더 개편안(월간/주간 전환, 드래그 등)이 승인·구현되면 `BottomSheet`의 `DayDetailItem` 구조 자체는 유지되므로 본 스펙의 `RecurrenceBadge`/캡션 추가는 그대로 호환됩니다. 다만 개편안 승인 이전에 본 스펙이 먼저 구현될 경우, 두 스펙 모두 `calendar.tsx`/`calendar.styles.tsx`를 수정하므로 **구현 순서 충돌(병합 충돌) 가능성**을 PM/schedule-manager와 사전 조율할 것을 권장합니다.

9. **애니메이션**: 반복 하위 필드 노출/숨김은 기존 `DetailSection`의 `grid-template-rows` 트랜지션(0.3s ease-in-out) 패턴을 그대로 재사용해 일관성을 유지합니다. 별도의 신규 트랜지션 정의는 불필요합니다.

---

## 9. 미결/추천안 요약 (승인 시 확정)

아래는 스펙 작성 중 발생한 모호 지점에 대해 근거를 곁들여 제시하는 추천안입니다. 별도 이견이 없으면 그대로 승인 처리해 주세요.

| 항목 | 추천안 | 근거 |
|---|---|---|
| 하위 할 일 자체의 반복 가능 여부 | 하위 할 일에는 반복 섹션을 아예 노출하지 않음 (4-1절 케이스 D) | 상호 배제 원칙과의 일관성, MVP 복잡도 최소화 |
| 반복 OFF 전환도 확인 모달 트리거 대상인지 | 포함 (4-4절) | "시리즈 수정"의 한 형태로 보는 것이 정책 문구와 일관됨 |
| `RecurrenceBadge` 배치 위치 | `shared/ui/recurrenceBadge/` | 3개 피처 교차 사용, CLAUDE.md의 shared 원칙과 일치 |
| 반복 배지 배경색 | `#E8F5EF` | 캘린더 개편 스펙에서 이미 사용된 값과 통일 |
| kanban 배지 표기 | 아이콘 + "반복" 텍스트(컴팩트 모드 아님) | `OverdueBadge`가 텍스트 포함 방식이라 시각적 일관성 우선 |
| 매월 반복 day 유도 UI | 별도 날짜 선택 없이 `dueAt`의 day를 읽기 전용으로 안내 | PM 스코프("매월 같은 날짜")가 이미 dueAt 종속을 전제 |
