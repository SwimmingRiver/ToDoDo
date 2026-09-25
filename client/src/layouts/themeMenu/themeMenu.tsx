import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import type { ThemePreference } from "@tododo/core/dist/theme/index.js";
import { useThemePreference } from "@/shared/theme/useThemePreference";
import { Wrapper, Trigger, Menu, Item } from "./themeMenu.styles";

const OPTIONS: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "라이트", Icon: Sun },
  { value: "system", label: "시스템", Icon: Monitor },
  { value: "dark", label: "다크", Icon: Moon },
];

const ThemeMenu = () => {
  const { preference, setPreference } = useThemePreference();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[1];

  const close = (restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    itemRefs.current[OPTIONS.indexOf(current)]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // current는 열리는 순간의 값만 필요하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const choose = (value: ThemePreference) => {
    setPreference(value);
    close(true);
  };

  // 포커스가 컴포넌트 밖으로 나가면(Tab 등) 메뉴를 닫는다. 트리거 클릭으로 다시
  // 여닫히는 흐름과 달리, 선택 없이 그냥 벗어나는 것이므로 포커스를 되돌리지 않는다.
  // relatedTarget이 여전히 wrapper 안(트리거↔항목 간 이동, 항목 클릭)이면 무시한다.
  const onWrapperBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!isOpen) return;
    const next = e.relatedTarget as Node | null;
    if (next && wrapperRef.current?.contains(next)) return;
    close(false);
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const index = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      itemRefs.current[(index + delta + OPTIONS.length) % OPTIONS.length]?.focus();
    } else if ((e.key === "Enter" || e.key === " ") && index >= 0) {
      e.preventDefault();
      choose(OPTIONS[index].value);
    }
  };

  return (
    <Wrapper ref={wrapperRef} onBlur={onWrapperBlur}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label={`화면 테마: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        <current.Icon size={18} aria-hidden="true" />
      </Trigger>
      {isOpen && (
        <Menu role="menu" aria-label="화면 테마" onKeyDown={onMenuKeyDown}>
          {OPTIONS.map(({ value, label, Icon }, i) => (
            <Item
              key={value}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="menuitemradio"
              aria-checked={value === preference}
              tabIndex={-1}
              $checked={value === preference}
              onClick={() => choose(value)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Item>
          ))}
        </Menu>
      )}
    </Wrapper>
  );
};

export default ThemeMenu;
