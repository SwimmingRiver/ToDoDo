import { lightTokens, toCssVarRefs } from "@tododo/core";

/** "마감 임박" 2단계 강조 색(Today 화면). danger는 colors.danger와 같은 변수를 가리킨다. */
export const urgencyColors = toCssVarRefs(lightTokens).urgency;
