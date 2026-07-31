import { colors } from "./colors";

/**
 * "마감 임박" 2단계 강조 색 토큰(Today 화면 전용, design/spec.md 참고).
 * `danger`는 기존 `colors.danger` 토큰을 그대로 재사용하고, `soon`은 신규 색상이다.
 * `todoListItem`/`dueTodo`의 기존 3단계 하드코딩 정리는 이번 스펙 범위 밖이라
 * 아직 이 토큰을 참조하지 않는다(후속 리팩터링 권장 사항).
 */
export const urgencyColors = {
  soon: { main: "#F97316", background: "#FFEDD5", text: "#C2410C" },
  danger: {
    main: colors.danger.main,
    background: colors.danger.background,
    text: colors.danger.text,
  },
} as const;
