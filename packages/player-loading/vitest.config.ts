import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // tests/link-source.test.ts 直接引用 renderer 的链接弹幕导入控制器，
      // 它用 `@renderer` 别名取界面文案与错误说明；这里只为测试补上别名，包的源码不依赖 renderer
      '@renderer': resolve(import.meta.dirname, '../../src/renderer/src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
