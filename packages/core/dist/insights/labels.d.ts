import type { PeriodPreset } from "./filter";
export declare const PERIOD_PRESETS: readonly PeriodPreset[];
/** 필터 탭에 쓰는 짧은 라벨. */
export declare const PERIOD_TAB_LABELS: Record<PeriodPreset, string>;
/** 카드 제목 접두사("이번 달 완료 추이"). all만 "전체 기간"으로 읽히게 다르다. */
export declare const PERIOD_TITLE_LABELS: Record<PeriodPreset, string>;
