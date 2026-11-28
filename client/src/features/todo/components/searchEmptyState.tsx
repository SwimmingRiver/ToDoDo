import { SearchX } from "lucide-react";
import { EmptyState } from "@/shared";

interface SearchEmptyStateProps {
  query: string;
  /** 우선순위 칩이 하나라도 켜져 있는지. 켜져 있으면 버튼 이름이 "필터 해제"다. */
  hasPriorityFilter?: boolean;
  /** 필터 전체(검색어 + 칩)를 지운다. 칩만 켠 상태에서도 버튼을 보여 준다("필터 해제"). */
  onCancelSearch?: () => void;
}

/** 검색·우선순위 필터 결과가 없을 때의 빈 상태(진행 중·완료 탭 공용). */
export const SearchEmptyState = ({
  query,
  hasPriorityFilter = false,
  onCancelSearch,
}: SearchEmptyStateProps) => {
  const trimmed = query.trim();
  // 검색칸 버튼과 같은 규칙: 칩이 켜져 있으면(검색어가 없으면 칩 때문이다) "필터 해제".
  const actionLabel = hasPriorityFilter || !trimmed ? "필터 해제" : "검색 취소";
  return (
    <EmptyState
      icon={SearchX}
      title="검색 결과가 없습니다"
      description={
        trimmed
          ? `"${trimmed}"에 대한 결과를 찾을 수 없습니다`
          : "조건에 맞는 할 일이 없습니다"
      }
      {...(onCancelSearch
        ? { actionLabel, onAction: onCancelSearch }
        : {})}
    />
  );
};
