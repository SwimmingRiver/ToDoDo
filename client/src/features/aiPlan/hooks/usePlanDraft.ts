import { useReducer } from "react";
import { EMPTY_DRAFT, planDraftReducer } from "./planDraft";

export const usePlanDraft = () => {
  const [draft, dispatch] = useReducer(planDraftReducer, EMPTY_DRAFT);
  return { draft, dispatch };
};
