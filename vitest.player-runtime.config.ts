import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@marchen/danmaku-engine': resolve('packages/danmaku-engine/src/index.ts'),
      '@marchen/playback-core': resolve('packages/playback-core/src/index.ts'),
      '@marchen/shared': resolve('packages/shared/src'),
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
      'src/renderer/src/services/history/tests/**/*.test.ts',
      'src/renderer/src/services/media/tests/**/*.test.ts',
      'src/renderer/src/services/player-loading/**/*.test.ts',
      'src/renderer/src/services/player-runtime/tests/**/*.test.ts',
      'src/renderer/src/services/storage/tests/**/*.test.ts',
      'src/renderer/src/services/telemetry/tests/**/*.test.ts',
    ],
  },
})
