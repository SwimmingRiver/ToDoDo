/**
 * WCAG 2.1 대비비. 색 라이브러리 대신 직접 둔다 — 공식이 짧고 팔레트 검증에만 쓴다.
 * `#RRGGBB`만 받는다(팔레트가 전부 이 형식이다. `scrim`은 rgba라 대비 검증 대상이 아니다).
 */
const relativeLuminance = (hex) => {
    const channels = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
export const contrast = (a, b) => {
    const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
};
