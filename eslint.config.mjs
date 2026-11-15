import antfu from '@antfu/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'
import noHardcodedUiText from './scripts/eslint/no-hardcoded-ui-text.mjs'

export default antfu(
  {
    // 历史 spike 不进入产品构建；正式回归和发布脚本仍参与检查。
    // Sparkle vendor 由子目录 .gitignore 忽略、仅存在于本地（含大量调试符号 YAML），ESLint 只读根 .gitignore，需显式排除。
    // 翻译引擎胶水脚本是 Mozilla 自动生成的上游文件，原样收录、不参与检查。
    ignores: [
      'scripts/player-engine/experiments/**',
      'packages/sparkle-updater/vendor/**',
      'src/renderer/src/services/translation/vendor/**',
    ],
    stylistic: false,
    react: true,
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    // 界面多语言：renderer 与 main 的全部源码都不允许直接写中文界面文字（含中文标点；
    // 注释、日志与 Error 不受限制）。文案放进 packages/i18n，没有豁免名单。
    files: ['src/renderer/src/**/*.{ts,tsx}', 'src/main/**/*.ts'],
    ignores: ['**/*.test.*', '**/tests/**'],
    plugins: {
      marchen: { rules: { 'no-hardcoded-ui-text': noHardcodedUiText } },
    },
    rules: {
      'marchen/no-hardcoded-ui-text': 'error',
    },
  },
  {
    ignores: ['**/*.md/**', '**/*.md'],
  },
  {
    rules: {
      'ts/no-use-before-define': 'off',
      'node/prefer-global/process': 'off',
      'node/prefer-global/buffer': 'off',
      'unicorn/prefer-math-trunc': 'off',
      'package-json/valid-name': 'off',
      'react-refresh/only-export-components': 'warn',
      'no-restricted-globals': [
        'error',
        {
          name: 'location',
          message:
            "Since you don't use the same router instance in electron and browser, you can't use the global location to get the route info. \n\n" +
            'You can use `useLocaltion` or `getReadonlyRoute` to get the route info.',
        },
      ],
    },
  },
)
