export const colors = {
  brand: {
    primary: "#0F6E56",
    secondary: "#1D9E75",
    // 반복(recurring) 배지/캘린더 하이라이트 배경. 캘린더 개편 스펙(DESIGN_SPEC.md)과
    // recurringTodo.spec.md 양쪽에서 이미 동일 값을 리터럴로 참조하고 있어 토큰화한다.
    background: "#E8F5EF",
  },
  danger: {
    main: "#E24B4A",
    subtle: "#F5C2C1",
    background: "#FBEAEA",
    text: "#C53A39",
  },
  background: {
    primary: "#FFFFFF",
    secondary: "#F4F5F6",
  },
  text: {
    primary: "#1A1A1A",
    secondary: "#5F6368",
    tertiary: "#9AA0A6",
  },
  border: {
    secondary: "#D1D5DB",
    tertiary: "#E5E7EB",
    danger: "#E24B4A",
  },
} as const;
