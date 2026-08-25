// client/src/styles/colors.ts 값을 그대로 복제한다. RN 번들러는 client/ 밖의 파일을
// import할 수 없어(각기 다른 빌드 대상) 값만 동기화하고, 원본이 바뀌면 이 파일도
// 함께 갱신해야 한다.
export const colors = {
  brand: {
    /**
     * 진한 브랜드색. 글자·아이콘, 흰 글자를 얹는 솔리드 배경, 포커스 신호에 쓴다.
     * 흰색과 6.20:1이라 어느 방향으로도 AA를 만족한다.
     */
    strong: "#0F6E56",
    /** strong을 쓴 요소의 pressed 상태(웹의 hover/active에 대응). 흰색과 9.69:1. */
    strongHover: "#0A4E3C",
    /**
     * 밝은 브랜드색. **흰색 또는 회색 배경 위에, 글자를 얹지 않는** 장식에만 쓴다.
     * 흰색과 3.39:1이라 글자에 쓰면 AA 미달이고, 연한 초록 배경 위에 놓으면
     * 비텍스트 3:1마저 깨진다.
     */
    fill: "#1D9E75",
    /** 연한 배경. 선택된 칩, 포커스된 입력 필드 배경 등. */
    tint: "#E8F5EF",
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
