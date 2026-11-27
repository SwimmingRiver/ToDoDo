import { css } from "styled-components";

/**
 * iOS Safari의 네이티브 datetime-local 위젯 보정. `&[type="datetime-local"] { ${...} }`로 쓴다.
 *
 * iOS는 이 위젯에 고유 최소 폭을 줘서 width:100%를 무시하고 화면 밖으로 넘친다
 * (시뮬레이터 실측: 다른 입력 370px일 때 400px, min-width:0으로는 안 줄어듦).
 * appearance:none만이 폭을 바로잡는다(탭 시 피커 동작은 실기기 확인 대상).
 *
 * appearance:none이면 값이 빈 칸의 높이가 0으로 줄어(26px) 한 줄 높이를 최소로 준다.
 * 1lh가 일반 텍스트 입력과 정확히 같은 높이(46px)였고, 미지원 브라우저용으로 1.2em을 먼저 둔다.
 * 가운데 정렬되는 값도 다른 입력처럼 왼쪽으로 맞춘다. appearance:none이면 iOS가 회색 배경·
 * 파란 글자로 그리므로, 다른 텍스트 입력이 쓰는 UA 기본값(Field/FieldText)을 명시한다.
 */
export const nativeDateInputReset = css`
  -webkit-appearance: none;
  appearance: none;
  background-color: Field;
  color: FieldText;

  &::-webkit-date-and-time-value {
    min-height: 1.2em;
    min-height: 1lh;
    text-align: left;
  }
`;
