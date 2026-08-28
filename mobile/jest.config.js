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
  // 원본을 그대로 배포한다. @react-native/jest-preset의 기본 transformIgnorePatterns는
  // react-native 계열만 허용하지만, jest-expo/jest-preset.js(lines ~99-119)가 런타임에
  // 이를 더 광범위한 기본값으로 대체한다(expo/@expo/react-navigation/@sentry 등).
  // 이전에는 jest.config.js에서 transformIgnorePatterns를 설정하지 않았으므로 jest-expo의
  // 광범위한 기본값이 암묵적으로 적용되고 있었다. 이제 transformIgnorePatterns를 명시적으로
  // 설정하면서(react-native-calendars 추가를 위해) jest-expo의 실제 기본값 전체를
  // 재현해야 한다. 그렇지 않으면 현재 jest-expo의 광범위한 기본값 때문에 통과하는
  // expo/react-navigation 관련 테스트들이 회귀할 수 있다.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|react-native-calendars))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
