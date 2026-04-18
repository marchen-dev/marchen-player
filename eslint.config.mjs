import antfu from '@antfu/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

export default antfu(
  {
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
    files: ['**/*.md'],
    rules: {
      'markdown/require-alt-text': 'off',
    },
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
