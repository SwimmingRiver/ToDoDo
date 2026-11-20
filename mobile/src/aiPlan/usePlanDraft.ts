import { useReducer } from "react";
import type { Dispatch } from "react";
import { EMPTY_DRAFT, planDraftReducer } from "@tododo/core/dist/aiPlan/index.js";
import type { PlanDraft, PlanDraftAction } from "@tododo/core/dist/aiPlan/index.js";

export const usePlanDraft = (): { draft: PlanDraft; dispatch: Dispatch<PlanDraftAction> } => {
  const [draft, dispatch] = useReducer(planDraftReducer, EMPTY_DRAFT);
  return { draft, dispatch };
};
