/**
 * 세로 막대 차트 기하. 픽셀 단위 숫자만 돌려주고 그리기는 각 플랫폼(웹 <svg>,
 * RN react-native-svg)이 담당한다.
 */
export interface BarChartPoint {
    label: string;
    value: number;
}
export interface BarChartPadding {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface BarChartBar {
    x: number;
    y: number;
    w: number;
    h: number;
    value: number;
    label: string;
}
export interface BarChartLayout {
    bars: BarChartBar[];
    yTicks: {
        y: number;
        value: number;
    }[];
    xLabels: {
        x: number;
        text: string;
        visible: boolean;
    }[];
    baselineY: number;
    plotLeft: number;
    plotRight: number;
}
export interface BarChartLayoutInput {
    points: BarChartPoint[];
    width: number;
    height: number;
    padding?: BarChartPadding;
}
/** 왼쪽은 y 눈금 숫자, 아래는 x 라벨 자리. */
export declare const DEFAULT_BAR_CHART_PADDING: BarChartPadding;
/**
 * "nice number" 눈금 간격: rawStep 이상인 1·2·5×10^n 중 가장 작은 값. 값이 건수
 * (정수)라 최소 1로 고정해서 0.5 같은 눈금이 나오지 않게 한다.
 */
export declare const niceStep: (rawStep: number) => number;
export declare const layoutBarChart: ({ points, width, height, padding, }: BarChartLayoutInput) => BarChartLayout;
