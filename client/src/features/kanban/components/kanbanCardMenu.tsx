import { useState, useCallback } from "react";
import { MoreVertical } from "lucide-react";
import { BottomSheet, type BottomSheetOption } from "@/shared";
import { statusMeta, ALL_STATUSES } from "@/styles/statusMeta";
import { MenuButton } from "./kanbanCardMenu.styles";
import type { Status } from "./kanbanColumn";

interface KanbanCardMenuProps {
  status: Status;
  onSelect: (status: Status) => void;
}

// 모바일 칸반 카드용 상태 변경 액션시트. 태블릿 이하 뷰포트에서는 컬럼이 1개만
// 렌더링되어 dnd-kit 드래그로 상태를 옮길 수 없기 때문에(kanbanBoard.tsx), 카드
// 자체에 "..." 버튼을 노출해 바텀시트에서 상태를 고를 수 있게 한다.
const KanbanCardMenu = ({ status, onSelect }: KanbanCardMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const options: BottomSheetOption<Status>[] = ALL_STATUSES.filter(
    (candidate) => candidate !== status,
  ).map((candidate) => ({
    value: candidate,
    label: statusMeta[candidate].label,
    icon: statusMeta[candidate].icon,
  }));

  const handleOpen = (event: React.MouseEvent) => {
    // 카드 자체의 onClick(상세 페이지 이동)으로 버블링되는 것을 막는다.
    event.stopPropagation();
    setIsOpen(true);
  };

  // onClose가 매 렌더마다 새로 생성되면 BottomSheet 내부의 handleClose와 그에
  // 의존하는 ESC keydown 이펙트가 렌더마다 재실행된다. setIsOpen은 안정적인
  // setter이므로 빈 deps로 고정한다.
  const handleClose = useCallback(() => setIsOpen(false), []);

  // dnd-kit의 드래그 리스너(onPointerDown/onTouchStart)가 카드 루트 엘리먼트에
  // 걸려 있어, 버튼을 누르는 시점에 드래그가 함께 시작되지 않도록 전파를 막는다.
  const stopDndPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <>
      <MenuButton
        type="button"
        aria-label="상태 변경 메뉴 열기"
        onClick={handleOpen}
        onPointerDown={stopDndPropagation}
        onTouchStart={stopDndPropagation}
      >
        <MoreVertical size={18} />
      </MenuButton>

      <BottomSheet
        isOpen={isOpen}
        onClose={handleClose}
        title="상태 변경"
        options={options}
        onSelect={onSelect}
      />
    </>
  );
};

export default KanbanCardMenu;
