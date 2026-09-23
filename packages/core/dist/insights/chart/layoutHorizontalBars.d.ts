export interface HorizontalBarRow {
    label: string;
    value: number;
}
export interface HorizontalBarLayoutRow extends HorizontalBarRow {
    /** 트랙 폭(width) 기준 채움 폭. 최대값 행이 width. */
    fillWidth: number;
    /** 합계 대비 비율(0~1). 라벨의 % 표기에 쓴다. */
    ratio: number;
}
export interface HorizontalBarsLayoutInput {
    rows: HorizontalBarRow[];
    /** 막대 트랙의 폭(라벨/숫자 칸을 제외한 순수 막대 영역). */
    width: number;
}
export declare const layoutHorizontalBars: ({ rows, width }: HorizontalBarsLayoutInput) => HorizontalBarLayoutRow[];
