import { useEffect, useRef, useState } from "react";

/**
 * ref를 단 요소의 콘텐츠 너비를 ResizeObserver로 추적한다. SVG 차트가 컨테이너
 * 폭에 맞춰 기하를 다시 계산하도록 숫자 너비가 필요해서 만든 훅 —
 * dashboard/components/calendar.tsx가 인라인으로 쓰던 것과 같은 패턴.
 * 첫 렌더에서는 0이므로 호출부는 width 0일 때 차트를 그리지 않아야 한다.
 */
const useElementWidth = <T extends HTMLElement = HTMLDivElement>() => {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    setWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
};

export default useElementWidth;
