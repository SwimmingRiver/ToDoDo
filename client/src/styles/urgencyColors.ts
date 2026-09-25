// @tododo/core 루트(index.js)는 firestore를 쓰는 todoApi까지 재수출해 초기 번들에
// firebase를 끌어들인다. urgencyColors는 거의 모든 컴포넌트가 import하므로 firebase-free한
// theme 서브패스로 직접 가져온다.
import { lightTokens, toCssVarRefs } from "@tododo/core/dist/theme/index.js";

/** "마감 임박" 2단계 강조 색(Today 화면). danger는 colors.danger와 같은 변수를 가리킨다. */
export const urgencyColors = toCssVarRefs(lightTokens).urgency;
