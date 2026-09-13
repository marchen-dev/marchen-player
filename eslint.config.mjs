import antfu from '@antfu/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

export default antfu(
  {
    // 历史 spike 不进入产品构建；正式回归和发布脚本仍参与检查。
    ignores: ['scripts/player-engine/experiments/**'],
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
