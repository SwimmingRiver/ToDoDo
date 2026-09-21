/**
 * 세로 막대 차트 기하. 픽셀 단위 숫자만 돌려주고 그리기는 각 플랫폼(웹 <svg>,
 * RN react-native-svg)이 담당한다.
 */
/** 왼쪽은 y 눈금 숫자, 아래는 x 라벨 자리. */
export const DEFAULT_BAR_CHART_PADDING = { top: 8, right: 8, bottom: 20, left: 28 };
/** x 라벨 한 개가 차지한다고 보는 폭(px). "9/14" 4글자 10px 폰트 기준 여유 포함. */
const LABEL_WIDTH = 32;
/** 슬롯 폭 중 막대 사이 간격 비율. */
const BAR_GAP_RATIO = 0.3;
/** y 눈금 목표 개수(0 제외). */
const TARGET_TICKS = 3;
const EMPTY = { bars: [], yTicks: [], xLabels: [], baselineY: 0, plotLeft: 0, plotRight: 0 };
/**
 * "nice number" 눈금 간격: rawStep 이상인 1·2·5×10^n 중 가장 작은 값. 값이 건수
 * (정수)라 최소 1로 고정해서 0.5 같은 눈금이 나오지 않게 한다.
 */
export const niceStep = (rawStep) => {
    if (rawStep <= 1)
        return 1;
    const exponent = Math.floor(Math.log10(rawStep));
    const base = 10 ** exponent;
    const fraction = rawStep / base;
    const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return niceFraction * base;
};
export const layoutBarChart = ({ points, width, height, padding = DEFAULT_BAR_CHART_PADDING, }) => {
    if (width <= 0 || height <= 0 || points.length === 0)
        return EMPTY;
    const plotLeft = padding.left;
    const plotRight = width - padding.right;
    const plotTop = padding.top;
    const baselineY = height - padding.bottom;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = baselineY - plotTop;
    if (plotWidth <= 0 || plotHeight <= 0)
        return EMPTY;
    const max = Math.max(0, ...points.map((p) => p.value));
    const step = niceStep(max / TARGET_TICKS);
    const yMax = Math.max(step, Math.ceil(max / step) * step);
    const yTicks = [];
    for (let value = 0; value <= yMax; value += step) {
        yTicks.push({ value, y: baselineY - (value / yMax) * plotHeight });
    }
    const n = points.length;
    const slot = plotWidth / n;
    const barWidth = slot * (1 - BAR_GAP_RATIO);
    const bars = points.map((p, i) => {
        const h = (p.value / yMax) * plotHeight;
        return {
            x: plotLeft + i * slot + (slot - barWidth) / 2,
            y: baselineY - h,
            w: barWidth,
            h,
            value: p.value,
            label: p.label,
        };
    });
    // 라벨이 겹치지 않게 k개마다 하나만 보이되 마지막은 항상 보인다. 마지막과 k 미만으로
    // 가까운 "k의 배수" 라벨은 마지막과 겹치므로 숨긴다.
    const k = Math.max(1, Math.ceil((n * LABEL_WIDTH) / plotWidth));
    const xLabels = points.map((p, i) => ({
        x: plotLeft + i * slot + slot / 2,
        text: p.label,
        visible: i === n - 1 || (i % k === 0 && n - 1 - i >= k),
    }));
    return { bars, yTicks, xLabels, baselineY, plotLeft, plotRight };
};
