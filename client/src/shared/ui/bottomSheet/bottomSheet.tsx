import { useState, useCallback, useEffect } from "react";
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

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  const handleSelect = useCallback(
    (value: T) => {
      onSelect?.(value);
      handleClose();
    },
    [onSelect, handleClose]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
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
