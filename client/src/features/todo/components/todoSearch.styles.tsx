import { styled, keyframes } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

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
  color: ${colors.text.tertiary};
  display: flex;
  align-items: center;
  pointer-events: none;
`;

const SearchInput = styled.input`
  width: 100%;
  height: 40px;
  padding: 0 40px 0 40px;
  border: 1px solid ${colors.border.tertiary};
  border-radius: 8px;
  font-size: 14px;
  background-color: ${colors.background.secondary};
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${colors.brand.strong};
    background-color: ${colors.surface.raised};
    box-shadow: 0 0 0 3px color-mix(in srgb, ${colors.brand.strong} 10%, transparent);
  }

  &::placeholder {
    color: ${colors.text.tertiary};
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
  background: ${colors.background.secondary};
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${colors.text.secondary};
  transition: all 0.2s ease;

  &:hover {
    background: ${colors.border.secondary};
    color: ${colors.text.primary};
  }
`;

const LoadingSpinner = styled.div`
  position: absolute;
  right: 12px;
  width: 18px;
  height: 18px;
  border: 2px solid ${colors.border.tertiary};
  border-top-color: ${colors.brand.fill};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const SearchResultInfo = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  font-size: 13px;
  color: ${colors.text.secondary};
`;

const ResultCount = styled.span`
  font-weight: 500;
  color: ${colors.text.primary};

  strong {
    color: ${colors.brand.strong};
  }
`;

const CancelSearchButton = styled.button`
  border: none;
  background: none;
  color: ${colors.brand.strong};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${colors.brand.tint};
  }
`;

const NoResultsMessage = styled.div`
  text-align: center;
  padding: 32px 16px;
  color: ${colors.text.secondary};

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
