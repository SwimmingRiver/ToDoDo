interface RecurrenceFormValue {
  type: "daily" | "weekly" | "monthly";
  weekdays?: number[]; // 0=일 ~ 6=토, type==="weekly"일 때만 사용, 최소 1개
}

export type { RecurrenceFormValue };
