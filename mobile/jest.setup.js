// react-native-safe-area-context는 실제 네이티브 SafeAreaProvider 없이는 인셋을 읽을 수
// 없어 테스트 환경에서 "No safe area value available" 경고/오류가 난다. 라이브러리가 공식
// 제공하는 테스트 목(mock)으로 전역 치환한다 — setupFiles는 각 테스트 파일의 모듈 그래프가
// 구성되기 전에 실행되므로, 여기서 부르는 jest.mock은 모든 테스트 파일에 적용된다.
jest.mock("react-native-safe-area-context", () => {
  // mock.tsx는 `export default {...}` 형태라 require()로 그대로 가져오면
  // { __esModule: true, default: {...} } 모양이 된다. 그대로 jest.mock 팩토리가
  // 반환하면 `import { SafeAreaView } from "..."` 같은 named import가 undefined가
  // 되므로, default 내용을 모듈 exports 자체로 펼쳐준다.
  const mock = require("react-native-safe-area-context/jest/mock");
  return mock.default ?? mock;
});
