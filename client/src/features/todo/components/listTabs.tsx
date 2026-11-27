import { useRef, type KeyboardEvent } from "react";
import type { ListTab } from "../hooks";
import { TabList, TabButton } from "./completedList.styles";

const TABS: readonly { value: ListTab; label: string }[] = [
  { value: "active", label: "진행 중" },
  { value: "done", label: "완료" },
];

interface ListTabsProps {
  tab: ListTab;
  onChange: (tab: ListTab) => void;
}

/** 목록 상단 `진행 중 | 완료` 전환. 방향키로도 옮길 수 있다(WAI-ARIA tabs 패턴). */
export const ListTabs = ({ tab, onChange }: ListTabsProps) => {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const nextIndex = (index + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    onChange(TABS[nextIndex].value);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <TabList role="tablist" aria-label="할 일 목록 보기">
      {TABS.map(({ value, label }, index) => {
        const selected = tab === value;
        return (
          <TabButton
            key={value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {label}
          </TabButton>
        );
      })}
    </TabList>
  );
};
