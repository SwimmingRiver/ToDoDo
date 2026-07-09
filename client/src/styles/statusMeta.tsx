import type { ReactNode } from "react";
import { Circle, Loader, CheckCircle } from "lucide-react";
import { statusColors, type Status } from "./statusColors";

export interface StatusMeta {
  label: string;
  icon: ReactNode;
}

// 상태값 → 라벨/아이콘(18px) 매핑. kanbanCardMenu(상태 변경 액션시트)와
// statusSelect(할 일 상세 상태 선택)에서 동일한 옵션 목록을 표시하기 위해 공유한다.
export const statusMeta: Record<Status, StatusMeta> = {
  todo: {
    label: "할 일",
    icon: <Circle size={18} color={statusColors.todo.main} />,
  },
  doing: {
    label: "진행 중",
    icon: <Loader size={18} color={statusColors.doing.main} />,
  },
  done: {
    label: "완료",
    icon: <CheckCircle size={18} color={statusColors.done.main} />,
  },
};

export const ALL_STATUSES = Object.keys(statusMeta) as Status[];
