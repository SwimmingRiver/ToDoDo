import type { PeriodPreset } from "./filter";

export const PERIOD_PRESETS: readonly PeriodPreset[] = ["thisWeek", "thisMonth", "last90Days", "all"];

/** 필터 탭에 쓰는 짧은 라벨. */
export const PERIOD_TAB_LABELS: Record<PeriodPreset, string> = {
  thisWeek: "이번 주",
  thisMonth: "이번 달",
  last90Days: "최근 90일",
  all: "전체",
};

/** 카드 제목 접두사("이번 달 완료 추이"). all만 "전체 기간"으로 읽히게 다르다. */
export const PERIOD_TITLE_LABELS: Record<PeriodPreset, string> = {
  thisWeek: "이번 주",
  thisMonth: "이번 달",
  last90Days: "최근 90일",
  all: "전체 기간",
};
