import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import {
  Overlay,
  Container,
  Handle,
  Header,
  Title,
  Content,
  OptionList,
  OptionItem,
  OptionLabel,
  CancelButton,
} from "./bottomSheet.styles";

export interface BottomSheetOption<T = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface BottomSheetProps<T = string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options?: BottomSheetOption<T>[];
  selectedValue?: T;
  onSelect?: (value: T) => void;
  children?: React.ReactNode;
}

const BottomSheet = <T extends string>({
  isOpen,
  onClose,
  title,
  options = [],
  selectedValue,
  onSelect,
  children,
}: BottomSheetProps<T>) => {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  // 언마운트 시(예: 낙관적 업데이트로 카드가 목록에서 즉시 사라지는 경우) 타이머가
  // 정리되지 않고 누수되는 것을 방지한다.
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleSelect = useCallback(
    (value: T) => {
      // 닫힘 애니메이션(200ms) 도중에는 옵션 클릭을 무시해 onSelect가 중복 호출되는
      // 것을 막는다.
      if (isClosing) return;
      onSelect?.(value);
      handleClose();
    },
    [onSelect, handleClose, isClosing]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      // BottomSheet는 createPortal로 document.body에 렌더링되지만 React 포털은
      // DOM 트리가 아닌 React 컴포넌트 트리로 이벤트가 버블링된다. stopPropagation을
      // 호출하지 않으면 배경(overlay) 클릭이 BottomSheet를 사용하는 컴포넌트의 상위
      // 요소(예: 칸반 카드의 onClick 네비게이션)까지 계속 전파된다.
      e.stopPropagation();
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  // 바텀시트 열릴 때 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <Overlay $isClosing={isClosing} onClick={handleOverlayClick}>
      <Container $isClosing={isClosing} onClick={(e) => e.stopPropagation()}>
        <Handle />
        <Header>
          <Title>{title}</Title>
        </Header>
        <Content>
          {children ? (
            children
          ) : (
            <OptionList>
              {options.map((option) => (
                <OptionItem
                  key={option.value}
                  $selected={option.value === selectedValue}
                  onClick={() => handleSelect(option.value)}
                >
                  <OptionLabel>
                    {option.icon}
                    {option.label}
                  </OptionLabel>
                  {option.value === selectedValue && <Check size={20} />}
                </OptionItem>
              ))}
            </OptionList>
          )}
        </Content>
        <CancelButton onClick={handleClose}>취소</CancelButton>
      </Container>
    </Overlay>,
    document.body
  );
};

export default BottomSheet;
