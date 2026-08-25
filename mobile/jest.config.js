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
};
