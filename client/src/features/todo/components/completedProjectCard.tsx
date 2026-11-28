import { memo, useId, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import type { CompletedCard } from "@tododo/core/dist/todoFilter/index.js";
import { toDateKeyFromISO } from "@tododo/core/dist/insights/index.js";
import type { Todo } from "../types";
import {
  CompletedCardContainer,
  CardToggle,
  CheckMark,
  CardTitleGroup,
  CardTitle,
  CardSubtitle,
  DoneDate,
  Chevron,
  ExpandedArea,
  Description,
  EmptyExpandedMessage,
  ChildRow,
  ChildStatusDot,
  ChildTitle,
} from "./completedList.styles";

interface CompletedProjectCardProps {
  card: CompletedCard<Todo>;
  /** 검색·필터 중인지. 켜져 있으면 걸리지 않은 하위를 흐리게 보여준다. */
  isFiltering?: boolean;
  /** 루트는 안 걸리고 하위만 걸려서 처음부터 펼쳐 둘지 */
  autoExpand?: boolean;
}

/** UTC ISO → 로컬 달력 기준 "MM-DD" (split("T") 금지 — 로컬 게터로 날짜를 뽑는다) */
const toMonthDay = (iso: string) => toDateKeyFromISO(iso).slice(5);

/**
 * 완료 탭의 읽기 전용 카드. 수정·삭제·하위 추가·상태 변경 UI가 없고, 눌러도 상세로
 * 가지 않고 펼치기만 한다(보관분은 목록 쿼리에 없어 상세가 따로 읽어야 하고, 상세는
 * 수정 화면이라 이번 범위에서 뺐다).
 */
const CompletedProjectCard = memo(
  ({ card, isFiltering = false, autoExpand = false }: CompletedProjectCardProps) => {
    // 사용자가 직접 펼침/접음을 정하면 그 값을 쓰되, 자동 펼침 여부가 바뀌면(필터 변경)
    // 그때의 결정은 버리고 다시 자동 규칙을 따른다.
    const [override, setOverride] = useState<{ auto: boolean; expanded: boolean } | null>(
      null,
    );
    const isExpanded =
      override !== null && override.auto === autoExpand ? override.expanded : autoExpand;
    const expandedId = useId();

    const { root } = card;
    const subtitle =
      card.kind === "series"
        ? `${card.count}회 완료`
        : card.children.length > 0
          ? `하위 ${card.children.length}개`
          : null;

    return (
      <CompletedCardContainer data-completed-card>
        <CardToggle
          type="button"
          aria-expanded={isExpanded}
          aria-controls={expandedId}
          onClick={() => setOverride({ auto: autoExpand, expanded: !isExpanded })}
        >
          <CheckMark aria-hidden="true">
            <CheckCircle2 size={18} />
          </CheckMark>
          <CardTitleGroup>
            <CardTitle>{root.title}</CardTitle>
            {subtitle && <CardSubtitle>{subtitle}</CardSubtitle>}
          </CardTitleGroup>
          <DoneDate>{toMonthDay(card.completedAt)} 완료</DoneDate>
          <Chevron aria-hidden="true">
            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </Chevron>
        </CardToggle>
        {isExpanded && (
          <ExpandedArea id={expandedId}>
            {root.description?.trim() && <Description>{root.description}</Description>}
            {card.kind === "project" &&
              card.children.map((child) => {
                const dimmed = isFiltering && !card.matchedChildIds.has(child.id);
                return (
                  <ChildRow
                    key={child.id}
                    $dimmed={dimmed}
                    data-dimmed={dimmed || undefined}
                  >
                    <ChildStatusDot $status={child.status} aria-hidden="true" />
                    <ChildTitle>{child.title}</ChildTitle>
                  </ChildRow>
                );
              })}
            {!root.description?.trim() &&
              (card.kind === "series" || card.children.length === 0) && (
                <EmptyExpandedMessage>
                  {card.kind === "series" ? "설명이 없습니다" : "하위 항목이 없습니다"}
                </EmptyExpandedMessage>
              )}
          </ExpandedArea>
        )}
      </CompletedCardContainer>
    );
  },
);

export default CompletedProjectCard;
