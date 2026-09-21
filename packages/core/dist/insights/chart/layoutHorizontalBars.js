export const layoutHorizontalBars = ({ rows, width }) => {
    if (width <= 0)
        return [];
    const max = Math.max(0, ...rows.map((r) => r.value));
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    return rows.map((r) => ({
        ...r,
        fillWidth: max === 0 ? 0 : (r.value / max) * width,
        ratio: total === 0 ? 0 : r.value / total,
    }));
};
