import { Field, TextInput, Notice, Footer, FooterGroup, PrimaryButton, SecondaryButton, Heading } from "./aiPlanModal.styles";

interface PlanGoalStepProps {
  goal: string;
  dueDate: string;
  today: string;
  isPending: boolean;
  onGoalChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const PlanGoalStep = ({
  goal,
  dueDate,
  today,
  isPending,
  onGoalChange,
  onDueDateChange,
  onSubmit,
  onCancel,
}: PlanGoalStepProps) => (
  <>
    <Heading>AI로 계획 만들기</Heading>
    <Field>
      목표
      <TextInput
        value={goal}
        onChange={(e) => onGoalChange(e.target.value)}
        maxLength={200}
        placeholder="예: 다음 달 이사 준비"
        aria-label="목표"
      />
    </Field>
    <Field>
      마감일(선택)
      <TextInput
        type="date"
        value={dueDate}
        min={today}
        onChange={(e) => onDueDateChange(e.target.value)}
        aria-label="마감일(선택)"
      />
    </Field>
    <Notice>입력한 목표는 계획 생성을 위해 AI(Anthropic)로 전송돼요</Notice>
    <Footer>
      <span />
      <FooterGroup>
        <SecondaryButton type="button" onClick={onCancel}>
          취소
        </SecondaryButton>
        <PrimaryButton type="button" onClick={onSubmit} disabled={isPending || goal.trim().length === 0}>
          {isPending ? "계획을 짜는 중…" : "계획 만들기"}
        </PrimaryButton>
      </FooterGroup>
    </Footer>
  </>
);

export default PlanGoalStep;
