import { styled, keyframes } from "styled-components";
import { media } from "@/styles/breakpoints";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const SearchContainer = styled.div`
  position: relative;
  margin-bottom: 12px;
`;

const SearchInputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 12px;
  color: #9aa0a6;
  display: flex;
  align-items: center;
  pointer-events: none;
`;

const SearchInput = styled.input`
  width: 100%;
  height: 40px;
  padding: 0 40px 0 40px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  background-color: #f8f9fa;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #1c72eb;
    background-color: #fff;
    box-shadow: 0 0 0 3px rgba(28, 114, 235, 0.1);
  }

  &::placeholder {
    color: #9aa0a6;
  }

  ${media.mobile} {
    height: 36px;
    font-size: 13px;
  }
`;

const ClearButton = styled.button`
  position: absolute;
  right: 8px;
  width: 24px;
  height: 24px;
  border: none;
  background: #e8eaed;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5f6368;
  transition: all 0.2s ease;

  &:hover {
    background: #dadce0;
    color: #1a1a1a;
  }
`;

const LoadingSpinner = styled.div`
  position: absolute;
  right: 12px;
  width: 18px;
  height: 18px;
  border: 2px solid #e0e0e0;
  border-top-color: #1c72eb;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const SearchResultInfo = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  font-size: 13px;
  color: #5f6368;
`;

const ResultCount = styled.span`
  font-weight: 500;
  color: #1a1a1a;

  strong {
    color: #1c72eb;
  }
`;

const CancelSearchButton = styled.button`
  border: none;
  background: none;
  color: #1c72eb;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #e8f0fe;
  }
`;

const NoResultsMessage = styled.div`
  text-align: center;
  padding: 32px 16px;
  color: #5f6368;

  p {
    margin: 8px 0 0 0;
    font-size: 14px;
  }
`;

export {
  SearchContainer,
  SearchInputWrapper,
  SearchIcon,
  SearchInput,
  ClearButton,
  LoadingSpinner,
  SearchResultInfo,
  ResultCount,
  CancelSearchButton,
  NoResultsMessage,
};
