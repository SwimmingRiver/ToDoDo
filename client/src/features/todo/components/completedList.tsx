import { useEffect, useMemo } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  buildCompletedGroups,
  isTodoFilterActive,
  matchesTodoFilter,
  type TodoFilter,
} from "@tododo/core/dist/todoFilter/index.js";
import { EmptyState } from "@/shared";
import type { Todo } from "../types";
import { useGetArchivedTodos } from "../hooks";
import CompletedProjectCard from "./completedProjectCard";
import { SearchEmptyState } from "./searchEmptyState";
import {
  MonthSection,
  MonthHeading,
  ArchiveNotice,
  ArchiveLoadingHint,
} from "./completedList.styles";

interface CompletedListProps {
  todos: Todo[];
  filter: TodoFilter;
  /** 필터 결과가 없을 때 빈 상태의 "검색 취소" */
  onCancelSearch?: () => void;
  /** 검색칸의 결과 수(카드 수 기준)를 위로 알린다 */
  onResultCountChange?: (count: number) => void;
}

/** "YYYY-MM" → "YYYY년 M월" */
const formatMonth = (monthKey: string) => {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
};

/**
 * `완료` 탭. 받아 둔 todos의 완료 루트 + 보관분(archived == true)을 합쳐 월별로 보여준다.
 * 보관분은 이 컴포넌트가 마운트될 때(= 탭을 처음 열 때) 한 번만 읽는다.
 * 보관분 조회가 늦거나 실패해도 최근 완료는 그대로 보여준다.
 */
const CompletedList = ({
  todos,
  filter,
  onCancelSearch,
  onResultCountChange,
}: CompletedListProps) => {
  const archived = useGetArchivedTodos(true);
  const isFiltering = isTodoFilterActive(filter);

  const groups = useMemo(
    () => buildCompletedGroups(archived.data ? [...todos, ...archived.data] : todos, filter),
    [todos, archived.data, filter],
  );
  const cardCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.cards.length, 0),
    [groups],
  );

  useEffect(() => {
    onResultCountChange?.(cardCount);
  }, [cardCount, onResultCountChange]);

  const notice = archived.isError ? (
    <ArchiveNotice role="alert">지난 기록을 불러오지 못했어요</ArchiveNotice>
  ) : null;
  const loadingHint = archived.isPending ? (
    <ArchiveLoadingHint role="status">지난 기록을 불러오는 중…</ArchiveLoadingHint>
  ) : null;

  if (cardCount === 0) {
    if (loadingHint) return loadingHint;
    if (isFiltering) {
      return (
        <>
          {notice}
          <SearchEmptyState query={filter.query} onCancelSearch={onCancelSearch} />
        </>
      );
    }
    // 보관분을 못 읽었으면 "아직 없다"고 단정하지 않는다
    if (notice) return notice;
    return (
      <EmptyState
        icon={CheckCircle2}
        title="완료한 프로젝트가 아직 없어요"
        description="할 일을 완료하면 여기에 월별로 모여요"
      />
    );
  }

  return (
    <>
      {notice}
      {groups.map((group) => (
        <MonthSection key={group.monthKey} aria-label={formatMonth(group.monthKey)}>
          <MonthHeading>{formatMonth(group.monthKey)}</MonthHeading>
          {group.cards.map((card) => (
            <CompletedProjectCard
              key={card.key}
              card={card}
              isFiltering={isFiltering}
              autoExpand={
                card.kind === "project" &&
                isFiltering &&
                card.matchedChildIds.size > 0 &&
                !matchesTodoFilter(card.root, filter)
              }
            />
          ))}
        </MonthSection>
      ))}
      {loadingHint}
    </>
  );
};

export default CompletedList;
