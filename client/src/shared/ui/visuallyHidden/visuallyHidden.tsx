import styled from "styled-components";

/**
 * 화면에는 안 보이고 스크린리더만 읽는 텍스트.
 * 표준 sr-only 패턴 — margin:-1px/border:0까지 있어야 레이아웃에 1px 흔적이 남지 않는다.
 * position:absolute이므로 쓰는 쪽 부모에 position:relative를 둬야 스크롤 컨테이너
 * 바깥 조상을 기준으로 배치되어 넘침이 생기지 않는다.
 */
const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
`;

export default VisuallyHidden;
