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
  initialValue?: string;
  resultCount?: number;
  isSearching: boolean;
}

export const TodoSearch = ({
  onSearch,
  onClear,
  onReset,
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

  // 입력이 비어 있는데 결과 줄이 떠 있으면 칩만 켜진 상태다.
  const cancelLabel = inputValue || !onReset ? "검색 취소" : "필터 해제";

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
