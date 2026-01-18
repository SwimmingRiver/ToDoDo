import { useState } from "react";
import { Circle, Loader, CheckCircle, ChevronDown } from "lucide-react";
import { BottomSheet, type BottomSheetOption } from "@/shared";
import { StatusButton, StatusIcon, StatusLabel } from "./statusSelect.styles";
import { statusColors, type Status } from "../../../../styles/statusColors";

interface StatusSelectProps {
  value: Status;
  onChange: (value: Status) => void;
}

const statusOptions: BottomSheetOption<Status>[] = [
  {
    value: "todo",
    label: "할 일",
    icon: <Circle size={18} color={statusColors.todo.main} />,
  },
  {
    value: "doing",
    label: "진행 중",
    icon: <Loader size={18} color={statusColors.doing.main} />,
  },
  {
    value: "done",
    label: "완료",
    icon: <CheckCircle size={18} color={statusColors.done.main} />,
  },
];

const getStatusInfo = (status: Status) => {
  const colors = statusColors[status];
  switch (status) {
    case "todo":
      return { label: "할 일", icon: <Circle size={16} />, color: colors.main };
    case "doing":
      return { label: "진행 중", icon: <Loader size={16} />, color: colors.main };
    case "done":
      return { label: "완료", icon: <CheckCircle size={16} />, color: colors.main };
  }
};

const StatusSelect = ({ value, onChange }: StatusSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const statusInfo = getStatusInfo(value);

  return (
    <>
      <StatusButton $color={statusInfo.color} onClick={() => setIsOpen(true)}>
        <StatusIcon $color={statusInfo.color}>{statusInfo.icon}</StatusIcon>
        <StatusLabel>{statusInfo.label}</StatusLabel>
        <ChevronDown size={14} />
      </StatusButton>

      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="상태 선택"
        options={statusOptions}
        selectedValue={value}
        onSelect={onChange}
      />
    </>
  );
};

export default StatusSelect;
