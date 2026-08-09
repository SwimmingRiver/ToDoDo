import { styled } from "styled-components";
import { colors } from "@/styles/colors";
import { media } from "@/styles/breakpoints";
const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
`;

const InputLabel = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: #333;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: ${colors.brand.secondary};
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
  /* 높이는 useAutoGrowTextArea가 관리한다. 수동 리사이즈 핸들은 서로 싸우므로 끄고,
     overflow를 숨겨 스크롤바 대신 높이가 늘어나게 한다.
     min-height는 인라인 height보다 우선하므로 빈 상태에서도 2줄 높이를 유지한다
     — "여기는 여러 줄을 쓸 수 있다"는 어포던스를 잃지 않기 위해서다. */
  resize: none;
  min-height: 64px;
  /* auto-grow가 내용만큼 계속 키우므로 상한이 필요하다. 없으면 긴 설명이 모달을
     밀어내 우선순위/날짜 필드가 화면 밖으로 나간다(ModalContainer는 max-height: 80vh).
     상세 패널과 달리 여기엔 하이라이트 오버레이가 없어 textarea에 직접 걸어도 된다.
     .5줄로 끊어 마지막 줄이 반쯤 보이게 하면 "아래에 더 있다"는 신호가 된다. */
  max-height: 242px;
  overflow-x: hidden;
  overflow-y: auto;

  ${media.mobile} {
    max-height: 200px;
  }

  &:focus {
    border-color: ${colors.brand.secondary};
  }
`;

const MoreButton = styled.button`
  height: 40px;
  border: none;
  cursor: pointer;
  background: none;
  color: ${colors.brand.secondary};
  font-size: 14px;

  &:hover {
    text-decoration: underline;
  }
`;

const MoreButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

const DetailSection = styled.div<{ $isOpen: boolean }>`
  display: grid;
  grid-template-rows: ${({ $isOpen }) => ($isOpen ? "1fr" : "0fr")};
  transition: grid-template-rows 0.3s ease-in-out;
  overflow: hidden;
`;

const DetailContent = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;

  &:focus {
    border-color: ${colors.brand.secondary};
  }
`;

export {
  FormContainer,
  InputLabel,
  Input,
  TextArea,
  MoreButton,
  MoreButtonContainer,
  DetailSection,
  DetailContent,
  Select,
};
