import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";

/** onLayout으로 컨테이너 너비를 측정한다. 측정 전 첫 렌더는 0. */
export const useMeasuredWidth = () => {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);
  return { width, onLayout };
};
