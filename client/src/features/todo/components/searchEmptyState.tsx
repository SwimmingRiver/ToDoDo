import { SearchX } from "lucide-react";
import { EmptyState } from "@/shared";

interface SearchEmptyStateProps {
  query: string;
  /** 필터 전체(검색어 + 칩)를 지운다. 칩만 켠 상태에서도 버튼을 보여 준다("필터 해제"). */
  onCancelSearch?: () => void;
}

/** 검색·우선순위 필터 결과가 없을 때의 빈 상태(진행 중·완료 탭 공용). */
export const SearchEmptyState = ({ query, onCancelSearch }: SearchEmptyStateProps) => {
  const trimmed = query.trim();
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
        ? { actionLabel: trimmed ? "검색 취소" : "필터 해제", onAction: onCancelSearch }
        : {})}
    />
  );
};
