import { useState, useEffect } from "react";
import { breakpoints } from "@/styles/breakpoints";

type BreakpointKey = keyof typeof breakpoints;

const useMediaQuery = (breakpoint: BreakpointKey): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const query = `(max-width: ${breakpoints[breakpoint]}px)`;
    const mediaQuery = window.matchMedia(query);

    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [breakpoint]);

  return matches;
};

export default useMediaQuery;
