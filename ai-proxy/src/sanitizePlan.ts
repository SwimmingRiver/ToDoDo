import { isValidDateKey, type PlanRequest } from "./validateInput";
import type { Plan, PlanItem, RawPlan } from "./planSchema";

export const MAX_ITEMS = 10;
export const MAX_TITLE_LENGTH = 100;

const cleanTitle = (title: string): string => title.trim().slice(0, MAX_TITLE_LENGTH);

/** 범위 밖 날짜는 항목을 버리지 않고 null로 비운다. 사용자가 미리보기에서 채우면 된다. */
const clampDate = (date: string | null, req: PlanRequest): string | null => {
  if (!isValidDateKey(date)) return null;
  if (date < req.today) return null;
  if (req.dueDate && date > req.dueDate) return null;
  return date;
};

/** 스키마가 보장하지 못하는 개수·길이·날짜 범위를 검사한다. 쓸 수 없는 응답이면 null. */
export const sanitizePlan = (raw: RawPlan, req: PlanRequest): Plan | null => {
  const title = cleanTitle(raw.title);
  if (!title) return null;

  const items: PlanItem[] = raw.items
    .map((item) => ({
      title: cleanTitle(item.title),
      dueDate: clampDate(item.dueDate, req),
      priority: item.priority,
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, MAX_ITEMS);

  if (items.length === 0) return null;

  return { title, dueDate: clampDate(raw.dueDate, req), items };
};
