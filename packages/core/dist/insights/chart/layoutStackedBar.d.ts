export interface StackedBarSegment {
    key: string;
    label: string;
    value: number;
}
export interface StackedBarLayoutSegment extends StackedBarSegment {
    x: number;
    w: number;
    ratio: number;
}
export interface StackedBarLayout {
    total: number;
    /** 값이 0인 세그먼트는 제외. 왼쪽부터 입력 순서대로 이어 붙는다. */
    segments: StackedBarLayoutSegment[];
}
export interface StackedBarLayoutInput {
    segments: StackedBarSegment[];
    width: number;
}
export declare const layoutStackedBar: ({ segments, width }: StackedBarLayoutInput) => StackedBarLayout;
