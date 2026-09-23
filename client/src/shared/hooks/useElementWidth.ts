import { useCallback, useLayoutEffect, useState } from "react";

/**
 * ref를 단 요소의 콘텐츠 너비를 ResizeObserver로 추적한다. SVG 차트가 컨테이너
 * 폭에 맞춰 기하를 다시 계산하도록 숫자 너비가 필요해서 만든 훅 —
 * dashboard/components/calendar.tsx가 인라인으로 쓰던 것과 같은 패턴.
 * ref는 콜백 ref다: 대상 요소가 첫 렌더 이후에 마운트되거나(예: 빈 상태 →
 * 데이터 상태 전환) 교체되어도 그 시점에 다시 관찰을 시작한다. 객체 ref +
 * `useEffect([], …)` 조합은 첫 렌더에 요소가 없으면 영영 측정하지 않는다.
 * 요소가 없는 동안 width는 0이므로 호출부는 0일 때 차트를 그리지 않아야 한다.
 * 측정은 `useLayoutEffect`로 페인트 전에 수행한다 — `useEffect`를 쓰면 첫
 * 페인트 이후에 너비가 반영돼 카드가 커지는 게 눈에 보인다.
 */
const useElementWidth = <T extends HTMLElement = HTMLDivElement>() => {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  const ref = useCallback((node: T | null) => {
    setElement(node);
  }, []);

  useLayoutEffect(() => {
    if (!element) {
      setWidth(0);
      return;
    }

    setWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref, width };
};

export default useElementWidth;
