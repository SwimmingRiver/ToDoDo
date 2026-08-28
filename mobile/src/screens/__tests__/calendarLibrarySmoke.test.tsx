import { render } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import { Calendar, LocaleConfig } from "react-native-calendars";

// CalendarScreen.test.tsx는 이 파일과 별개로 react-native-calendars를 jest.mock으로
// 스텁 처리한다(그 화면 테스트는 onDayPress 배선만 검증하면 충분해서다). 하지만 그
// 결과로 스위트 전체에서 실제 라이브러리를 렌더링하는 테스트가 하나도 남지 않게
// 되어, jest.config.js의 transformIgnorePatterns 수정(react-native-calendars가
// 미컴파일 TS를 그대로 배포하기 때문에 필요)이 회귀해도 잡아낼 테스트가 없었다.
// jest.mock은 파일 단위로 격리되므로, jest.mock을 호출하지 않는 이 파일은 실제
// 라이브러리를 사용한다 — 그 회귀 가드 역할을 한다.
//
// useCalendarTodos는 여기서 실제 구현이 아니라 스텁으로 대체한다: 실제 구현은
// useTodos → @tododo/core(packages/core/dist, monorepo file: 의존성)까지 이어지는데,
// 이 워크스페이스의 Jest/Babel 설정에서는 packages/core/dist 산출물이 참조하는
// @babel/runtime 헬퍼를 그 파일 위치 기준으로 resolve하지 못해(모노레포의
// packages/core에는 자체 node_modules가 없음) "Cannot find module
// '@babel/runtime/helpers/interopRequireDefault'"로 실패한다 — 이 스모크 테스트가
// 검증하려는 대상(모듈 스코프의 LocaleConfig 등록)과는 무관한, 기존부터 있던 별개의
// 모노레포 모듈 해석 갭이다(CalendarScreen.test.tsx를 포함해 기존 테스트들은 전부
// useCalendarTodos나 useTodos를 mock해서 이 경로를 우회해왔다). LocaleConfig 등록은
// CalendarScreen.tsx 모듈 최상단(훅 호출 이전)에서 일어나므로 이 mock은 검증
// 대상에 영향을 주지 않는다.
jest.mock("../../hooks/useCalendarTodos", () => ({
  useCalendarTodos: () => ({
    markedDates: {},
    isLoading: false,
    isError: false,
    getTodosForDate: () => [],
    toggleDone: jest.fn(),
  }),
}));

describe("react-native-calendars 로딩/로케일 스모크 테스트", () => {
  it("실제 Calendar 컴포넌트를 오류 없이 렌더링한다(Jest transformIgnorePatterns 회귀 가드)", async () => {
    const result = await render(<Calendar />);
    expect(result.toJSON()).toBeTruthy();
  });

  it("CalendarScreen을 import하면 한국어 로케일이 등록된다", async () => {
    await import("../CalendarScreen");
    expect(LocaleConfig.locales.ko).toBeTruthy();
    expect(LocaleConfig.defaultLocale).toBe("ko");
  });
});
