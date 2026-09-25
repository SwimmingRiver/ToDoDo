const danger = { main: "#E24B4A", subtle: "#F5C2C1", background: "#FBEAEA", text: "#C53A39" };
export const lightTokens = {
    brand: {
        /** 글자·아이콘, 흰 글자를 얹는 솔리드 배경, 포커스. 흰색과 6.20:1. */
        strong: "#0F6E56",
        /** strong hover/active. 흰색과 9.69:1. */
        strongHover: "#0A4E3C",
        /** 흰/회색 배경 위, 글자를 얹지 않는 장식 전용. 흰색과 3.39:1이라 글자 금지. */
        fill: "#1D9E75",
        /** 연한 배경. 반복 배지, 활성 내비, hover 배경. */
        tint: "#E8F5EF",
        /** strong/strongHover 솔리드 위 글자. */
        onStrong: "#FFFFFF",
    },
    danger,
    background: { primary: "#FFFFFF", secondary: "#F4F5F6" },
    surface: { raised: "#FFFFFF", overlay: "#FFFFFF" },
    text: { primary: "#1A1A1A", secondary: "#5F6368", tertiary: "#9AA0A6" },
    border: { secondary: "#D1D5DB", tertiary: "#E5E7EB", danger: "#E24B4A" },
    status: {
        // main은 light 배경·흰 배경 위 텍스트로도 쓰여 AA 4.5를 만족해야 한다.
        todo: { main: "#4b5563", light: "#f3f4f6", border: "#9ca3af" },
        // brand.fill과 같은 hue 160°대 — 프로젝트 카드 "진행중" 점과 통일.
        doing: { main: "#117453", light: "#e5faf3", border: "#5ae2b5" },
        // "완료=초록" 통념과 충돌하지 않으면서 doing/todo와 뚜렷이 구분되는 보라.
        done: { main: "#6d28d9", light: "#ede9fe", border: "#a78bfa" },
    },
    urgency: {
        soon: { main: "#F97316", background: "#FFEDD5", text: "#C2410C" },
        danger: { main: danger.main, background: danger.background, text: danger.text },
    },
    scrim: "rgba(0, 0, 0, 0.4)",
};
