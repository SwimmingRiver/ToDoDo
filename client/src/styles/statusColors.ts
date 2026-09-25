import { lightTokens, toCssVarRefs } from "@tododo/core";

/** 상태 색. 값·대비 근거는 packages/core/src/theme 참고. */
export const statusColors = toCssVarRefs(lightTokens).status;

export type Status = keyof typeof statusColors;

export const getStatusColor = (status: Status) => statusColors[status];
