import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@marchen/shared': resolve('packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts'],
  },
})
