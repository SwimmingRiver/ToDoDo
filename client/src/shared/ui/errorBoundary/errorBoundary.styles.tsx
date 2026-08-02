import styled from "styled-components";
import { colors } from "@/styles/colors";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 40px 20px;
  text-align: center;
`;

export const Title = styled.h1`
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

export const Description = styled.p`
  margin: 0 0 24px 0;
  font-size: 14px;
  color: ${colors.text.secondary};
  line-height: 1.5;
`;

export const ReloadButton = styled.button`
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  background-color: ${colors.brand.secondary};
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background-color: ${colors.brand.primary};
  }
`;
