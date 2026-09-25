import type { Dispatch } from "react";
import type { PlanUsage } from "../api";
import { canSubmit, checkedCount, type PlanDraft, type PlanDraftAction, type DraftFields } from "../hooks";
import PlanItemRow from "./planItemRow";
import { PRIORITY_LABELS } from "./priorityLabels";
import {
  Heading,
  UsageText,
  ParentRow,
  RowLabel,
  TextInput,
  Select,
  TextButton,
  Footer,
  FooterGroup,
  PrimaryButton,
  SecondaryButton,
} from "./aiPlanModal.styles";

interface PlanPreviewStepProps {
  draft: PlanDraft;
  dispatch: Dispatch<PlanDraftAction>;
  usage: PlanUsage | null;
  today: string;
  isRegenerating: boolean;
  isSaving: boolean;
  onRegenerate: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const PlanPreviewStep = ({
  draft,
  dispatch,
  usage,
  today,
  isRegenerating,
  isSaving,
  onRegenerate,
  onCancel,
  onSubmit,
}: PlanPreviewStepProps) => {
  const count = checkedCount(draft);
  return (
    <>
      <Heading>
        AI가 만든 계획
        {usage && <UsageText>{`오늘 ${usage.used}/${usage.limit}회`}</UsageText>}
      </Heading>
      <ParentRow>
        <RowLabel>상위</RowLabel>
        <TextInput
          value={draft.parent.title}
          onChange={(e) => dispatch({ type: "updateParent", patch: { title: e.target.value } })}
          maxLength={100}
          aria-label="상위 할 일 제목"
        />
        <TextInput
          type="date"
          value={draft.parent.dueDate ?? ""}
          min={today}
          onChange={(e) => dispatch({ type: "updateParent", patch: { dueDate: e.target.value || null } })}
          aria-label="상위 할 일 마감일"
        />
        <Select
          value={draft.parent.priority}
          onChange={(e) =>
            dispatch({ type: "updateParent", patch: { priority: e.target.value as DraftFields["priority"] } })
          }
          aria-label="상위 할 일 우선순위"
        >
          {(["high", "medium", "low"] as const).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      </ParentRow>
      {draft.items.map((item) => (
        <PlanItemRow
          key={item.key}
          item={item}
          today={today}
          onChange={(patch) => dispatch({ type: "updateItem", key: item.key, patch })}
          onToggle={() => dispatch({ type: "toggleItem", key: item.key })}
          onRemove={() => dispatch({ type: "removeItem", key: item.key })}
        />
      ))}
      <TextButton type="button" onClick={() => dispatch({ type: "addItem" })}>
        + 항목 직접 추가
      </TextButton>
      <Footer>
        <SecondaryButton type="button" onClick={onRegenerate} disabled={isRegenerating || isSaving}>
          {isRegenerating ? "계획을 짜는 중…" : "다시 만들기"}
        </SecondaryButton>
        <FooterGroup>
          <SecondaryButton type="button" onClick={onCancel}>
            취소
          </SecondaryButton>
          <PrimaryButton type="button" onClick={onSubmit} disabled={!canSubmit(draft) || isSaving || isRegenerating}>
            {`${count}개 추가`}
          </PrimaryButton>
        </FooterGroup>
      </Footer>
    </>
  );
};

export default PlanPreviewStep;
