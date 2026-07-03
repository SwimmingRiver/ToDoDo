import { TabList, TabButton } from "./recurrence.styles";

interface RecurrenceTypeTabsProps {
  value: "daily" | "weekly" | "monthly";
  onChange: (type: "daily" | "weekly" | "monthly") => void;
}

const TYPES = ["daily", "weekly", "monthly"] as const;

const TYPE_LABELS: Record<(typeof TYPES)[number], string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
};

const RecurrenceTypeTabs = ({ value, onChange }: RecurrenceTypeTabsProps) => (
  <TabList role="tablist" aria-label="반복 주기">
    {TYPES.map((type) => (
      <TabButton
        key={type}
        type="button"
        role="tab"
        aria-selected={value === type}
        aria-controls="recurrence-detail-panel"
        $active={value === type}
        onClick={() => onChange(type)}
      >
        {TYPE_LABELS[type]}
      </TabButton>
    ))}
  </TabList>
);

export default RecurrenceTypeTabs;
export type { RecurrenceTypeTabsProps };
