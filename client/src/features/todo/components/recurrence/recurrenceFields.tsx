import { useId } from "react";
import { Info } from "lucide-react";
import RecurrenceTypeTabs from "./recurrenceTypeTabs";
import WeekdayPicker from "./weekdayPicker";
import { WEEKDAY_REQUIRED_ERROR } from "./weekdayConstants";
import { getRecurrenceValidationError } from "./recurrenceValidation";
import { DEFAULT_RECURRENCE_FORM_VALUE } from "./recurrenceTransform";
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
  TabList,
  TabButton,
  EndDateInput,
} from "./recurrence.styles";

const END_TYPES: { type: RecurrenceFormValue["endType"]; label: string }[] = [
  { type: "indefinite", label: "없음" },
  { type: "untilDate", label: "날짜 지정" },
];

interface RecurrenceFieldsProps {
  disabled: boolean; // 하위 할 일 존재 또는 startAt 미입력 시 true
  disabledReason?: "hasChildren" | "noStartAt";
  startAt: string | null; // 반복 시작 앵커. 매월 반복 시 '일(day)' 유도에도 사용
  value: RecurrenceFormValue | null; // null = 반복 OFF
  onChange: (value: RecurrenceFormValue | null) => void;
}

const RecurrenceFields = ({
  disabled,
  disabledReason,
  startAt,
  value,
  onChange,
}: RecurrenceFieldsProps) => {
  const hintId = useId();
  const checked = value !== null;

  const weekdayError = value?.type === "weekly" && (value.weekdays?.length ?? 0) === 0;
  const validationError = getRecurrenceValidationError(value, startAt);
  const rangeError =
    validationError && validationError !== WEEKDAY_REQUIRED_ERROR ? validationError : null;

  // 종료 조건은 폼 값에서 온다(dueAt에서 유도하지 않는다).
  const rangeText =
    value?.endType === "untilDate" && value.endDate
      ? `${value.endDate}까지 반복됩니다`
      : "계속 반복됩니다";

  const handleToggle = () => {
    if (disabled) return;
    onChange(checked ? null : { ...DEFAULT_RECURRENCE_FORM_VALUE });
  };

  const handleTypeChange = (type: RecurrenceFormValue["type"]) => {
    if (!value) return;
    onChange({
      ...value,
      type,
      weekdays: type === "weekly" ? value.weekdays ?? [] : undefined,
    });
  };

  const handleEndTypeChange = (endType: RecurrenceFormValue["endType"]) => {
    if (!value || value.endType === endType) return;
    // 「날짜 지정」의 초기 날짜는 빈 칸(추측 값을 넣지 않는다). 「없음」으로 돌아가면 날짜를 비운다.
    onChange({ ...value, endType, endDate: null });
  };

  const handleEndDateChange = (endDate: string) => {
    if (!value) return;
    onChange({ ...value, endDate: endDate || null });
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
                <FieldLabel>반복 종료</FieldLabel>
                <TabList role="tablist" aria-label="반복 종료">
                  {END_TYPES.map(({ type, label }) => (
                    <TabButton
                      key={type}
                      type="button"
                      role="tab"
                      aria-selected={value.endType === type}
                      aria-controls="recurrence-detail-panel"
                      $active={value.endType === type}
                      onClick={() => handleEndTypeChange(type)}
                    >
                      {label}
                    </TabButton>
                  ))}
                </TabList>
                {value.endType === "untilDate" && (
                  <EndDateInput
                    type="date"
                    aria-label="반복 종료일"
                    value={value.endDate ?? ""}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                  />
                )}
                <InfoLine>
                  <Info size={14} aria-hidden="true" />
                  <span>{rangeText}</span>
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
