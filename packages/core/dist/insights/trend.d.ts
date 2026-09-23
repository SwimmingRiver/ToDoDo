import type { Todo } from "../types/todo";
import { type PeriodPreset, type PeriodRange } from "./filter";
export type TrendGranularity = "day" | "week" | "month";
export interface TrendBucket {
    /** day/week: 버킷 시작 날짜 키. month: "yyyy-MM". */
    key: string;
    /** x축 라벨. day/week: "M/d", month: "yyyy.M". */
    label: string;
    count: number;
}
export declare const resolveTrendGranularity: (period: PeriodPreset) => TrendGranularity;
/**
 * 완료 추이 버킷. 완료 날짜(doneAt)를 기준으로 센다.
 * - day: 범위의 날마다 1개.
 * - week: 범위 시작일부터 7일 단위(일요일 정렬 X — 정렬하면 90일이 13개/14개로
 *   흔들려서 시작일 기준으로 고정). 마지막 버킷은 범위 끝에서 잘린다.
 * - month: 범위가 없으면(all) 첫 완료월 ~ now의 달. 완료 0건이면 빈 배열.
 * 빈 버킷은 0으로 채운다.
 */
export declare const bucketCompletions: (todos: Todo[], range: PeriodRange, granularity: TrendGranularity, now?: Date) => TrendBucket[];
