import { useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import {
  SearchContainer,
  SearchInputWrapper,
  SearchIcon,
  SearchInput,
  ClearButton,
  LoadingSpinner,
  SearchResultInfo,
  ResultCount,
  CancelSearchButton,
} from "./todoSearch.styles";

interface TodoSearchProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isLoading?: boolean;
  resultCount?: number;
  isSearching: boolean;
}

export const TodoSearch = ({
  onSearch,
  onClear,
  isLoading = false,
  resultCount = 0,
  isSearching,
}: TodoSearchProps) => {
  const [inputValue, setInputValue] = useState("");

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
        {isLoading && <LoadingSpinner />}
        {!isLoading && inputValue && (
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
          <CancelSearchButton onClick={handleClear}>
            검색 취소
          </CancelSearchButton>
        </SearchResultInfo>
      )}
    </SearchContainer>
  );
};
