import userEvent from '@testing-library/user-event'

/**
 * userEvent.setup()의 기본값은 클릭 등 포인터 이벤트마다 대상 엘리먼트와 그
 * 조상 전체에 getComputedStyle로 pointer-events를 검사한다(PointerEventsCheckLevel
 * .EachApiCall). 이 계산은 jsdom에서 페이지 전체 스타일시트를 상대로 이뤄져
 * DOM/스타일 규칙이 많을수록(styled-components, 아이콘이 많은 바텀시트, 캘린더
 * 그리드 등) 무거워진다. 단독 실행 시엔 안 보이다가, 여러 테스트 파일이 워커
 * 프로세스에서 동시에 CPU를 다투는 병렬 실행에서는 원래 수백 ms짜리 클릭 한 번이
 * 수 초로 늘어나 기본 testTimeout(5000ms)을 넘기는 간헐적 실패의 원인이 됐다
 * (kanbanCardMenu.test.tsx, statusSelect.test.tsx).
 *
 * 이 프로젝트 테스트는 pointer-events:none으로 가려진 엘리먼트를 클릭하는
 * 시나리오를 검증하지 않으므로, 검사를 끄고 실제 클릭 동작만 확인한다.
 */
export const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 })
