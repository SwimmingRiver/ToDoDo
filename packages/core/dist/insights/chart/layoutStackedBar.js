export const layoutStackedBar = ({ segments, width }) => {
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (width <= 0 || total === 0)
        return { total, segments: [] };
    let x = 0;
    const laidOut = segments
        .filter((s) => s.value > 0)
        .map((s) => {
        const w = (s.value / total) * width;
        const segment = { ...s, x, w, ratio: s.value / total };
        x += w;
        return segment;
    });
    return { total, segments: laidOut };
};
