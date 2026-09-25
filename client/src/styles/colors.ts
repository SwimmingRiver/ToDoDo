import { lightTokens, toCssVarRefs } from "@tododo/core";

/**
 * 색 토큰. 실제 값은 packages/core/src/theme/{light,dark}.ts가 원본이고, 여기선
 * `var(--…)` 참조만 내보낸다. 테마 전환은 <html data-theme>가 바꾸는 CSS 변수로
 * 일어나므로 이 객체를 import하는 컴포넌트는 리렌더 없이 색이 바뀐다.
 * 용도·대비 근거는 core 팔레트 파일 주석 참고.
 */
const { brand, danger, background, surface, text, border, scrim } = toCssVarRefs(lightTokens);

export const colors = { brand, danger, background, surface, text, border, scrim } as const;
