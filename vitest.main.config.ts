import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@marchen/sparkle-updater': resolve('packages/sparkle-updater/src/index.ts'),
      '@marchen/shared': resolve('packages/shared/src'),
      '@marchen/i18n': resolve('packages/i18n/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    // 测试专用地址，不读取开发者本地 .env，也不发真实请求。
    env: {
      VITE_API_CLOUDFLARE_URL: 'https://cloudflare.example.invalid/api/v2',
      VITE_API_EDGEONE_URL: 'https://edgeone.example.invalid/api/v2',
    },
    include: [
      'src/main/**/*.test.ts',
      'scripts/web/*.test.mjs',
      'scripts/desktop/*.test.mjs',
      'scripts/eslint/*.test.mjs',
      'packages/sparkle-updater/src/*.test.ts',
      'packages/i18n/tests/**/*.test.ts',
      'packages/shared/src/**/*.test.ts',
      'packages/electron-ipc/src/**/*.test.ts',
      'scripts/i18n/*.test.mjs',
    ],
  },
})
