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
      ],
    },
  },
])
