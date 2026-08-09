import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
import type { DetectedLink } from "@/shared";
import {
  Container,
  OpenLink,
  ToggleButton,
  TriggerLabel,
  Popover,
  PopoverLink,
  PopoverLinkText,
} from "./descriptionLinkAction.styles";

interface DescriptionLinkActionProps {
  links: DetectedLink[];
}

/**
 * 설명 라벨 행 우측에 붙는 링크 열기 액션.
 *
 * textarea는 편집기로 그대로 두고 "링크를 여는 수단"만 분리한 형태다. 본문 안에서
 * 링크를 활성화하면 편집 클릭(캐럿 배치)과 링크 클릭이 같은 좌표에서 경쟁하는데,
 * 특히 모바일에서는 문장을 고치려다 외부 사이트가 열리면서 아직 저장하지 않은
 * 제목/마감일/반복 설정까지 날아갈 수 있다. 타겟을 물리적으로 떼어 놓으면 그 충돌이
 * 구조적으로 불가능해진다.
 */
const DescriptionLinkAction = ({ links }: DescriptionLinkActionProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // 링크가 하나뿐이면 팝오버를 거칠 이유가 없다 — 바로 여는 앵커로 둔다.
  if (links.length === 1) {
    const [link] = links;
    return (
      <Container>
        <OpenLink
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          title={link.href}
        >
          <Link2 size={13} />
          <TriggerLabel>{link.label} 열기</TriggerLabel>
          <ExternalLink size={12} />
        </OpenLink>
      </Container>
    );
  }

  return (
    <Container ref={containerRef}>
      <ToggleButton
        // 이 컴포넌트는 todo-detail-form 안에 있다. type을 명시하지 않으면 submit으로
        // 동작해서 버튼을 누르는 순간 저장되고 패널이 닫힌다.
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <Link2 size={13} />
        <TriggerLabel>링크 {links.length}</TriggerLabel>
      </ToggleButton>

      {isOpen && (
        <Popover role="menu">
          {links.map((link) => (
            <PopoverLink
              key={link.href}
              role="menuitem"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              title={link.href}
              onClick={() => setIsOpen(false)}
            >
              <ExternalLink size={13} />
              <PopoverLinkText>{link.label}</PopoverLinkText>
            </PopoverLink>
          ))}
        </Popover>
      )}
    </Container>
  );
};

export default DescriptionLinkAction;
