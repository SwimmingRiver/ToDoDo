module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  // jest-expo(@react-native/jest-preset)는 customExportConditions에 "react-native"를
  // 포함시킨다. lucide-react-native의 package.json exports는 "react-native" 조건을
  // ESM(.mjs) 번들로 매핑해 두어서, 테스트 환경에서 그대로 두면
  // "Unexpected token 'export'" 파싱 에러가 난다. CJS 번들로 직접 리다이렉트한다.
  moduleNameMapper: {
    "^lucide-react-native$": "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  // react-native-calendars는 package.json의 main이 "src/index.ts"라 미컴파일 TS
  // 원본을 그대로 배포한다. 기본 transformIgnorePatterns(react-native 계열만 허용)가
  // 이 패키지를 걸러주지 않으면 "Unexpected token" 파싱 에러가 난다.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|react-native-calendars))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
