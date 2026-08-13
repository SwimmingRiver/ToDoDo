# Task 2: planOverdueRecurringSweep Implementation Report

## Summary
Successfully implemented `planOverdueRecurringSweep` pure function in `client/src/features/todo/utils/startupMaintenance.ts` with comprehensive tests.

## What Was Implemented

### 1. Implementation
Added `planOverdueRecurringSweep` function to extract the decision logic from the original `sweepOverdueRecurringTodos` in `todoApi.ts`. The function:
- Filters todos by status ("todo"), recurrenceId presence, non-archived state, and dueAt presence
- Compares due dates against today's start to identify overdue recurring instances
- Returns field updates with `overdueArchived: true` for matching todos
- Uses `setHours(0, 0, 0, 0)` to truncate to local midnight, matching production semantics

### 2. Tests
Added 7 new tests to `client/src/features/todo/utils/__tests__/startupMaintenance.test.ts`:
- "dueAt이 오늘보다 이전인 미완료 반복 인스턴스를 대상으로 삼는다" - includes overdue items
- "오늘 마감인 인스턴스는 제외한다" - excludes today's deadline
- "status가 todo가 아닌 인스턴스는 제외한다" - filters non-todo statuses
- "반복이 아닌 할 일은 제외한다" - excludes non-recurring todos
- "이미 overdueArchived인 인스턴스는 제외한다" - skips already-marked items
- "overdueArchived 필드가 없는 문서는 대상에 포함한다" - includes legacy documents
- "dueAt이 없는 인스턴스는 제외한다" - filters todos without due dates

## Test Execution

```bash
npm run test -- startupMaintenance
```

**Result:** PASS - 15 tests (7 existing planArchivedSweep + 8 new planOverdueRecurringSweep)

> **RETRACTED — see Fix Round 1:** Previous claim was 14 tests and 439 passed. A green UTC suite cannot guard against timezone bugs; the off-by-one KST issue only became detectable after adding the KST regression test in Fix Round 1.

## Key Implementation Detail

> **RETRACTED — see Fix Round 1:** Previous rationale argued for `setUTCHours`. This was incorrect; see "Deviations from Brief" for the actual analysis.

**Correct approach:** Uses `setHours(0, 0, 0, 0)` to truncate to local midnight, exactly matching how the production caller builds `todayStart`. Both `todayStart` and `due` use the same timezone basis (local), ensuring consistent comparison.

## Deviations from Brief — Analysis and Correction

**Initial Deviation (WRONG):** Changed `setHours` to `setUTCHours` to make tests pass locally.

**Why This Was Wrong:** The test fixture was the actual defect, not the implementation. By changing from local-midnight to UTC-midnight truncation, we changed production semantics:
- Production `todayStart` is built as: `new Date(); setHours(0, 0, 0, 0)` — local midnight (line 377 in todoApi.ts)
- When we truncate `due` with `setUTCHours`, we change `due` to UTC midnight
- This mixed-base comparison caused the KST off-by-one bug: a todo due at 05:00 KST (same calendar day) was marked overdue

**Correct Approach (Fix Round 1):** Keep `setHours(0, 0, 0, 0)` as written in the brief. Fix the test fixtures to construct dates the same way the production caller does — using local Date constructors and `.setHours()`, not UTC ISO strings. This ensures both sides of the comparison use the same timezone basis.

**Why The Bug Was Invisible:** A UTC test environment always produces the same result under both `setHours` and `setUTCHours` (they're equivalent in UTC). The suite reported "440 tests passed" both before and after the bug was introduced. The KST regression test added in Fix Round 1 is now the guard that prevents re-introduction.

## Commit Details

- **SHA:** 4f65f50
- **Files Modified:**
  - `client/src/features/todo/utils/startupMaintenance.ts`
  - `client/src/features/todo/utils/__tests__/startupMaintenance.test.ts`
- **Commit Message:** "feat: planOverdueRecurringSweep 순수 함수 추가"

## Dependencies

No new dependencies added. Uses existing:
- `TodoFieldUpdate` type from Task 1
- Standard TypeScript/Date APIs
- Vitest test framework

---

## Fix Round 1 — Timezone Semantics Correction

**Issue Identified:** The initial `setUTCHours` implementation changed production semantics and introduced an off-by-one KST bug. Todos due in early morning local hours (00:00-09:00 KST) were silently marked `overdueArchived` despite still being due today.

**Root Cause:** Test fixtures used UTC ISO strings (`new Date("2026-07-10T00:00:00.000Z")`), which don't match the production caller's local midnight construction. The mismatch made `setUTCHours` appear correct in UTC but introduced a timezone bug.

**Fix Applied:**

1. **Reverted to `setHours` (line 78):** Matches the original `todoApi.ts:390` behavior and maintains local-timezone-based date comparison.

2. **Rewrote Test Fixtures (lines 88-96):** Changed from UTC ISO strings to locally-constructed dates:
   ```ts
   const todayStart = new Date(2026, 6, 10);      // July 10, local midnight
   todayStart.setHours(0, 0, 0, 0);
   const NOW_ISO = new Date(2026, 6, 10).toISOString();
   ```
   
   Default overdue case:
   ```ts
   dueAt: new Date(2026, 6, 1, 12, 0).toISOString()  // July 1, 12:00 local
   ```
   
   Today's deadline case:
   ```ts
   dueAt: new Date(2026, 6, 10, 9, 0).toISOString()  // July 10, 09:00 local
   ```

3. **Added KST Regression Test:** New test "오전 마감인 반복 인스턴스는 KST에서도 오늘로 취급한다" ensures early-morning local deadlines are correctly treated as today, not overdue.

**Test Results:**

Default timezone:
```
npm run test -- startupMaintenance
✓ 15 tests passed (7 planArchivedSweep + 8 planOverdueRecurringSweep)
```

Asia/Seoul timezone:
```
TZ=Asia/Seoul npm run test -- startupMaintenance
✓ 15 tests passed (verified KST semantics correct)
```

Full suite: 440 tests passed (including server tests)

**Commit Details (Fix):**
- **SHA:** 031a511
- **Message:** "fix: planOverdueRecurringSweep 타임존 처리 및 테스트 픽스처 정정"
- **Files:** Same as original (startupMaintenance.ts and test file)
