/**
 * planItemRow/planPreviewStep이 공유하는 우선순위 라벨.
 * 컴포넌트 파일(.tsx)에 상수를 같이 export하면 react-refresh/only-export-components에
 * 걸리므로 별도 파일로 분리한다.
 */
export const PRIORITY_LABELS = { high: "높음", medium: "보통", low: "낮음" } as const;
