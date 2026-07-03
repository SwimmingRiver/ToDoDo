import { useId } from "react";
import { Info } from "lucide-react";
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
  EndOptionRow,
  ErrorText,
} from "./recurrence.styles";

interface RecurrenceFieldsProps {
  disabled: boolean; // 하위 할 일 존재 또는 dueAt 미입력 시 true
  disabledReason?: "hasChildren" | "noDueAt";
  dueAt: string | null; // 매월 반복 시 '일(day)' 유도에 사용 (datetime-local 원본 문자열)
  value: RecurrenceFormValue | null; // null = 반복 OFF
  onChange: (value: RecurrenceFormValue | null) => void;
}

const RecurrenceFields = ({
  disabled,
  disabledReason,
  dueAt,
  value,
  onChange,
}: RecurrenceFieldsProps) => {
  const hintId = useId();
  const endTypeName = useId();
  const checked = value !== null;

  const weekdayError = value?.type === "weekly" && (value.weekdays?.length ?? 0) === 0;
  const validationError = getRecurrenceValidationError(value, dueAt);
  const endDateError = validationError && validationError !== WEEKDAY_REQUIRED_ERROR ? validationError : null;

  const handleToggle = () => {
    if (disabled) return;
    onChange(checked ? null : { type: "daily", endType: "indefinite" });
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

  const handleEndTypeChange = (endType: RecurrenceFormValue["endType"]) => {
    if (!value) return;
    onChange({
      ...value,
      endType,
      endDate: endType === "untilDate" ? value.endDate : undefined,
    });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!value) return;
    onChange({ ...value, endDate: e.target.value });
  };

  const dueDay = dueAt ? new Date(dueAt).getDate() : null;
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
              : "반복 설정은 마감일시를 입력해야 사용할 수 있습니다"}
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

              {value.type === "monthly" && dueDay !== null && (
                <MonthlyInfo>
                  <InfoLine>
                    <Info size={14} aria-hidden="true" />
                    <span>매월 {dueDay}일에 반복됩니다 (마감일시 기준)</span>
                  </InfoLine>
                  {dueDay >= 29 && (
                    <MonthlySubCaption>
                      31일이 없는 달은 해당 월 마지막 날에 생성됩니다
                    </MonthlySubCaption>
                  )}
                </MonthlyInfo>
              )}

              <FieldGroup>
                <FieldLabel>종료 조건</FieldLabel>
                <InfoLine>
                  <Info size={14} aria-hidden="true" />
                  <span>마감일시(언제 반복이 시작될지)와는 별개로, 반복을 언제까지 계속할지 정합니다</span>
                </InfoLine>
                <EndOptionRow>
                  <label>
                    <input
                      type="radio"
                      name={endTypeName}
                      checked={value.endType === "indefinite"}
                      onChange={() => handleEndTypeChange("indefinite")}
                    />
                    무기한
                  </label>
                </EndOptionRow>
                <EndOptionRow>
                  <label>
                    <input
                      type="radio"
                      name={endTypeName}
                      checked={value.endType === "untilDate"}
                      onChange={() => handleEndTypeChange("untilDate")}
                    />
                    특정 날짜까지
                  </label>
                  {value.endType === "untilDate" && (
                    <input
                      type="date"
                      value={value.endDate ?? ""}
                      onChange={handleEndDateChange}
                      aria-label="반복 종료일"
                    />
                  )}
                </EndOptionRow>
                {endDateError && <ErrorText role="alert">{endDateError}</ErrorText>}
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
