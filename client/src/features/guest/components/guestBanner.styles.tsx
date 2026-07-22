import { styled } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";
import { radius } from "@/styles/radius";

const BannerContainer = styled.div`
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background-color: ${colors.brand.background};
  color: ${colors.brand.primary};

  ${media.tablet} {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
`;

const Message = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: ${colors.brand.primary};
`;

const LoginButton = styled.button`
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 16px;
  background-color: ${colors.brand.secondary};
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  border: none;
  border-radius: ${radius.md};
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${colors.brand.primary};
  }

  ${media.tablet} {
    width: 100%;
  }
`;

export { BannerContainer, Message, LoginButton };
