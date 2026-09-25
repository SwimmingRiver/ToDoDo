import type { Plugin } from "vite";
// vite.config에서 로드된다. @tododo/core 루트는 firebase까지 끌어오고, dist는 확장자 없는
// 상대 import라 Node ESM이 직접 못 읽는다. 그래서 core의 theme 소스를 상대 경로로 가져와
// Vite의 config 번들러(esbuild)가 함께 번들하게 한다. 런타임(client 코드)은 여전히 dist를 쓰며,
// 둘이 같은 src에서 나오는지는 Task 12의 dist 최신성 검사가 보장한다.
import { buildThemeCss, lightTokens, darkTokens } from "../../../packages/core/src/theme/index";

const ID = "virtual:theme.css";
const RESOLVED = `\0${ID}`;

/**
 * core 팔레트로 :root / [data-theme="dark"] CSS 변수 선언을 만들어 가상 CSS 모듈로 제공한다.
 * 빌드 시 추출 CSS에 포함되므로 JS 실행 전(첫 페인트 전)에 변수가 존재한다.
 */
export const themeCssPlugin = (): Plugin => ({
  name: "tododo-theme-css",
  resolveId: (id) => (id === ID ? RESOLVED : undefined),
  load: (id) => (id === RESOLVED ? buildThemeCss(lightTokens, darkTokens) : undefined),
});
