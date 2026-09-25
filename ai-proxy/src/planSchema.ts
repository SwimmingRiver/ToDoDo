import { z } from "zod";

/**
 * AI 출력 형식. structured outputs가 JSON 형식을 보장한다. 재귀 스키마는
 * 지원되지 않아 상위 1 + 하위 N의 2단계로 고정했다(앱의 parentId 한 단계와도 일치).
 * minLength/maxItems 같은 제약은 API가 지원하지 않으므로 sanitizePlan에서 검사한다.
 */
export const PlanSchema = z.object({
  title: z.string(),
  dueDate: z.string().nullable(),
  items: z.array(
    z.object({
      title: z.string(),
      dueDate: z.string().nullable(),
      priority: z.enum(["low", "medium", "high"]),
    }),
  ),
});

export type RawPlan = z.infer<typeof PlanSchema>;
export type Priority = "low" | "medium" | "high";
export interface PlanItem {
  title: string;
  dueDate: string | null;
  priority: Priority;
}
export interface Plan {
  title: string;
  dueDate: string | null;
  items: PlanItem[];
}
