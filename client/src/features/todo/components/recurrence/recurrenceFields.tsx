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
