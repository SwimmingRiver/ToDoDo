import { Check, Link2, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Todo } from "@/features/todo/types";
import { RecurrenceBadge, extractLinks } from "@/shared";
import { getDaysLeft, getDueBadgeLabel, getUrgency } from "@/shared/utils/due";
import { getPeriodProgress } from "@/shared/utils/dateRange";
import { toDateKey } from "@/shared/utils/date";
import { formatDueTime } from "@/shared/utils/formatToday";
import PeriodBadge from "./periodBadge";
import {
  Row,
  Checkbox,
  Content,
  TitleRow,
  Title,
  DescriptionRow,
  LinkIndicator,
  Description,
  TimeLabel,
  OverdueBadge,
  DueSoonBadge,
  DeleteButton,
} from "./todayTodoItem.styles";

interface TodayTodoItemProps {
  todo: Todo;
  onToggleDone: (todo: Todo) => void;
  /** 기간(startAt~dueAt) 진행률 배지("n/총일 일차") 계산 기준 날짜(로컬 yyyy-MM-dd). 기본값: 오늘. */
  selectedDate?: string;
  /** 기본값: 기존처럼 navigate(`/todo/${todo.id}`). 상세 라우트가 없는 컨텍스트(게스트 등)에서 오버라이드용. */
  onItemClick?: (todo: Todo) => void;
  /** 전달된 경우에만 우측 삭제 아이콘(44px 터치 타겟) 노출. 기존 호출부는 미전달 → 기존 동작 100% 유지. */
  onDelete?: (todo: Todo) => void;
}

const TodayTodoItem = ({
  todo,
  onToggleDone,
  selectedDate,
  onItemClick,
  onDelete,
}: TodayTodoItemProps) => {
  const navigate = useNavigate();
  const isDone = todo.status === "done";
  const dateKey = selectedDate ?? toDateKey(new Date());
  const daysLeft = todo.dueAt ? getDaysLeft(todo.dueAt) : null;
  const urgency = daysLeft !== null ? getUrgency(daysLeft) : "normal";
  const dueTime = todo.dueAt ? formatDueTime(todo.dueAt) : null;
  const periodProgress = !isDone ? getPeriodProgress(dateKey, todo) : null;
  // 기간 항목의 마지막 날(=마감일 당일)에는 기존처럼 시각(dueTime)을, 그 이전
  // 진행 중인 날에는 "며칠 남았는지"가 더 유효한 정보이므로 D-n 텍스트를 보여준다.
  // 단일 마감일 항목(periodProgress === null)은 항상 마지막 날 취급.
  const isLastDayOfPeriod = periodProgress
    ? periodProgress.dayIndex === periodProgress.totalDays
    : true;

  const handleItemClick = () =>
    onItemClick ? onItemClick(todo) : navigate(`/todo/${todo.id}`);

  // 목록의 모든 행마다 스캔이 돌므로 description이 바뀔 때만 다시 계산한다.
  const hasLinks = useMemo(
    () => extractLinks(todo.description).length > 0,
    [todo.description]
  );

  return (
    <Row>
      <Checkbox
        role="checkbox"
        aria-checked={isDone}
        aria-label={`${todo.title} 완료 처리`}
        $isDone={isDone}
        $urgency={isDone ? "none" : urgency === "normal" ? "none" : urgency}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone(todo);
        }}
      >
        {isDone && <Check size={12} color="#FFFFFF" />}
      </Checkbox>
      <Content onClick={handleItemClick}>
        <TitleRow>
          {periodProgress && (
            <PeriodBadge
              dayIndex={periodProgress.dayIndex}
              totalDays={periodProgress.totalDays}
            />
          )}
          <Title $isDone={isDone}>{todo.title}</Title>
          {todo.recurrenceId != null && <RecurrenceBadge compact />}
        </TitleRow>
        {todo.description && (
          <DescriptionRow>
            {hasLinks && (
              <LinkIndicator aria-label="링크 포함">
                <Link2 size={11} />
              </LinkIndicator>
            )}
            <Description>{todo.description}</Description>
          </DescriptionRow>
        )}
      </Content>
      {!isDone && daysLeft !== null && urgency === "danger" && (
        <OverdueBadge>{getDueBadgeLabel(daysLeft)}</OverdueBadge>
      )}
      {!isDone && daysLeft !== null && urgency === "soon" && (
        <DueSoonBadge>{getDueBadgeLabel(daysLeft)}</DueSoonBadge>
      )}
      {!isDone && urgency === "normal" && (
        <>
          {isLastDayOfPeriod
            ? dueTime && <TimeLabel>{dueTime}</TimeLabel>
            : daysLeft !== null && <TimeLabel>{getDueBadgeLabel(daysLeft)}</TimeLabel>}
        </>
      )}
      {onDelete && (
        <DeleteButton
          type="button"
          aria-label={`${todo.title} 삭제`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(todo);
          }}
        >
          <Trash2 size={16} />
        </DeleteButton>
      )}
    </Row>
  );
};

export default TodayTodoItem;
