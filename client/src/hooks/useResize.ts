import { useRef, useState, useEffect } from "react";

const useResize = (direction: "row" | "column", initialRatio: number = 0.5) => {
  const [firstRatio, setFirstRatio] = useState(initialRatio);
  const [secondRatio, setSecondRatio] = useState(initialRatio);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const size = direction === "row" ? rect.width : rect.height;
    if (size === 0) return;
    const pos =
      direction === "row" ? e.clientX - rect.left : e.clientY - rect.top;
    const raw = pos / size;

    setFirstRatio(Math.max(0.1, Math.min(0.9, raw)));
    setSecondRatio(1 - Math.max(0.1, Math.min(0.9, raw)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return {
    firstRatio,
    secondRatio,
    isDragging,
    containerRef,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
  };
};
export default useResize;
