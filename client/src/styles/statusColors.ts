// @tododo/core 루트(index.js)는 firestore를 쓰는 todoApi까지 재수출해 초기 번들에
// firebase를 끌어들인다. statusColors는 거의 모든 컴포넌트가 import하므로 firebase-free한
// theme 서브패스로 직접 가져온다.
import { lightTokens, toCssVarRefs } from "@tododo/core/dist/theme/index.js";

/** 상태 색. 값·대비 근거는 packages/core/src/theme 참고. */
export const statusColors = toCssVarRefs(lightTokens).status;

export type Status = keyof typeof statusColors;

export const getStatusColor = (status: Status) => statusColors[status];
