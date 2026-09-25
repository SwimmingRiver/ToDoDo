import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      }],
    },
  },
  {
    // 하드코딩 색은 다크모드에서 바뀌지 않는다. 그림자용 rgba(0,0,0,a)만 허용.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/styles/**', 'src/**/__tests__/**', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b|rgba?\\((?!\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,)/]',
          message: '하드코딩 색 금지 — @/styles의 토큰을 쓰세요',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b|rgba?\\((?!\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,)/]',
          message: '하드코딩 색 금지 — @/styles의 토큰을 쓰세요',
        },
        {
          // CSS 값 위치(속성명: 값)의 named color / hsl()·hsla()도 막는다.
          // 속성명 없이 등장하는 일반 문자열("white" 등)은 건드리지 않는다.
          selector: 'Literal[value=/\\b(color|background|background-color|fill|stroke|border|border-(top|right|bottom|left)(-color)?|outline(-color)?)\\b\\s*:\\s*[^;]{0,40}?\\b(white|black|red|green|blue|yellow|orange|gray|grey|purple|pink)\\b|hsla?\\(/i]',
          message: '하드코딩 색 금지 — @/styles의 토큰을 쓰세요',
        },
        {
          selector: 'TemplateElement[value.raw=/\\b(color|background|background-color|fill|stroke|border|border-(top|right|bottom|left)(-color)?|outline(-color)?)\\b\\s*:\\s*[^;]{0,40}?\\b(white|black|red|green|blue|yellow|orange|gray|grey|purple|pink)\\b|hsla?\\(/i]',
          message: '하드코딩 색 금지 — @/styles의 토큰을 쓰세요',
        },
        {
          // React 인라인 style 객체: style={{ color: "red" }} 같은 패턴.
          selector: 'Property[key.name=/^(color|background|backgroundColor|fill|stroke|borderColor|outlineColor)$/] > Literal[value=/^(white|black|red|green|blue|yellow|orange|gray|grey|purple|pink)$|hsla?\\(/i]',
          message: '하드코딩 색 금지 — @/styles의 토큰을 쓰세요',
        },
      ],
    },
  },
])
