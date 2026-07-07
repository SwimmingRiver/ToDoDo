# 반복 할 일 시작일/마감일 의미 재정의 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 반복 할 일을 만들 때 "시작일(startAt)"을 반복이 시작되는 앵커로, "마감일(dueAt)"을 (있으면) 반복이 끝나는 날짜로 쓰도록 필드 의미를 재정의한다.

**Architecture:** `generateRecurringDueDates`(순수 함수, `client/src/features/todo/utils/recurrence.ts`)는 변경하지 않는다 — 이미 "앵커 날짜 하나 + 규칙 + horizonEnd"를 받는 범용 함수라 무엇을 앵커로 넘기든 그대로 동작한다. 변경은 전부 **호출부**(`todoApi.ts`가 `todo.dueAt` 대신 `todo.startAt`을 앵커로 전달)와 **폼 레이어**(`recurrenceFields.tsx`의 수동 "종료 조건" UI를 제거하고, `recurrenceTransform.ts`가 `todo.dueAt` 유무로부터 `RecurrenceRule.endType`/`endDate`를 자동 유도)에 집중된다. `RecurrenceRule`(Firestore에 저장되는 타입)은 필드 구조를 바꾸지 않는다 — `endType`/`endDate`는 그대로 두고 "누가 그 값을 채우는가"만 바뀐다(사용자 입력 → 자동 유도).

**Tech Stack:** React, TypeScript, react-hook-form, Firebase Firestore, Vitest, Testing Library, styled-components

## Global Constraints

- 모든 명령은 `client/` 디렉토리에서 실행한다 (`cd client && ...`)
- 파일명: `camelCase.tsx`/`camelCase.ts`
- 스타일: styled-components, 기존 `recurrence.styles.tsx` 패턴 재사용
- 커밋 메시지는 한글, 현재 작업 브랜치(`feature/today-recurring-badge`)에서 계속 커밋한다 — 새 브랜치를 만들지 않는다
- `client/src/features/todo/utils/recurrence.ts`의 `generateRecurringDueDates`, `getDefaultHorizonEnd`는 **수정하지 않는다** (시그니처와 내부 로직 모두 변경 없음 — 순수 함수라 호출부만 바뀌면 충분)
- `RecurrenceRule` 타입(`todo.type.ts`)은 **수정하지 않는다** — `endType`/`endDate` 필드 그대로 유지
- `server/`, `docker-compose.yml`은 건드리지 않는다

---

### Task 1: `RecurrenceFormValue` 타입 축소 + `recurrenceTransform.ts` 재작성

**Files:**
- Modify: `client/src/features/todo/components/recurrence/recurrenceFields.types.ts`
- Modify: `client/src/features/todo/components/recurrence/recurrenceTransform.ts`
- Test: `client/src/features/todo/components/recurrence/__tests__/recurrenceTransform.test.ts`

**Interfaces:**
- Produces: `RecurrenceFormValue { type: "daily" | "weekly" | "monthly"; weekdays?: number[] }` (endType/endDate 제거됨)
- Produces: `toRecurrenceRule(value: RecurrenceFormValue | null, dueAt: string | null): RecurrenceRule | null` — 시그니처에 `dueAt` 파라미터 추가
- Produces: `toFormValue(recurrence: RecurrenceRule | null): RecurrenceFormValue | null` — endType/endDate를 결과에서 제외

- [ ] **Step 1: `RecurrenceFormValue` 타입에서 `endType`/`endDate` 제거**

`client/src/features/todo/components/recurrence/recurrenceFields.types.ts` 전체를 다음으로 교체:

```ts
interface RecurrenceFormValue {
  type: "daily" | "weekly" | "monthly";
  weekdays?: number[]; // 0=일 ~ 6=토, type==="weekly"일 때만 사용, 최소 1개
}

export type { RecurrenceFormValue };
```

- [ ] **Step 2: 실패하는 테스트 작성 (`toRecurrenceRule`의 새 시그니처 + dueAt 유도 로직)**

`client/src/features/todo/components/recurrence/__tests__/recurrenceTransform.test.ts` 전체를 다음으로 교체:

```ts
import { describe, it, expect } from "vitest";
import { toFormValue, toRecurrenceRule } from "../recurrenceTransform";

describe("toRecurrenceRule", () => {
  it("daily 타입일 때 weekdays 키를 아예 포함하지 않는다", () => {
    const result = toRecurrenceRule({ type: "daily" }, null);
    expect(result).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result, "weekdays")).toBe(false);
  });

  it("monthly 타입일 때도 weekdays 키를 포함하지 않는다", () => {
    const result = toRecurrenceRule({ type: "monthly" }, null);
    expect(Object.prototype.hasOwnProperty.call(result, "weekdays")).toBe(false);
  });

  it("weekly 타입일 때는 weekdays 배열을 그대로 포함한다", () => {
    const result = toRecurrenceRule({ type: "weekly", weekdays: [1, 3, 5] }, null);
    expect(result?.weekdays).toEqual([1, 3, 5]);
  });

  it("dueAt이 없으면 endType을 indefinite로, endDate를 null로 유도한다", () => {
    const result = toRecurrenceRule({ type: "daily" }, null);
    expect(result?.endType).toBe("indefinite");
    expect(result?.endDate).toBeNull();
  });

  it("dueAt이 있으면 endType을 untilDate로, endDate를 그 날짜(YYYY-MM-DD)로 유도한다", () => {
    const result = toRecurrenceRule({ type: "daily" }, "2026-07-10T18:00");
    expect(result?.endType).toBe("untilDate");
    expect(result?.endDate).toBe("2026-07-10");
  });

  it("value가 null이면 null을 반환한다", () => {
    expect(toRecurrenceRule(null, "2026-07-10T18:00")).toBeNull();
  });
});

describe("toFormValue", () => {
  it("recurrence가 null이면 null을 반환한다", () => {
    expect(toFormValue(null)).toBeNull();
  });

  it("endType/endDate는 폼 값에 포함하지 않는다 (파생값이라 폼 상태로 들지 않음)", () => {
    const result = toFormValue({ type: "daily", endType: "untilDate", endDate: "2026-07-10" });
    expect(result?.type).toBe("daily");
    expect(Object.prototype.hasOwnProperty.call(result, "endType")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, "endDate")).toBe(false);
  });
});
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd client && npx vitest run src/features/todo/components/recurrence/__tests__/recurrenceTransform.test.ts`
Expected: FAIL — `toRecurrenceRule({ type: "daily" }, null)` 같은 2-argument 호출이 기존 구현(1-argument)과 타입/런타임 불일치로 실패하거나, `result?.endType`이 기존 구현에서는 `value.endType`(undefined)을 그대로 반영해 기대값과 다르게 나옴

- [ ] **Step 4: `recurrenceTransform.ts` 재작성**

`client/src/features/todo/components/recurrence/recurrenceTransform.ts` 전체를 다음으로 교체:

```ts
import { toDateKeyFromISO } from "@/shared/utils/date";
import type { RecurrenceRule } from "../../types";
import type { RecurrenceFormValue } from "./recurrenceFields.types";

// RecurrenceRule -> RecurrenceFormValue. endType/endDate는 이제 사용자 입력이 아니라
// todo.dueAt으로부터 자동 유도되는 파생값이라(toRecurrenceRule 참고) 폼 상태로 들고
//있지 않는다.
export const toFormValue = (recurrence: RecurrenceRule | null): RecurrenceFormValue | null =>
  recurrence
    ? {
        type: recurrence.type,
        weekdays: recurrence.weekdays,
      }
    : null;

/**
 * dueAt(할 일 자체의 마감일시)이 있으면 "그 날짜까지 반복"(untilDate)으로, 없으면
 * 무기한(indefinite)으로 종료 조건을 자동 유도한다. 반복의 시작 앵커는 dueAt이 아니라
 * startAt이므로(todoApi.ts의 generateRecurringDueDates 호출부에서 처리), 여기서는
 * 종료 조건 계산만 담당한다.
 */
export const toRecurrenceRule = (
  value: RecurrenceFormValue | null,
  dueAt: string | null,
): RecurrenceRule | null => {
  if (!value) return null;

  // weekdays는 optional 필드다. Firestore는 undefined 값을 가진 필드(중첩 객체 내부
  // 포함)를 만나면 즉시 에러를 던지므로, "값 없음"은 `undefined` 대입이 아니라
  // 키 자체를 생략하는 방식으로 표현해야 한다.
  const base = {
    type: value.type,
    endType: dueAt ? ("untilDate" as const) : ("indefinite" as const),
    endDate: dueAt ? toDateKeyFromISO(dueAt) : null,
  };

  return value.type === "weekly" ? { ...base, weekdays: value.weekdays } : base;
};
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd client && npx vitest run src/features/todo/components/recurrence/__tests__/recurrenceTransform.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: 커밋**

```bash
git add client/src/features/todo/components/recurrence/recurrenceFields.types.ts client/src/features/todo/components/recurrence/recurrenceTransform.ts client/src/features/todo/components/recurrence/__tests__/recurrenceTransform.test.ts
git commit -m "$(cat <<'EOF'
refactor: 반복 종료 조건을 마감일 유무로 자동 유도

종료 조건(무기한/특정 날짜까지)을 사용자가 직접 고르지 않고, todo의
마감일(dueAt) 입력 여부로부터 자동 유도하도록 변경. RecurrenceFormValue에서
endType/endDate 제거.
EOF
)"
```

---

### Task 2: `recurrenceValidation.ts` — 앵커 필드를 startAt으로 전환

**Files:**
- Modify: `client/src/features/todo/components/recurrence/recurrenceValidation.ts`
- Test: `client/src/features/todo/components/recurrence/__tests__/recurrenceValidation.test.ts`

**Interfaces:**
- Consumes: `RecurrenceFormValue` from Task 1 (더 이상 `endType`/`endDate` 없음)
- Produces: `getRecurrenceValidationError(value: RecurrenceFormValue | null, startAt: string | null, dueAt: string | null): string | null` — 시그니처가 `(value, dueAt)`에서 `(value, startAt, dueAt)`로 변경됨. 이후 Task 3, 5, 6이 이 새 시그니처를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/todo/components/recurrence/__tests__/recurrenceValidation.test.ts` 전체를 다음으로 교체:

```ts
import { describe, it, expect } from "vitest";
import { getRecurrenceValidationError } from "../recurrenceValidation";
import type { RecurrenceFormValue } from "../recurrenceFields.types";

describe("getRecurrenceValidationError", () => {
  const dailyValue: RecurrenceFormValue = { type: "daily" };

  it("반복이 꺼져있으면(value===null) 항상 유효하다", () => {
    expect(getRecurrenceValidationError(null, null, null)).toBeNull();
  });

  it("weekly인데 요일을 하나도 선택하지 않으면 에러를 반환한다", () => {
    const value: RecurrenceFormValue = { type: "weekly", weekdays: [] };
    expect(getRecurrenceValidationError(value, "2026-07-10T09:00", null)).toBe(
      "요일을 하나 이상 선택해주세요",
    );
  });

  it("weekly이고 요일이 하나 이상이면 유효하다", () => {
    const value: RecurrenceFormValue = { type: "weekly", weekdays: [1] };
    expect(getRecurrenceValidationError(value, "2026-07-10T09:00", null)).toBeNull();
  });

  it("dueAt이 없으면(무기한) startAt만으로 유효하다", () => {
    expect(getRecurrenceValidationError(dailyValue, "2026-07-10T09:00", null)).toBeNull();
  });

  it("마감일시와 시작일시가 같은 날짜면 유효하다(에러 없음)", () => {
    const startAt = "2026-07-10T09:00";
    const dueAt = "2026-07-10T18:00"; // 같은 날 저녁
    expect(getRecurrenceValidationError(dailyValue, startAt, dueAt)).toBeNull();
  });

  it("마감일이 시작일보다 실제로 하루 전이면 에러를 반환한다", () => {
    const startAt = "2026-07-10T09:00";
    const dueAt = "2026-07-09T18:00";
    expect(getRecurrenceValidationError(dailyValue, startAt, dueAt)).toBe(
      "마감일은 시작일과 같거나 이후여야 합니다",
    );
  });

  it("마감일이 시작일보다 하루 뒤면 유효하다", () => {
    const startAt = "2026-07-10T09:00";
    const dueAt = "2026-07-11T00:00";
    expect(getRecurrenceValidationError(dailyValue, startAt, dueAt)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd client && npx vitest run src/features/todo/components/recurrence/__tests__/recurrenceValidation.test.ts`
Expected: FAIL — 기존 함수는 2개 인자(`value, dueAt`)만 받아 3번째 인자(`dueAt`)가 무시되고, "마감일은 시작일과 같거나 이후여야 합니다" 에러 문구 자체가 존재하지 않음

- [ ] **Step 3: `recurrenceValidation.ts` 재작성**

`client/src/features/todo/components/recurrence/recurrenceValidation.ts` 전체를 다음으로 교체:

```ts
import { WEEKDAY_REQUIRED_ERROR } from "./weekdayConstants";
import type { RecurrenceFormValue } from "./recurrenceFields.types";

/** datetime-local 문자열에서 로컬 달력 날짜만 "YYYY-MM-DD" 키로 뽑아낸다. */
function toLocalDateKey(dateTimeStr: string): string | null {
  const d = new Date(dateTimeStr);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 반복 규칙 입력값의 유효성을 검사한다. todoForm/todoDetail의 onSubmit에서 제출 차단
 * 판단에 재사용하기 위해 컴포넌트 파일과 분리했다.
 *
 * startAt은 반복의 시작 앵커, dueAt은 있으면 반복의 종료일 역할을 한다
 * (recurrenceTransform.ts의 toRecurrenceRule 참고). 두 값이 모두 있을 때 dueAt이
 * startAt보다 이전이면 반복 발생일이 하나도 생성되지 않는 상태가 되므로 제출을 막는다.
 */
export function getRecurrenceValidationError(
  value: RecurrenceFormValue | null,
  startAt: string | null,
  dueAt: string | null,
): string | null {
  if (!value) return null;

  if (value.type === "weekly" && (value.weekdays?.length ?? 0) === 0) {
    return WEEKDAY_REQUIRED_ERROR;
  }

  if (startAt && dueAt) {
    const startDateKey = toLocalDateKey(startAt);
    const dueDateKey = toLocalDateKey(dueAt);
    if (startDateKey && dueDateKey && dueDateKey < startDateKey) {
      return "마감일은 시작일과 같거나 이후여야 합니다";
    }
  }

  return null;
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd client && npx vitest run src/features/todo/components/recurrence/__tests__/recurrenceValidation.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/components/recurrence/recurrenceValidation.ts client/src/features/todo/components/recurrence/__tests__/recurrenceValidation.test.ts
git commit -m "$(cat <<'EOF'
refactor: 반복 유효성 검사를 시작일 기준으로 전환

종료일 vs 마감일 비교 대신, 마감일이 시작일(반복 앵커)보다 이전이면 막도록 변경.
EOF
)"
```

---

### Task 3: `recurrenceFields.tsx` — "종료 조건" 수동 UI 제거, `startAt` 기반으로 전환

**Files:**
- Modify: `client/src/features/todo/components/recurrence/recurrenceFields.tsx`
- Modify: `client/src/features/todo/components/recurrence/recurrence.styles.tsx`
- Test: `client/src/features/todo/components/recurrence/__tests__/recurrenceFields.test.tsx` (신규)

**Interfaces:**
- Consumes: `getRecurrenceValidationError(value, startAt, dueAt)` from Task 2
- Produces: `RecurrenceFieldsProps { disabled: boolean; disabledReason?: "hasChildren" | "noStartAt"; startAt: string | null; dueAt: string | null; value: RecurrenceFormValue | null; onChange: (value: RecurrenceFormValue | null) => void }` — Task 5, 6이 이 새 props 형태로 호출한다

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

`client/src/features/todo/components/recurrence/__tests__/recurrenceFields.test.tsx` 신규 생성:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RecurrenceFields from "../recurrenceFields";
import type { RecurrenceFormValue } from "../recurrenceFields.types";

describe("RecurrenceFields", () => {
  it("시작일시가 없으면 반복 체크박스가 비활성화되고 안내 문구를 보여준다", () => {
    render(
      <RecurrenceFields
        disabled
        disabledReason="noStartAt"
        startAt={null}
        dueAt={null}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(
      screen.getByText("반복 설정은 시작일시를 입력해야 사용할 수 있습니다"),
    ).toBeInTheDocument();
  });

  it("마감일시가 없으면 무기한으로 반복된다는 요약을 보여준다", () => {
    const value: RecurrenceFormValue = { type: "daily" };
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-07T09:00"
        dueAt={null}
        value={value}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/무기한으로 반복됩니다/)).toBeInTheDocument();
  });

  it("마감일시가 있으면 그 날짜까지 반복된다는 요약을 보여준다", () => {
    const value: RecurrenceFormValue = { type: "daily" };
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-07T09:00"
        dueAt="2026-07-10T18:00"
        value={value}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/2026-07-10까지 반복됩니다/)).toBeInTheDocument();
  });

  it("마감일이 시작일보다 이전이면 에러 문구를 보여준다", () => {
    const value: RecurrenceFormValue = { type: "daily" };
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-10T09:00"
        dueAt="2026-07-07T18:00"
        value={value}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText("마감일은 시작일과 같거나 이후여야 합니다"),
    ).toBeInTheDocument();
  });

  it("매월 반복일 때 '일(day)'은 마감일이 아니라 시작일 기준으로 안내한다", () => {
    const value: RecurrenceFormValue = { type: "monthly" };
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-15T09:00"
        dueAt={null}
        value={value}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("매월 15일에 반복됩니다 (시작일시 기준)")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd client && npx vitest run src/features/todo/components/recurrence/__tests__/recurrenceFields.test.tsx`
Expected: FAIL — 컴포넌트가 `startAt` prop을 받지 않고(`dueAt`만 받음), disabledReason 문구가 "마감일시" 기준이며, "반복 범위" 요약 텍스트 자체가 없음

- [ ] **Step 3: `recurrence.styles.tsx`에서 `EndOptionRow` 제거**

`client/src/features/todo/components/recurrence/recurrence.styles.tsx`에서 다음 블록(89~121행)을 삭제:

```tsx
export const EndOptionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  font-size: 13px;
  color: ${colors.text.primary};

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  input[type="radio"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  input[type="date"] {
    padding: 6px 8px;
    font-size: 13px;
    border: 1px solid ${colors.border.secondary};
    border-radius: ${radius.sm};
    outline: none;

    &:focus {
      border-color: ${colors.brand.secondary};
    }
  }
`;

```

(다른 export들과 `radius` import는 `DayChipCircle`, `ErrorText` 등에서 계속 쓰이므로 그대로 둔다.)

- [ ] **Step 4: `recurrenceFields.tsx` 재작성**

`client/src/features/todo/components/recurrence/recurrenceFields.tsx` 전체를 다음으로 교체:

```tsx
import { useId } from "react";
import { Info } from "lucide-react";
import { toDateKeyFromISO } from "@/shared/utils/date";
import RecurrenceTypeTabs from "./recurrenceTypeTabs";
import WeekdayPicker from "./weekdayPicker";
import { WEEKDAY_REQUIRED_ERROR } from "./weekdayConstants";
import { getRecurrenceValidationError } from "./recurrenceValidation";
import type { RecurrenceFormValue } from "./recurrenceFields.types";
import {
  RecurrenceSection,
  CheckboxLabel,
  DisabledHint,
  RecurrenceDetailPanel,
  RecurrenceDetailContent,
  FieldGroup,
  FieldLabel,
  MonthlyInfo,
  InfoLine,
  MonthlySubCaption,
  ErrorText,
} from "./recurrence.styles";

interface RecurrenceFieldsProps {
  disabled: boolean; // 하위 할 일 존재 또는 startAt 미입력 시 true
  disabledReason?: "hasChildren" | "noStartAt";
  startAt: string | null; // 반복 시작 앵커. 매월 반복 시 '일(day)' 유도에도 사용
  dueAt: string | null; // 있으면 반복 종료일(마지막 발생일) 역할
  value: RecurrenceFormValue | null; // null = 반복 OFF
  onChange: (value: RecurrenceFormValue | null) => void;
}

const RecurrenceFields = ({
  disabled,
  disabledReason,
  startAt,
  dueAt,
  value,
  onChange,
}: RecurrenceFieldsProps) => {
  const hintId = useId();
  const checked = value !== null;

  const weekdayError = value?.type === "weekly" && (value.weekdays?.length ?? 0) === 0;
  const validationError = getRecurrenceValidationError(value, startAt, dueAt);
  const rangeError = validationError && validationError !== WEEKDAY_REQUIRED_ERROR ? validationError : null;

  const handleToggle = () => {
    if (disabled) return;
    onChange(checked ? null : { type: "daily" });
  };

  const handleTypeChange = (type: RecurrenceFormValue["type"]) => {
    if (!value) return;
    onChange({
      ...value,
      type,
      weekdays: type === "weekly" ? value.weekdays ?? [] : undefined,
    });
  };

  const handleWeekdayToggle = (day: number) => {
    if (!value) return;
    const current = value.weekdays ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    onChange({ ...value, weekdays: next });
  };

  const startDay = startAt ? new Date(startAt).getDate() : null;
  const isPanelOpen = checked && !disabled;

  return (
    <RecurrenceSection>
      <CheckboxLabel $disabled={disabled}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={handleToggle}
          aria-describedby={disabled ? hintId : undefined}
        />
        이 할 일을 반복합니다
      </CheckboxLabel>

      {disabled && (
        <DisabledHint id={hintId}>
          <Info size={14} aria-hidden="true" />
          <span>
            {disabledReason === "hasChildren"
              ? "하위 할 일이 있는 항목은 반복을 설정할 수 없습니다"
              : "반복 설정은 시작일시를 입력해야 사용할 수 있습니다"}
          </span>
        </DisabledHint>
      )}

      <RecurrenceDetailPanel $isOpen={isPanelOpen}>
        <RecurrenceDetailContent id="recurrence-detail-panel">
          {value && (
            <>
              <FieldGroup>
                <FieldLabel>반복 주기</FieldLabel>
                <RecurrenceTypeTabs value={value.type} onChange={handleTypeChange} />
              </FieldGroup>

              {value.type === "weekly" && (
                <FieldGroup>
                  <FieldLabel>반복 요일</FieldLabel>
                  <WeekdayPicker
                    selected={value.weekdays ?? []}
                    onToggle={handleWeekdayToggle}
                    error={weekdayError}
                  />
                </FieldGroup>
              )}

              {value.type === "monthly" && startDay !== null && (
                <MonthlyInfo>
                  <InfoLine>
                    <Info size={14} aria-hidden="true" />
                    <span>매월 {startDay}일에 반복됩니다 (시작일시 기준)</span>
                  </InfoLine>
                  {startDay >= 29 && (
                    <MonthlySubCaption>
                      31일이 없는 달은 해당 월 마지막 날에 생성됩니다
                    </MonthlySubCaption>
                  )}
                </MonthlyInfo>
              )}

              <FieldGroup>
                <FieldLabel>반복 범위</FieldLabel>
                <InfoLine>
                  <Info size={14} aria-hidden="true" />
                  <span>
                    {dueAt
                      ? `${toDateKeyFromISO(dueAt)}까지 반복됩니다`
                      : "마감일시가 없으면 무기한으로 반복됩니다"}
                  </span>
                </InfoLine>
                {rangeError && <ErrorText role="alert">{rangeError}</ErrorText>}
              </FieldGroup>
            </>
          )}
        </RecurrenceDetailContent>
      </RecurrenceDetailPanel>
    </RecurrenceSection>
  );
};

export default RecurrenceFields;
export type { RecurrenceFieldsProps, RecurrenceFormValue };
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd client && npx vitest run src/features/todo/components/recurrence/__tests__/recurrenceFields.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
git add client/src/features/todo/components/recurrence/recurrenceFields.tsx client/src/features/todo/components/recurrence/recurrence.styles.tsx client/src/features/todo/components/recurrence/__tests__/recurrenceFields.test.tsx
git commit -m "$(cat <<'EOF'
refactor: 반복 설정 UI에서 종료 조건 라디오 버튼 제거

시작일 필수 + 마감일(있으면 종료일 역할) 요약 문구로 대체. 매월 반복의
'일(day)' 안내도 마감일 대신 시작일 기준으로 변경.
EOF
)"
```

---

### Task 4: `todoApi.ts` — 반복 생성/수정 앵커를 `startAt`으로 전환

**Files:**
- Modify: `client/src/features/todo/api/todoApi.ts`
- Test: `client/src/features/todo/api/__tests__/recurringTodoApi.test.ts`

**Interfaces:**
- Consumes: `generateRecurringDueDates` (변경 없음, `client/src/features/todo/utils/recurrence.ts`)
- Produces: `createRecurringTodo`/`editRecurringSeries`는 이제 입력 `Todo`의 `startAt` 필드가 필수(없으면 throw), `dueAt`은 선택(무기한 반복 허용)

- [ ] **Step 1: 실패하는 테스트로 가드 조건 변경 명세**

`client/src/features/todo/api/__tests__/recurringTodoApi.test.ts`에서 `describe("createRecurringTodo", ...)` 블록(130~203행)을 다음으로 교체:

```ts
describe("createRecurringTodo", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
  });

  it("생성할 dueDates 개수만큼 Todo 문서를 batch 생성하고 동일한 recurrenceId를 부여한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../todoApi");

    const todo = makeTodo({
      startAt: "2026-07-10T09:00:00",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-13T00:00:00");

    const created = await createRecurringTodo(todo, horizonEnd);

    expect(created).toHaveLength(4); // 7/10, 11, 12, 13
    const recurrenceIds = new Set(created.map((t) => t.recurrenceId));
    expect(recurrenceIds.size).toBe(1);
    expect(batch.set).toHaveBeenCalledTimes(4);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    created.forEach((t) => {
      expect(t.status).toBe("todo");
    });
  });

  it("생성한 인스턴스 문서 ID는 {recurrenceId}_{날짜} 형태로 결정론적이다 (멀티탭/멀티기기 동시 생성 시 중복 방지)", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../todoApi");

    const todo = makeTodo({
      startAt: "2026-07-10T09:00:00",
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-12T00:00:00");

    const created = await createRecurringTodo(todo, horizonEnd);

    // recurrenceId는 createRecurringTodoImpl 내부에서 doc(todosRef).id로 딱 한 번 생성되므로
    // 테스트 환경(autoIdCounter)에서는 "auto-1"로 고정된다.
    expect(created.map((t) => t.id)).toEqual([
      "auto-1_2026-07-10",
      "auto-1_2026-07-11",
      "auto-1_2026-07-12",
    ]);
  });

  it("recurrence가 없으면 에러를 던진다", async () => {
    const { createRecurringTodo } = await import("../todoApi");
    const todo = makeTodo({ startAt: "2026-07-10T09:00:00", recurrence: null });

    await expect(createRecurringTodo(todo, new Date("2026-07-13T00:00:00"))).rejects.toThrow();
  });

  it("startAt이 없으면 에러를 던진다", async () => {
    const { createRecurringTodo } = await import("../todoApi");
    const todo = makeTodo({ startAt: null, recurrence: dailyRule });

    await expect(createRecurringTodo(todo, new Date("2026-07-13T00:00:00"))).rejects.toThrow();
  });

  it("dueAt이 없어도(무기한 반복) 정상적으로 생성된다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce(
      emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
    );
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

    const { createRecurringTodo } = await import("../todoApi");

    const todo = makeTodo({
      startAt: "2026-07-10T09:00:00",
      dueAt: null,
      recurrence: dailyRule,
    });
    const horizonEnd = new Date("2026-07-12T00:00:00");

    const created = await createRecurringTodo(todo, horizonEnd);

    expect(created.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: `editRecurringSeries`가 쓰는 `seriesTodo`에 `startAt` 추가 (11곳)**

같은 파일에서, `recurrence: dailyRule`을 유지한 채(반복 OFF로 전환하지 않는) `editRecurringSeries(seriesTodo, ...)`를 호출하는 아래 11개 지점 각각에서, `seriesTodo`를 만드는 `makeTodo({...})` 호출에 `dueAt`과 **같은 값**으로 `startAt` 필드를 추가한다(반복 앵커가 dueAt에서 startAt으로 바뀌었으므로, 기존에 dueAt이 앵커 역할을 하던 자리를 startAt이 대신 채워야 가드를 통과한다):

1. `"done 인스턴스는 삭제하지 않고 필드도 건드리지 않는다"` 테스트의 `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "done-1",
      status: "done",
      startAt: "2026-07-01T09:00:00",
      dueAt: "2026-07-01T09:00:00",
      title: "새 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

2. `"doing 인스턴스는 삭제하지 않는다"` 테스트의 `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      startAt: "2026-07-05T09:00:00",
      dueAt: "2026-07-05T09:00:00",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

3. `"지난 미완료(overdue) todo 인스턴스는 삭제하지 않는다"` 테스트의 `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "overdue-1",
      status: "todo",
      startAt: pastIso,
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

4. `"overdue 인스턴스 자신을 수정하면..."` 테스트의 `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "overdue-1",
      status: "todo",
      description: "수정된 설명",
      startAt: pastIso,
      dueAt: pastIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

5. `"미래 todo 인스턴스는 삭제 후 새 규칙으로 재생성한다"` 테스트의 `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      startAt: futureIso,
      dueAt: futureIso,
      title: "바뀐 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

6. `"재생성되는 인스턴스 문서 ID도 {recurrenceId}_{날짜} 형태로 결정론적이다"` 테스트의 `seriesTodo` (이 테스트는 첫 생성 인스턴스의 날짜 키를 직접 검증하므로, `startAt`이 정확히 `futureIso`와 같아야 함):
```ts
    const seriesTodo = makeTodo({
      id: "future-1",
      status: "todo",
      startAt: futureIso,
      dueAt: futureIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

7. `"doing 인스턴스 자체를 수정해도 같은 날짜에 새 todo 인스턴스를 중복 생성하지 않는다"` 테스트의 `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      startAt: todayIso,
      dueAt: todayIso,
      title: "수정된 제목",
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

8. `"doing 인스턴스 자신을 수정하면..."` (두 번째, description 수정하는 테스트) `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      description: "수정된 설명",
      startAt: todayIso,
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

9. `"보존된 인스턴스를 직접 갱신할 때도 userId는..."` 테스트의 `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "doing-1",
      status: "doing",
      userId: "다른-사용자-id",
      startAt: todayIso,
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

10. `"보존된 인스턴스의 마감일을 다른 보존된 인스턴스가 이미 점유한 날짜로 바꾸면 에러를 던진다"` 테스트의 `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "overdue-1",
      status: "todo",
      startAt: todayIso,
      dueAt: todayIso,
      recurrenceId: "series-1",
      recurrence: dailyRule,
    });
```

11. `"extend 실행 중 editRecurringSeries를 호출하면..."` (동시 실행 describe 블록) 테스트의 `seriesTodo`:
```ts
    const seriesTodo = makeTodo({
      id: "future-edit-1",
      status: "todo",
      startAt: "2026-07-12T09:00:00",
      dueAt: "2026-07-12T09:00:00",
      title: "수정된 제목",
      recurrenceId: "series-edit",
      recurrence: dailyRule,
    });
```

(`recurrence: null`로 반복을 끄는 테스트 — `"반복 OFF 전환(recurrence: null) 시..."` — 와 `recurrenceId`만 검사하는 `"recurrenceId가 없으면 에러를 던진다"` 테스트, 그리고 `extendIndefiniteRecurringSeries` describe 블록 전체는 startAt 가드가 적용되지 않으므로 **수정하지 않는다**.)

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd client && npx vitest run src/features/todo/api/__tests__/recurringTodoApi.test.ts`
Expected: FAIL — 현재 구현은 여전히 `todo.dueAt`/`seriesTodo.dueAt`을 가드/앵커로 쓰므로 "startAt이 없으면 에러를 던진다" 테스트가 통과하지 않고(에러가 안 던져짐), "dueAt이 없어도 정상 생성된다" 테스트도 현재는 dueAt 누락 시 에러가 나서 실패함

- [ ] **Step 4: `todoApi.ts`의 `createRecurringTodoImpl` 수정**

`client/src/features/todo/api/todoApi.ts`에서 (약 305~317행):

```ts
  if (!todo.dueAt) {
    throw new Error("반복 할 일은 dueAt(만료일시)이 필요합니다");
  }

  const now = new Date().toISOString();
  const recurrenceId = doc(todosRef).id;
  const dueDates = generateRecurringDueDates(todo.dueAt, todo.recurrence, horizonEnd);
```

를 다음으로 교체:

```ts
  if (!todo.startAt) {
    throw new Error("반복 할 일은 startAt(시작일시)이 필요합니다");
  }

  const now = new Date().toISOString();
  const recurrenceId = doc(todosRef).id;
  const dueDates = generateRecurringDueDates(todo.startAt, todo.recurrence, horizonEnd);
```

- [ ] **Step 5: `todoApi.ts`의 `editRecurringSeriesImpl` 수정**

같은 파일에서 (약 468~479행):

```ts
  if (newRecurrence) {
    if (!seriesTodo.dueAt) {
      throw new Error("반복 할 일은 dueAt(만료일시)이 필요합니다");
    }

    // 오늘 이후 첫 유효 발생일부터 horizonEnd까지 새 규칙으로 재생성하되, 이미 보존된
    // 인스턴스가 점유한 날짜는 건너뛴다.
    const dueDates = generateRecurringDueDates(
      seriesTodo.dueAt,
      newRecurrence,
      horizonEnd,
    )
```

를 다음으로 교체:

```ts
  if (newRecurrence) {
    if (!seriesTodo.startAt) {
      throw new Error("반복 할 일은 startAt(시작일시)이 필요합니다");
    }

    // 오늘 이후 첫 유효 발생일부터 horizonEnd까지 새 규칙으로 재생성하되, 이미 보존된
    // 인스턴스가 점유한 날짜는 건너뛴다.
    const dueDates = generateRecurringDueDates(
      seriesTodo.startAt,
      newRecurrence,
      horizonEnd,
    )
```

(`extendIndefiniteRecurringSeriesImpl`은 `latest.dueAt`을 "마지막 인스턴스 다음 발생일부터 이어서 생성"하는 연속 앵커로 쓰고 있어 이번 변경과 무관하다 — **수정하지 않는다**.)

- [ ] **Step 6: 테스트 실행해서 통과 확인**

Run: `cd client && npx vitest run src/features/todo/api/__tests__/recurringTodoApi.test.ts`
Expected: PASS (전체 — createRecurringTodo 5개, editRecurringSeries 11개, deleteRecurringSeries 2개, extendIndefiniteRecurringSeries 6개, 동시 실행 1개)

- [ ] **Step 7: 전체 todo 관련 테스트 스위트 실행 (회귀 확인)**

Run: `cd client && npx vitest run src/features/todo`
Expected: PASS 전체

- [ ] **Step 8: 커밋**

```bash
git add client/src/features/todo/api/todoApi.ts client/src/features/todo/api/__tests__/recurringTodoApi.test.ts
git commit -m "$(cat <<'EOF'
fix: 반복 할 일 인스턴스 생성 앵커를 dueAt에서 startAt으로 변경

마감일이 반복 "시작" 기준으로 쓰이던 게 이름과 반대로 동작해 혼란을 유발했다.
이제 시작일이 필수 앵커, 마감일은 선택(있으면 반복 종료일).
EOF
)"
```

---

### Task 5: `todoForm.tsx` — startAt 기반 반복 활성화로 전환

**Files:**
- Modify: `client/src/features/todo/components/todoForm/todoForm.tsx`

**Interfaces:**
- Consumes: `RecurrenceFields` props from Task 3, `getRecurrenceValidationError`/`toRecurrenceRule` from Task 1/2

- [ ] **Step 1: `dueAtWatch`/`recurrenceValue`/`recurrenceDisabled` 블록 수정**

`client/src/features/todo/components/todoForm/todoForm.tsx`에서 (약 69~96행):

```ts
  const dueAtWatch = watch("dueAt");
```

를 다음으로 교체:

```ts
  const startAtWatch = watch("startAt");
  const dueAtWatch = watch("dueAt");
```

그리고 (같은 파일, 이어지는 블록):

```ts
  // 4-2절: dueAt이 지워지면(반복이 이미 켜진 상태) 반복 체크박스 강제 OFF + value 리셋
  useEffect(() => {
    if (!dueAtWatch && recurrenceValue !== null) {
      setRecurrenceValue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueAtWatch]);

  const recurrenceDisabled = hasChildren || !dueAtWatch;
  const recurrenceDisabledReason: "hasChildren" | "noDueAt" | undefined = hasChildren
    ? "hasChildren"
    : !dueAtWatch
      ? "noDueAt"
      : undefined;
```

를 다음으로 교체:

```ts
  // 반복의 시작 앵커는 startAt이다. startAt이 지워지면(반복이 이미 켜진 상태) 반복
  // 체크박스를 강제 OFF하고 value를 리셋한다.
  useEffect(() => {
    if (!startAtWatch && recurrenceValue !== null) {
      setRecurrenceValue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAtWatch]);

  const recurrenceDisabled = hasChildren || !startAtWatch;
  const recurrenceDisabledReason: "hasChildren" | "noStartAt" | undefined = hasChildren
    ? "hasChildren"
    : !startAtWatch
      ? "noStartAt"
      : undefined;
```

- [ ] **Step 2: `onSubmit`의 유효성 검사 + dueAtIso 계산 + 두 `toRecurrenceRule` 호출부 수정**

같은 파일에서:

```ts
  const onSubmit = (data: TodoFormData) => {
    if (showRecurrenceSection) {
      const validationError = getRecurrenceValidationError(recurrenceValue, dueAtWatch ?? null);
      if (validationError) {
        toast.error("입력 확인", validationError);
        return;
      }
    }

    if (todo) {
      const newRecurrence = showRecurrenceSection ? toRecurrenceRule(recurrenceValue) : null;
      const updatedFields = {
        ...todo,
        ...data,
        // datetime-local input의 값을 ISO string으로 변환
        startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
        dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
        recurrence: newRecurrence,
      } as Todo;
```

를 다음으로 교체:

```ts
  const onSubmit = (data: TodoFormData) => {
    if (showRecurrenceSection) {
      const validationError = getRecurrenceValidationError(
        recurrenceValue,
        startAtWatch ?? null,
        dueAtWatch ?? null,
      );
      if (validationError) {
        toast.error("입력 확인", validationError);
        return;
      }
    }

    // datetime-local input의 값을 ISO string으로 변환 (반복 종료일 유도에도 재사용)
    const dueAtIso = data.dueAt ? new Date(data.dueAt).toISOString() : null;

    if (todo) {
      const newRecurrence = showRecurrenceSection
        ? toRecurrenceRule(recurrenceValue, dueAtIso)
        : null;
      const updatedFields = {
        ...todo,
        ...data,
        startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
        dueAt: dueAtIso,
        recurrence: newRecurrence,
      } as Todo;
```

그리고 같은 함수 안, 신규 반복 할 일 생성 분기(`else if (recurrenceValue)`):

```ts
    } else if (recurrenceValue) {
      // 반복 설정된 신규 할 일 생성 — 확인 모달 없음(4-4절)
      const newRecurrence = toRecurrenceRule(recurrenceValue) as RecurrenceRule;
      useCreateRecurringTodo.mutate(
        {
          ...data,
          startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
          dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
          recurrence: newRecurrence,
        } as Todo,
```

를 다음으로 교체:

```ts
    } else if (recurrenceValue) {
      // 반복 설정된 신규 할 일 생성 — 확인 모달 없음(4-4절)
      const newRecurrence = toRecurrenceRule(recurrenceValue, dueAtIso) as RecurrenceRule;
      useCreateRecurringTodo.mutate(
        {
          ...data,
          startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
          dueAt: dueAtIso,
          recurrence: newRecurrence,
        } as Todo,
```

- [ ] **Step 3: JSX의 `RecurrenceFields` 사용부에 `startAt` prop 추가**

같은 파일에서:

```tsx
            {showRecurrenceSection && (
              <RecurrenceFields
                disabled={recurrenceDisabled}
                disabledReason={recurrenceDisabledReason}
                dueAt={dueAtWatch ?? null}
                value={recurrenceValue}
                onChange={setRecurrenceValue}
              />
            )}
```

를 다음으로 교체:

```tsx
            {showRecurrenceSection && (
              <RecurrenceFields
                disabled={recurrenceDisabled}
                disabledReason={recurrenceDisabledReason}
                startAt={startAtWatch ?? null}
                dueAt={dueAtWatch ?? null}
                value={recurrenceValue}
                onChange={setRecurrenceValue}
              />
            )}
```

- [ ] **Step 4: 타입체크 + lint**

Run: `cd client && npx tsc -b && npx eslint src/features/todo/components/todoForm/todoForm.tsx`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/components/todoForm/todoForm.tsx
git commit -m "$(cat <<'EOF'
refactor: todoForm의 반복 활성화 조건을 startAt 기준으로 변경
EOF
)"
```

---

### Task 6: `todoDetail.tsx` — Task 5와 동일한 전환 적용

**Files:**
- Modify: `client/src/features/todo/components/todoDetail/todoDetail.tsx`

**Interfaces:**
- Consumes: 동일하게 `RecurrenceFields`(Task 3), `getRecurrenceValidationError`/`toRecurrenceRule`(Task 1/2)

- [ ] **Step 1: `dueAtWatch`/`recurrenceDisabled` 블록 수정**

`client/src/features/todo/components/todoDetail/todoDetail.tsx`에서 (약 88행):

```ts
  const dueAtWatch = watch("dueAt");
```

를 다음으로 교체:

```ts
  const startAtWatch = watch("startAt");
  const dueAtWatch = watch("dueAt");
```

그리고 (약 105~118행):

```ts
  // 4-2절: dueAt이 지워지면(반복이 이미 켜진 상태) 반복 체크박스 강제 OFF + value 리셋
  useEffect(() => {
    if (!dueAtWatch && recurrenceValue !== null) {
      setRecurrenceValue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueAtWatch]);

  const recurrenceDisabled = hasChildren || !dueAtWatch;
  const recurrenceDisabledReason: "hasChildren" | "noDueAt" | undefined = hasChildren
    ? "hasChildren"
    : !dueAtWatch
      ? "noDueAt"
      : undefined;
```

를 다음으로 교체:

```ts
  // 반복의 시작 앵커는 startAt이다. startAt이 지워지면(반복이 이미 켜진 상태) 반복
  // 체크박스를 강제 OFF하고 value를 리셋한다.
  useEffect(() => {
    if (!startAtWatch && recurrenceValue !== null) {
      setRecurrenceValue(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAtWatch]);

  const recurrenceDisabled = hasChildren || !startAtWatch;
  const recurrenceDisabledReason: "hasChildren" | "noStartAt" | undefined = hasChildren
    ? "hasChildren"
    : !startAtWatch
      ? "noStartAt"
      : undefined;
```

- [ ] **Step 2: `onSubmit` 수정**

같은 파일에서 (약 151~167행):

```ts
  const onSubmit = (data: TodoFormData) => {
    if (!todo) return;

    const validationError = getRecurrenceValidationError(recurrenceValue, dueAtWatch ?? null);
    if (validationError) {
      toast.error("입력 확인", validationError);
      return;
    }

    const newRecurrence = toRecurrenceRule(recurrenceValue);
    const updatedFields = {
      ...todo,
      ...data,
      startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
      dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : null,
      recurrence: newRecurrence,
    } as Todo;
```

를 다음으로 교체:

```ts
  const onSubmit = (data: TodoFormData) => {
    if (!todo) return;

    const validationError = getRecurrenceValidationError(
      recurrenceValue,
      startAtWatch ?? null,
      dueAtWatch ?? null,
    );
    if (validationError) {
      toast.error("입력 확인", validationError);
      return;
    }

    const dueAtIso = data.dueAt ? new Date(data.dueAt).toISOString() : null;
    const newRecurrence = toRecurrenceRule(recurrenceValue, dueAtIso);
    const updatedFields = {
      ...todo,
      ...data,
      startAt: data.startAt ? new Date(data.startAt).toISOString() : null,
      dueAt: dueAtIso,
      recurrence: newRecurrence,
    } as Todo;
```

- [ ] **Step 3: JSX의 `RecurrenceFields` 사용부에 `startAt` prop 추가**

같은 파일에서:

```tsx
            {!todo.parentId && (
              <FormGroup>
                <RecurrenceFields
                  disabled={recurrenceDisabled}
                  disabledReason={recurrenceDisabledReason}
                  dueAt={dueAtWatch ?? null}
                  value={recurrenceValue}
                  onChange={setRecurrenceValue}
                />
              </FormGroup>
            )}
```

를 다음으로 교체:

```tsx
            {!todo.parentId && (
              <FormGroup>
                <RecurrenceFields
                  disabled={recurrenceDisabled}
                  disabledReason={recurrenceDisabledReason}
                  startAt={startAtWatch ?? null}
                  dueAt={dueAtWatch ?? null}
                  value={recurrenceValue}
                  onChange={setRecurrenceValue}
                />
              </FormGroup>
            )}
```

- [ ] **Step 4: 타입체크 + lint**

Run: `cd client && npx tsc -b && npx eslint src/features/todo/components/todoDetail/todoDetail.tsx`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/components/todoDetail/todoDetail.tsx
git commit -m "$(cat <<'EOF'
refactor: todoDetail의 반복 활성화 조건을 startAt 기준으로 변경
EOF
)"
```

---

### Task 7: `recurringTodo.spec.md` 문서 갱신

**Files:**
- Modify: `client/src/features/todo/design/recurringTodo.spec.md`

**Interfaces:** 없음 (문서 전용 작업)

- [ ] **Step 1: 0절 PM 확정 스코프 요약 표 갱신**

`client/src/features/todo/design/recurringTodo.spec.md`에서:

```
| 종료 조건 | 무기한 / 특정 종료일 (N회 반복 없음) |
```

를 다음으로 교체:

```
| 반복 앵커/종료 | 시작일(startAt)이 반복 시작 앵커(필수). 마감일(dueAt)은 선택 — 있으면 그 날짜까지, 없으면 무기한 (2026-07-07 개정: 자세한 배경은 `docs/superpowers/specs/2026-07-07-recurring-anchor-field-redesign-design.md` 참고) |
```

- [ ] **Step 2: 1-1절 와이어프레임에서 "종료 조건" 라디오 블록 제거**

같은 파일에서 "반복 ON — 매일" 와이어프레임 블록:

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

를 다음으로 교체:

```
│  ☑ 이 할 일을 반복합니다              │
│  ┌────────────────────────────────┐  │
│  │ 반복 주기                        │  │
│  │ [ 매일 ]  매주    매월           │  │  ← RecurrenceTypeTabs (세그먼트 탭)
│  │                                  │  │
│  │ 반복 범위                        │  │
│  │ ℹ 마감일시가 없으면 무기한으로     │  │  ← dueAt 유무로 자동 유도, 읽기 전용
│  │   반복됩니다                     │  │
│  └────────────────────────────────┘  │
```

같은 파일에서 "반복 ON — 매주" 와이어프레임 블록의 종료 조건 부분:

```
│  │ 종료 조건                        │  │
│  │ ○ 무기한                         │  │
│  │ ● 특정 날짜까지  [2026-09-30]    │  │
│  └────────────────────────────────┘  │
```

를 다음으로 교체:

```
│  │ 반복 범위                        │  │
│  │ ℹ 2026-09-30까지 반복됩니다      │  │  ← 마감일시(dueAt)로부터 자동 유도
│  └────────────────────────────────┘  │
```

같은 파일에서 "반복 ON — 매월" 와이어프레임 블록:

```
│  │ ℹ 매월 10일에 반복됩니다           │  │  ← 만료일시의 '일(day)'에서 자동 유도, 읽기 전용 안내
│  │   (마감일시 기준)                 │  │
│  │                                  │  │
│  │ 종료 조건                        │  │
│  │ ● 무기한                         │  │
│  │ ○ 특정 날짜까지  [date picker]  │  │
│  └────────────────────────────────┘  │
```

를 다음으로 교체:

```
│  │ ℹ 매월 10일에 반복됩니다           │  │  ← 시작일시의 '일(day)'에서 자동 유도, 읽기 전용 안내
│  │   (시작일시 기준)                 │  │
│  │                                  │  │
│  │ 반복 범위                        │  │
│  │ ℹ 마감일시가 없으면 무기한으로     │  │
│  │   반복됩니다                     │  │
│  └────────────────────────────────┘  │
```

같은 파일에서 "차단 상태 A" 블록:

```
**차단 상태 A — 만료일시 미입력 시 (반복 토글 자체를 켤 수 없음)**

```
│  ├ 만료일시  [ 입력되지 않음 ]         │
│  │                                       │
│  ☐ 이 할 일을 반복합니다  (비활성)     │  ← disabled, 회색 처리
│  ℹ 반복 설정은 마감일시를 입력해야      │
│    사용할 수 있습니다                   │
```

를 다음으로 교체:

```
**차단 상태 A — 시작일시 미입력 시 (반복 토글 자체를 켤 수 없음)**

```
│  ├ 시작일시  [ 입력되지 않음 ]         │
│  │                                       │
│  ☐ 이 할 일을 반복합니다  (비활성)     │  ← disabled, 회색 처리
│  ℹ 반복 설정은 시작일시를 입력해야      │
│    사용할 수 있습니다                   │
```

- [ ] **Step 3: 3-2절 `RecurrenceFormValue` 타입 정의 갱신**

같은 파일에서:

```ts
interface RecurrenceFormValue {
  type: "daily" | "weekly" | "monthly";
  weekdays?: number[];            // 0=일 ~ 6=토, type==="weekly"일 때만 사용, 최소 1개
  endType: "indefinite" | "untilDate";
  endDate?: string;               // endType==="untilDate"일 때만 사용
}
```

를 다음으로 교체:

```ts
interface RecurrenceFormValue {
  type: "daily" | "weekly" | "monthly";
  weekdays?: number[];            // 0=일 ~ 6=토, type==="weekly"일 때만 사용, 최소 1개
}
```

바로 아래 줄에 있는 `RecurrenceFieldsProps`의 `dueAt: string | null; // 매월 반복 시...` 필드도:

```ts
interface RecurrenceFieldsProps {
  disabled: boolean;              // 하위 할 일 존재 또는 dueAt 미입력 시 true
  disabledReason?: "hasChildren" | "noDueAt";
  dueAt: string | null;           // 매월 반복 시 '일(day)' 유도에 사용
  value: RecurrenceFormValue | null; // null = 반복 OFF
  onChange: (value: RecurrenceFormValue | null) => void;
}
```

를 다음으로 교체:

```ts
interface RecurrenceFieldsProps {
  disabled: boolean;              // 하위 할 일 존재 또는 startAt 미입력 시 true
  disabledReason?: "hasChildren" | "noStartAt";
  startAt: string | null;         // 반복 시작 앵커. 매월 반복 시 '일(day)' 유도에도 사용
  dueAt: string | null;           // 있으면 반복 종료일(마지막 발생일) 역할
  value: RecurrenceFormValue | null; // null = 반복 OFF
  onChange: (value: RecurrenceFormValue | null) => void;
}
```

- [ ] **Step 4: 4-2절, 4-3절 제목/본문의 "마감일시" → "시작일시" 정정**

같은 파일에서 4-2절 제목:

```
### 4-2. 반복 토글 활성 전제조건 — 만료일시 필수
```

를 다음으로 교체:

```
### 4-2. 반복 토글 활성 전제조건 — 시작일시 필수
```

같은 절 본문 전체:

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

를 다음으로 교체:

```
사용자가 시작일시를 입력하지 않은 상태
  → 반복 체크박스 disabled + "반복 설정은 시작일시를 입력해야 사용할 수 있습니다"
  ↓
사용자가 시작일시 입력
  → 반복 체크박스 활성화 (즉시, 리렌더 시)
  ↓
사용자가 시작일시를 다시 지움 (반복이 이미 켜진 상태에서)
  → 반복 체크박스 강제 OFF + value를 null로 리셋 + 안내 문구 재노출
  → (조용히 무시하지 않고 명시적으로 리셋 — 반복 규칙만 남고 기준일이 없는 비정상 상태 방지)
```

4-3절 본문에서:

```
반복 주기 = 매월 선택
  ↓
dueAt의 day 값을 읽어 "매월 {day}일에 반복됩니다 (마감일시 기준)" 읽기 전용 안내 렌더링
  ↓
사용자가 만료일시를 변경
  ↓
안내 문구의 {day} 값도 즉시 재계산되어 갱신
```

를 다음으로 교체:

```
반복 주기 = 매월 선택
  ↓
startAt의 day 값을 읽어 "매월 {day}일에 반복됩니다 (시작일시 기준)" 읽기 전용 안내 렌더링
  ↓
사용자가 시작일시를 변경
  ↓
안내 문구의 {day} 값도 즉시 재계산되어 갱신
```

- [ ] **Step 5: 커밋**

```bash
git add client/src/features/todo/design/recurringTodo.spec.md
git commit -m "$(cat <<'EOF'
docs: 반복 할 일 스펙 문서를 시작일/마감일 재정의에 맞게 갱신
EOF
)"
```

---

### Task 8: 전체 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 린트**

Run: `cd client && npm run lint`
Expected: 에러 없음 (경고는 `useResize.ts`의 기존 `react-hooks/exhaustive-deps` 1건만 — 이번 변경과 무관하므로 허용)

- [ ] **Step 2: 타입체크 + 빌드**

Run: `cd client && npm run build`
Expected: `tsc -b && vite build` 정상 완료

- [ ] **Step 3: 전체 유닛 테스트**

Run: `cd client && npm run test`
Expected: 전체 PASS (Task 1~4에서 추가/수정한 테스트 포함)

- [ ] **Step 4: 수동 스모크 테스트 (개발 서버)**

Run: `cd client && npm run dev` (이미 5173 포트에 떠 있다면 생략)

브라우저에서 새 할 일 만들기 폼을 열어:
1. 시작일시를 입력하지 않은 상태 → "이 할 일을 반복합니다" 체크박스가 비활성화되고 "반복 설정은 시작일시를 입력해야 사용할 수 있습니다" 문구가 보이는지 확인
2. 시작일시=오늘, 마감일시=3일 뒤로 입력하고 "매일" 반복 체크 → "반복 범위" 영역에 "OOOO-MM-DD까지 반복됩니다" 문구가 보이는지 확인, 저장 후 오늘/내일/모레/글피(3일 뒤) 총 4개 인스턴스가 생성되는지(칸반 또는 오늘 화면에서) 확인
3. 마감일시를 비운 채(무기한) 저장 → "마감일시가 없으면 무기한으로 반복됩니다" 문구가 보이는지, 저장 후 정상 생성되는지 확인
4. 마감일시를 시작일시보다 이전 날짜로 입력 → "마감일은 시작일과 같거나 이후여야 합니다" 에러로 제출이 막히는지 확인

- [ ] **Step 5: 최종 커밋 (있다면 스모크 테스트 중 발견한 사소한 수정만)**

스모크 테스트에서 문제가 없다면 커밋할 변경 사항 없음 — 이 단계는 문제 발견 시에만 해당.
