import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@marchen/danmaku-engine': resolve('packages/danmaku-engine/src/index.ts'),
      '@marchen/playback-core': resolve('packages/playback-core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/renderer/src/services/player-runtime/tests/**/*.test.ts'],
  },
})
