import { styled } from "styled-components";

// 카드 우측 상단 "..." 액션시트 트리거. 인터랙티브 요소 터치 타겟 최소 44px 확보를
// 위해 버튼 자체 크기를 44x44로 잡되, 아이콘은 시각적으로 작게 유지한다.
// 상단 마진은 ParentLabel의 margin-bottom(4px)과 정확히 맞춰, 하위 할 일 카드에서
// 버튼의 히트 영역이 ParentLabel 쪽으로 침범하지 않도록 한다.
const MenuButton = styled.button`
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -4px -10px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: #5e6c84;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background-color: #eceff3;
    color: #172b4d;
  }

  &:active {
    background-color: #e3e6ea;
  }
`;

export { MenuButton };
