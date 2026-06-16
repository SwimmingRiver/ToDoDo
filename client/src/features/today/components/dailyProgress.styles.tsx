import { styled } from "styled-components";
import { colors } from "@/styles/colors";

const Container = styled.div`
  padding: 12px 16px;
`;

const Header = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const DateLabel = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const CompletionLabel = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${colors.brand.primary};
`;

const ProgressBarTrack = styled.div`
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background-color: ${colors.background.secondary};
  overflow: hidden;
`;

const ProgressBarFill = styled.div`
  height: 100%;
  border-radius: 3px;
  background-color: ${colors.brand.secondary};
  transition: width 0.2s ease;
`;

export {
  Container,
  Header,
  DateLabel,
  CompletionLabel,
  ProgressBarTrack,
  ProgressBarFill,
};
