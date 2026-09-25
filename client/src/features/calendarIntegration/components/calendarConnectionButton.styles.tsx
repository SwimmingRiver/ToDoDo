import styled from "styled-components";
import { colors } from "@/styles/colors";

export const Wrapper = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const ConnectButton = styled.button`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid ${colors.brand.strong};
  border-radius: 6px;
  background-color: transparent;
  color: ${colors.brand.strong};
  cursor: pointer;
  min-height: 36px;

  &:hover {
    background-color: ${colors.brand.tint};
  }
`;

export const DisconnectButton = styled.button`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid ${colors.border.secondary};
  border-radius: 6px;
  background-color: transparent;
  color: ${colors.text.secondary};
  cursor: pointer;
  min-height: 36px;

  &:hover {
    background-color: ${colors.background.secondary};
  }
`;

/**
 * danger.main은 흰 배경 대비로 WCAG AA 텍스트 기준(4.5:1)에 미달한다. 이
 * 코드베이스는 텍스트에 danger.text를 쓰고 danger.main은 장식(테두리·아이콘·
 * 배경)에만 쓰는 관례가 이미 있다(statusColors AA 정비, PR #85와 동일 원칙).
 */
export const RevokedNotice = styled.span`
  font-size: 12px;
  color: ${colors.danger.text};
`;
