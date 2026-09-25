// @tododo/core 루트(index.js)는 firestore를 쓰는 todoApi까지 재수출해 초기 번들에
// firebase를 끌어들인다. colors는 거의 모든 컴포넌트가 import하므로 firebase-free한
// theme 서브패스로 직접 가져온다.
import { lightTokens, toCssVarRefs } from "@tododo/core/dist/theme/index.js";

/**
 * 색 토큰. 실제 값은 packages/core/src/theme/{light,dark}.ts가 원본이고, 여기선
 * `var(--…)` 참조만 내보낸다. 테마 전환은 <html data-theme>가 바꾸는 CSS 변수로
 * 일어나므로 이 객체를 import하는 컴포넌트는 리렌더 없이 색이 바뀐다.
 * 용도·대비 근거는 core 팔레트 파일 주석 참고.
 */
const { brand, danger, background, surface, text, border, scrim } = toCssVarRefs(lightTokens);

export const colors = { brand, danger, background, surface, text, border, scrim } as const;
