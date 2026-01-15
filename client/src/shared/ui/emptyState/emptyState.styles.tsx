import { styled } from "styled-components";
import { media } from "../../../styles/breakpoints";

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
`;

const IconWrapper = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background-color: #f1f3f4;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  color: #9aa0a6;

  ${media.mobile} {
    width: 64px;
    height: 64px;
  }
`;

const Title = styled.h3`
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;

  ${media.mobile} {
    font-size: 16px;
  }
`;

const Description = styled.p`
  margin: 0 0 24px 0;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
  max-width: 280px;

  ${media.mobile} {
    font-size: 13px;
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background-color: #1c72eb;
  color: white;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #1560c7;
  }

  ${media.mobile} {
    padding: 10px 20px;
    font-size: 13px;
  }
`;

export { Container, IconWrapper, Title, Description, ActionButton };
