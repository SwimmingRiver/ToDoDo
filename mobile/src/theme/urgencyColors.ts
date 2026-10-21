// packages/core/src/theme/light.ts의 urgency.soon 값을 그대로 복제한다(웹 client는 이 값을
// CSS 변수로 참조한다). 원본이 바뀌면 이 파일도 함께 갱신해야 한다. danger 단계는
// colors.danger를 그대로 쓴다(웹도 같은 값).
export const urgencyColors = {
  soon: {
    main: "#F97316", // 체크박스 링
    background: "#FFEDD5",
    text: "#C2410C",
  },
} as const;
