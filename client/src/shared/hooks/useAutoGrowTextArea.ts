import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * textarea 높이를 내용에 맞춰 자동으로 늘린다.
 *
 * react-hook-form의 register()가 ref 슬롯을 가져가므로 ref를 직접 넘길 수 없다.
 * 대신 setRef를 반환해 register의 ref와 합쳐 쓰도록 한다:
 *
 *   const { ref: registerRef, ...field } = register("description");
 *   <TextArea {...field} ref={(el) => { registerRef(el); setRef(el); }} />
 *
 * resize를 함께 반환하는 이유는, 값 변경 외의 사유로도 높이를 다시 재야 하기 때문이다
 * (예: 접혀 있던 "더보기" 섹션이 열리면서 textarea가 처음 레이아웃을 받는 경우).
 */
const useAutoGrowTextArea = (value?: string) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // scrollHeight는 현재 height보다 작아지지 않으므로, 줄어드는 경우도 처리하려면
    // auto로 되돌려 내용 높이를 다시 측정한 뒤 반영해야 한다.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      ref.current = el;
      // 기존 값이 있는 수정 폼에서 첫 렌더부터 맞춰 준다.
      if (el) resize();
    },
    [resize]
  );

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  return { setRef, resize };
};

export default useAutoGrowTextArea;
