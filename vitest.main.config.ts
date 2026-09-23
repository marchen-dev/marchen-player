import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@marchen/sparkle-updater': resolve('packages/sparkle-updater/src/index.ts'),
      '@marchen/shared': resolve('packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts', 'scripts/web/*.test.mjs', 'scripts/desktop/*.test.mjs', 'packages/sparkle-updater/src/*.test.ts'],
  },
})
