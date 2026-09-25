export type ThemeScheme = "light" | "dark";
export type ThemePreference = ThemeScheme | "system";
interface StatusSwatch {
    main: string;
    light: string;
    border: string;
}
interface UrgencySwatch {
    main: string;
    background: string;
    text: string;
}
/** 의미 토큰. light/dark가 같은 모양임을 타입으로 강제한다. */
export interface ThemeTokens {
    brand: {
        strong: string;
        strongHover: string;
        fill: string;
        tint: string;
        onStrong: string;
    };
    danger: {
        main: string;
        subtle: string;
        background: string;
        text: string;
    };
    background: {
        primary: string;
        secondary: string;
    };
    surface: {
        raised: string;
        overlay: string;
    };
    text: {
        primary: string;
        secondary: string;
        tertiary: string;
    };
    border: {
        secondary: string;
        tertiary: string;
        danger: string;
    };
    status: {
        todo: StatusSwatch;
        doing: StatusSwatch;
        done: StatusSwatch;
    };
    urgency: {
        soon: UrgencySwatch;
        danger: UrgencySwatch;
    };
    scrim: string;
}
/** 같은 모양, 값은 CSS 변수 참조 문자열. */
export type TokenRefs<T> = {
    [K in keyof T]: T[K] extends string ? string : TokenRefs<T[K]>;
};
export {};
