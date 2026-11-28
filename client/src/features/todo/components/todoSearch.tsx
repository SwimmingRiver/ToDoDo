import { useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import {
  SearchContainer,
  SearchInputWrapper,
  SearchIcon,
  SearchInput,
  ClearButton,
  SearchResultInfo,
  ResultCount,
  CancelSearchButton,
} from "./todoSearch.styles";

interface TodoSearchProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  /**
   * 결과 줄의 버튼으로 필터 전체(검색어 + 우선순위 칩)를 지울 때 부른다. 칩만 켜져 있으면
   * 입력을 비우는 것만으로는 아무 일도 없으므로, 주면 이 버튼이 "필터 해제"로도 동작한다.
   */
  onReset?: () => void;
  /** 우선순위 칩이 하나라도 켜져 있는지. 켜져 있으면 버튼이 칩까지 지우므로 "필터 해제"라 부른다. */
  hasPriorityFilter?: boolean;
  initialValue?: string;
  resultCount?: number;
  isSearching: boolean;
}

export const TodoSearch = ({
  onSearch,
  onClear,
  onReset,
  hasPriorityFilter = false,
  initialValue = "",
  resultCount = 0,
  isSearching,
}: TodoSearchProps) => {
  const [inputValue, setInputValue] = useState(initialValue);

  // 디바운스 처리
  useEffect(() => {
    const trimmed = inputValue.trim();

    if (!trimmed) {
      onClear();
      return;
    }

    const timer = setTimeout(() => {
      onSearch(trimmed);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, onSearch, onClear]);

  const handleClear = useCallback(() => {
    setInputValue("");
  }, []);

  const handleCancel = useCallback(() => {
    setInputValue("");
    onReset?.();
  }, [onReset]);

  // 칩이 켜져 있으면(검색어가 있든 없든) 버튼이 칩까지 지우므로 "필터 해제", 검색어만이면 "검색 취소".
  const cancelLabel = hasPriorityFilter && onReset ? "필터 해제" : "검색 취소";

  return (
    <SearchContainer>
      <SearchInputWrapper>
        <SearchIcon>
          <Search size={18} />
        </SearchIcon>
        <SearchInput
          type="text"
          placeholder="할 일 검색..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        {inputValue && (
          <ClearButton onClick={handleClear}>
            <X size={14} />
          </ClearButton>
        )}
      </SearchInputWrapper>

      {isSearching && (
        <SearchResultInfo>
          <ResultCount>
            검색 결과 <strong>{resultCount}</strong>건
          </ResultCount>
          <CancelSearchButton type="button" onClick={handleCancel}>
            {cancelLabel}
          </CancelSearchButton>
        </SearchResultInfo>
      )}
    </SearchContainer>
  );
};
