import type { ThemeTokens } from "./tokens";

// 뉴트럴 그레이 + 층 간 명도차: 바탕 #121212 → 카드 #1E1E1E → 모달 #262626.
// 다크에선 그림자가 거의 안 보이므로 층 구분을 명도로 한다.
const danger = { main: "#FF7A78", subtle: "#5C2B2B", background: "#3A1C1C", text: "#FF8E8C" };

export const darkTokens: ThemeTokens = {
  brand: {
    /** 어두운 바탕에서 진한 초록은 묻히므로 밝은 초록으로 반전. 카드 위 8.1:1. */
    strong: "#3CCB9A",
    /** strong과 1.28:1 — hover 인지 가능. */
    strongHover: "#6EE0B8",
    fill: "#2FB386",
    tint: "#16352B",
    /** 밝은 초록 솔리드 위 거의 검정 글자. strong 위 8.1:1. */
    onStrong: "#06231A",
  },
  danger,
  background: { primary: "#121212", secondary: "#181818" },
  surface: { raised: "#1E1E1E", overlay: "#262626" },
  text: { primary: "#E8EAED", secondary: "#A8ADB3", tertiary: "#7C8187" },
  border: { secondary: "#3A3A3A", tertiary: "#2C2C2C", danger: "#FF7A78" },
  status: {
    todo: { main: "#C4C9D0", light: "#2A2D31", border: "#5B6168" },
    doing: { main: "#4FD1A5", light: "#123A2E", border: "#2A8F6D" },
    done: { main: "#B79CFF", light: "#2A2145", border: "#7C5FD6" },
  },
  urgency: {
    soon: { main: "#FB923C", background: "#3A2412", text: "#FDBA74" },
    danger: { main: danger.main, background: danger.background, text: danger.text },
  },
  scrim: "rgba(0, 0, 0, 0.6)",
};
